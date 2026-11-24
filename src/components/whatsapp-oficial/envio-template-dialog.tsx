import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/common/states";
import {
  useAtualizarAposEnvio,
  useBloqueioClienteWhatsapp,
  usePreviaTemplateWhatsapp,
  useTemplatesWhatsapp,
} from "@/hooks/use-whatsapp-oficial";
import { whatsappOficialApi } from "@/services/api/whatsapp-oficial.api";
import {
  ROTULO_APROVACAO_TEMPLATE,
  enviarIntencao,
  lerEnvioPendente,
  novoEnvioPendente,
  templateDisponivel,
  verificarEnvioPendente,
  type DesfechoVerificacao,
  type EnvioPendente,
} from "@/services/whatsapp/envio-oficial";
import { formatarDataHora } from "@/utils/format";
import { BloqueioClientePainel } from "./bloqueio-cliente-painel";
import { AprovacaoTemplateBadge, Aviso, EstadoMensagemBadge, Rotulo } from "./comum";

export interface ClienteEnvioOficial {
  id: string;
  nome: string;
}

/**
 * Fase 22.8.9.10.6 — envio OFICIAL (template da Meta) para UM cliente cadastrado:
 *   template disponível → prévia do backend com os dados do cliente → confirmação → envio com chave de idempotência →
 *   resultado devolvido pelo backend.
 *
 * O destinatário é sempre o `id` do cliente (o backend resolve e normaliza o telefone do cadastro); não há campo de
 * número nem de texto. A chave nasce na primeira confirmação de uma intenção e é REUTILIZADA enquanto o resultado
 * dela for desconhecido (inclusive depois de fechar e reabrir, pelo registro local).
 */
export function EnvioTemplateDialog({
  cliente,
  onOpenChange,
}: {
  cliente: ClienteEnvioOficial | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const aberto = cliente !== null;
  const templates = useTemplatesWhatsapp({ habilitado: aberto });
  const bloqueio = useBloqueioClienteWhatsapp(cliente?.id ?? null);
  const atualizarAposEnvio = useAtualizarAposEnvio();

  const [templateChave, setTemplateChave] = useState<string | null>(null);
  const [pendente, setPendente] = useState<EnvioPendente | null>(null);
  const [resultado, setResultado] = useState<DesfechoVerificacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const emAndamento = useRef(false);

  const previa = usePreviaTemplateWhatsapp(
    templateChave !== null && pendente === null && resultado === null ? templateChave : null,
    cliente?.id ?? null,
  );

  useEffect(() => {
    setTemplateChave(null);
    setResultado(null);
    setPendente(cliente ? lerEnvioPendente(cliente.id) : null);
  }, [cliente]);

  const individuais = useMemo(
    () => (templates.data ?? []).filter((t) => t.usoPermitido.includes("INDIVIDUAL")),
    [templates.data],
  );
  const selecionado = individuais.find((t) => t.chave === templateChave) ?? null;
  const bloqueado = bloqueio.data?.bloqueado === true;
  const semTelefone = bloqueio.data?.telefoneMascarado === null;
  const podeEnviar =
    selecionado !== null &&
    templateDisponivel(selecionado, "INDIVIDUAL") &&
    previa.isSuccess &&
    !bloqueado &&
    !semTelefone &&
    pendente === null &&
    !enviando;

  function concluir(d: DesfechoVerificacao) {
    setResultado(d);
    setPendente(
      d.tipo === "falha" && d.falha.tipo === "desconhecido" && cliente
        ? lerEnvioPendente(cliente.id)
        : null,
    );
    atualizarAposEnvio();
  }

  async function confirmarEnvio() {
    if (!cliente || !selecionado || emAndamento.current) return;
    emAndamento.current = true;
    setEnviando(true);
    try {
      const intencao = novoEnvioPendente(cliente.id, selecionado.chave, null);
      setPendente(null);
      concluir(await enviarIntencao(whatsappOficialApi, intencao));
    } finally {
      emAndamento.current = false;
      setEnviando(false);
    }
  }

  async function verificar() {
    if (!pendente || emAndamento.current) return;
    emAndamento.current = true;
    setEnviando(true);
    try {
      concluir(await verificarEnvioPendente(whatsappOficialApi, pendente));
    } finally {
      emAndamento.current = false;
      setEnviando(false);
    }
  }

  function fechar(proximo: boolean) {
    if (!proximo && emAndamento.current) return; // nunca fecha com um envio em andamento
    onOpenChange(proximo);
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl">
            <ShieldCheck aria-hidden className="size-6 text-success" />
            WhatsApp oficial
          </DialogTitle>
          <DialogDescription>
            Mensagem por modelo aprovado pela Meta para {cliente?.nome}. O número é o do cadastro do
            cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pendente ? (
            <Aviso titulo="Envio anterior sem confirmação" testId="aviso-envio-pendente">
              Um envio do modelo “{pendente.template}” iniciado em{" "}
              {formatarDataHora(pendente.criadoEm)} não teve resposta conclusiva. Antes de qualquer
              novo envio, verifique o resultado: a verificação consulta o histórico e repete a MESMA
              solicitação (mesma chave), sem risco de duplicar a mensagem.
            </Aviso>
          ) : null}

          {resultado ? <ResultadoEnvio resultado={resultado} /> : null}

          {!resultado && pendente === null ? (
            <>
              {templates.isPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 aria-hidden className="size-4 animate-spin" /> Carregando modelos…
                </div>
              ) : templates.isError ? (
                <ErrorState
                  error={templates.error}
                  onRetry={() => void templates.refetch()}
                  fallback="Não foi possível carregar os modelos."
                />
              ) : individuais.length === 0 ? (
                <Aviso tom="informacao">Nenhum modelo do catálogo permite envio individual.</Aviso>
              ) : (
                <div className="space-y-1.5">
                  <Rotulo>Modelo de mensagem</Rotulo>
                  <Select value={templateChave ?? ""} onValueChange={(v) => setTemplateChave(v)}>
                    <SelectTrigger aria-label="Modelo de mensagem">
                      <SelectValue placeholder="Escolha um modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {individuais.map((t) => (
                        <SelectItem
                          key={t.chave}
                          value={t.chave}
                          disabled={!templateDisponivel(t, "INDIVIDUAL")}
                        >
                          {t.chave} · {t.categoria === "MARKETING" ? "Marketing" : "Utilidade"} ·{" "}
                          {ROTULO_APROVACAO_TEMPLATE[t.estadoAprovacao]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {individuais.every((t) => !templateDisponivel(t, "INDIVIDUAL")) ? (
                    <Aviso tom="informacao">
                      Nenhum modelo está com aprovação confirmada pelo provedor agora. Sem essa
                      confirmação, o backend não envia.
                    </Aviso>
                  ) : null}
                </div>
              )}

              {selecionado ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Rotulo>Prévia com os dados do cliente</Rotulo>
                    <AprovacaoTemplateBadge estado={selecionado.estadoAprovacao} />
                  </div>
                  {previa.isPending ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 aria-hidden className="size-4 animate-spin" /> Gerando prévia…
                    </div>
                  ) : previa.isError ? (
                    <ErrorState
                      error={previa.error}
                      onRetry={() => void previa.refetch()}
                      fallback="Não foi possível gerar a prévia."
                    />
                  ) : (
                    <p
                      data-testid="previa-template"
                      className="whitespace-pre-wrap rounded-lg border border-success/25 bg-success/[0.06] px-3 py-2.5 text-sm text-foreground"
                    >
                      {previa.data.texto}
                    </p>
                  )}
                  {selecionado.categoria === "MARKETING" ? (
                    <p className="text-xs text-muted-foreground">
                      Modelo de marketing: envie só para quem aceitou receber mensagens da loja.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {bloqueado ? (
                <Aviso tom="erro" titulo="Contato bloqueado">
                  Este número pediu para não receber mensagens de WhatsApp. O envio não é permitido.
                </Aviso>
              ) : null}
            </>
          ) : null}

          {cliente ? <BloqueioClientePainel clienteId={cliente.id} /> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={enviando} onClick={() => fechar(false)}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {pendente ? (
            <Button type="button" disabled={enviando} onClick={() => void verificar()}>
              {enviando ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <RefreshCw aria-hidden className="size-4" />
              )}
              Verificar resultado
            </Button>
          ) : !resultado ? (
            <Button type="button" disabled={!podeEnviar} onClick={() => void confirmarEnvio()}>
              {enviando ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Send aria-hidden className="size-4" />
              )}
              {enviando ? "Enviando…" : "Confirmar envio"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resultado exatamente como o backend devolveu — o estado nunca é presumido pela interface. */
export function ResultadoEnvio({ resultado }: { resultado: DesfechoVerificacao }) {
  if (resultado.tipo === "registrada" || resultado.tipo === "encontrada") {
    const m = resultado.mensagem;
    const repetida = resultado.tipo === "encontrada" || resultado.repetida === true;
    return (
      <div
        data-testid="resultado-envio"
        data-resultado={m.estado}
        className="space-y-2 rounded-lg border border-border p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Rotulo>Situação registrada no backend</Rotulo>
          <EstadoMensagemBadge estado={m.estado} />
        </div>
        {repetida ? (
          <p className="text-sm text-muted-foreground">
            Esta solicitação já estava registrada: nada foi reenviado. A situação acima é a do
            registro existente.
          </p>
        ) : null}
        {m.erro ? <p className="text-sm text-destructive">{m.erro.mensagem}</p> : null}
        {m.estado === "aceita" ? (
          <p className="text-xs text-muted-foreground">
            “Aceita” significa que o WhatsApp recebeu o pedido; a entrega é confirmada depois.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Telefone: {m.destinatario.telefoneMascarado}
        </p>
      </div>
    );
  }
  const falha = resultado.falha;
  if (resultado.tipo === "nao_enviada") {
    return (
      <Aviso tom="erro" titulo="A mensagem não foi enviada" testId="resultado-envio">
        Não há registro desta solicitação no histórico e o backend recusou processá-la:{" "}
        {falha.mensagem}
      </Aviso>
    );
  }
  if (falha.tipo === "desconhecido") {
    return (
      <Aviso titulo="Resultado desconhecido" testId="resultado-envio">
        {falha.mensagem}
      </Aviso>
    );
  }
  return (
    <Aviso tom="erro" titulo="Envio recusado — nada foi enviado" testId="resultado-envio">
      {falha.mensagem}
    </Aviso>
  );
}
