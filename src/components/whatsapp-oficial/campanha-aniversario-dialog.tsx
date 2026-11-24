import { useEffect, useMemo, useRef, useState } from "react";
import { Cake, Loader2, Octagon, Play, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/common/states";
import {
  useAtualizarAposEnvio,
  usePreviaTemplateWhatsapp,
  useTemplatesWhatsapp,
} from "@/hooks/use-whatsapp-oficial";
import { whatsappOficialApi } from "@/services/api/whatsapp-oficial.api";
import {
  ROTULO_APROVACAO_TEMPLATE,
  executarCampanha,
  jaDecidido,
  templateDisponivel,
  type FalhaEnvio,
  type MotivoFimCampanha,
  type SituacaoItemCampanha,
} from "@/services/whatsapp/envio-oficial";
import type { Cliente } from "@/types/cliente";
import {
  PERIODOS_ANIVERSARIO,
  aniversarioNoPeriodo,
  diaMesNascimento,
  diasAteAniversario,
  numeroWhatsapp,
  type PeriodoAniversario,
} from "@/utils/cliente";
import { AprovacaoTemplateBadge, Aviso, EstadoMensagemBadge, Rotulo } from "./comum";

type Etapa = "selecao" | "confirmacao" | "execucao";

/**
 * Fase 22.8.9.10.6 — campanha de aniversário pelo WhatsApp OFICIAL. Não há rota de campanha no backend: o contrato é
 * UM envio por cliente (`POST /envios` com `campanha: { tipo: "ANIVERSARIO" }`), e o backend garante no máximo UMA
 * mensagem de campanha por cliente e por ano. Aqui:
 *   seleção → prévia → confirmação explícita (marketing/opt-in) → execução sequencial com progresso.
 * Nada é enviado sem o clique de confirmação; não há agendamento nem envio automático. "Interromper" para antes do
 * próximo cliente; qualquer resultado desconhecido ou recusa geral PAUSA a campanha (nunca repete sozinho).
 */
export function CampanhaAniversarioDialog({
  open,
  onOpenChange,
  clientes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientes: Cliente[];
}) {
  const templates = useTemplatesWhatsapp({ habilitado: open });
  const atualizarAposEnvio = useAtualizarAposEnvio();
  const [etapa, setEtapa] = useState<Etapa>("selecao");
  const [periodo, setPeriodo] = useState<PeriodoAniversario>("hoje");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [templateChave, setTemplateChave] = useState<string | null>(null);
  const [aceiteOptIn, setAceiteOptIn] = useState(false);
  const [situacoes, setSituacoes] = useState<Record<string, SituacaoItemCampanha>>({});
  const [fim, setFim] = useState<{ motivo: MotivoFimCampanha; falha: FalhaEnvio | null } | null>(
    null,
  );
  const [executando, setExecutando] = useState(false);
  const [parando, setParando] = useState(false);
  const pararRef = useRef(false);
  const executandoRef = useRef(false);

  const deCampanha = useMemo(
    () => (templates.data ?? []).filter((t) => t.usoPermitido.includes("CAMPANHA_ANIVERSARIO")),
    [templates.data],
  );
  const template = deCampanha.find((t) => t.chave === templateChave) ?? null;
  const templateOk = template !== null && templateDisponivel(template, "CAMPANHA_ANIVERSARIO");

  const porPeriodo = useMemo(() => {
    const mapa = {} as Record<PeriodoAniversario, Cliente[]>;
    for (const { valor } of PERIODOS_ANIVERSARIO) {
      mapa[valor] = clientes
        .filter((c) => aniversarioNoPeriodo(c.dataNascimento, valor))
        .sort(
          (a, b) =>
            diasAteAniversario(a.dataNascimento) - diasAteAniversario(b.dataNascimento) ||
            a.nome.localeCompare(b.nome, "pt-BR"),
        );
    }
    return mapa;
  }, [clientes]);
  const lista = porPeriodo[periodo] ?? [];
  const elegiveis = lista.filter((c) => numeroWhatsapp(c) !== "");
  const alvos = elegiveis.filter((c) => selecionados.includes(c.id));
  const amostra = alvos[0] ?? null;
  const previa = usePreviaTemplateWhatsapp(
    etapa !== "execucao" && templateOk && amostra ? (templateChave ?? null) : null,
    amostra?.id ?? null,
  );

  useEffect(() => {
    if (!open) return;
    setEtapa("selecao");
    setPeriodo("hoje");
    setSelecionados([]);
    setAceiteOptIn(false);
    setSituacoes({});
    setFim(null);
  }, [open]);

  useEffect(() => {
    if (templateChave === null && deCampanha.length === 1)
      setTemplateChave(deCampanha[0]?.chave ?? null);
  }, [deCampanha, templateChave]);

  useEffect(() => setSelecionados([]), [periodo]);

  async function executar() {
    if (executandoRef.current || !template || alvos.length === 0) return;
    executandoRef.current = true;
    pararRef.current = false;
    setParando(false);
    setExecutando(true);
    setEtapa("execucao");
    setFim(null);
    try {
      const resultado = await executarCampanha({
        api: whatsappOficialApi,
        itens: alvos.map((c) => ({ clienteId: c.id, nome: c.nome })),
        template: template.chave,
        situacoesIniciais: situacoes,
        deveParar: () => pararRef.current,
        aoAtualizar: (id, s) => setSituacoes((atual) => ({ ...atual, [id]: s })),
      });
      setFim({ motivo: resultado.motivo, falha: resultado.falha });
    } finally {
      executandoRef.current = false;
      setExecutando(false);
      atualizarAposEnvio();
    }
  }

  function fechar(proximo: boolean) {
    if (!proximo && executandoRef.current) return; // nunca fecha no meio da campanha: use "Interromper"
    onOpenChange(proximo);
  }

  const concluidos = alvos.filter((c) => jaDecidido(situacoes[c.id])).length;
  const restantes = alvos.filter((c) => !jaDecidido(situacoes[c.id])).length;

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Cake aria-hidden className="size-6" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-display text-3xl">
                Campanha de aniversário (oficial)
              </DialogTitle>
              <DialogDescription>
                Modelo aprovado pela Meta, enviado pelo backend. No máximo uma mensagem de campanha
                por cliente por ano.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {etapa === "selecao" ? (
          <div className="space-y-4">
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
            ) : deCampanha.length === 0 ? (
              <Aviso tom="informacao">
                Nenhum modelo do catálogo permite a campanha de aniversário.
              </Aviso>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Rotulo>Modelo</Rotulo>
                <Select value={templateChave ?? ""} onValueChange={setTemplateChave}>
                  <SelectTrigger aria-label="Modelo da campanha" className="w-80">
                    <SelectValue placeholder="Escolha um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {deCampanha.map((t) => (
                      <SelectItem
                        key={t.chave}
                        value={t.chave}
                        disabled={!templateDisponivel(t, "CAMPANHA_ANIVERSARIO")}
                      >
                        {t.chave} · {ROTULO_APROVACAO_TEMPLATE[t.estadoAprovacao]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {template ? <AprovacaoTemplateBadge estado={template.estadoAprovacao} /> : null}
              </div>
            )}
            {template && !templateOk ? (
              <Aviso tom="informacao">
                A aprovação deste modelo não está confirmada pelo provedor agora. Sem ela, o backend
                não envia.
              </Aviso>
            ) : null}

            <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoAniversario)}>
              <TabsList className="w-full">
                {PERIODOS_ANIVERSARIO.map(({ valor, label }) => (
                  <TabsTrigger key={valor} value={valor} className="flex-1">
                    {label} ({porPeriodo[valor]?.length ?? 0})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="grid gap-4 md:grid-cols-2">
              <section
                className="overflow-hidden rounded-xl border border-border"
                aria-label="Aniversariantes"
              >
                <header className="flex items-center justify-between gap-2 border-b border-border bg-surface/60 px-3 py-2.5">
                  <p className="text-sm font-medium text-foreground">
                    Aniversariantes ({lista.length})
                  </p>
                  {elegiveis.length > 0 ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={elegiveis.length > 0 && alvos.length === elegiveis.length}
                        onCheckedChange={(v) =>
                          setSelecionados(v === true ? elegiveis.map((c) => c.id) : [])
                        }
                        aria-label="Selecionar todos"
                      />
                      Selecionar todos
                    </label>
                  ) : null}
                </header>
                {lista.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum aniversariante neste período.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1 overflow-y-auto p-2">
                    {lista.map((c) => {
                      const semTelefone = numeroWhatsapp(c) === "";
                      return (
                        <li key={c.id}>
                          <label
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 ${semTelefone ? "opacity-60" : "cursor-pointer hover:bg-surface/60"}`}
                          >
                            <Checkbox
                              checked={selecionados.includes(c.id)}
                              disabled={semTelefone}
                              aria-label={`Selecionar ${c.nome}`}
                              onCheckedChange={() =>
                                setSelecionados((a) =>
                                  a.includes(c.id) ? a.filter((x) => x !== c.id) : [...a, c.id],
                                )
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-foreground">
                                {c.nome}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {diaMesNascimento(c.dataNascimento)}{" "}
                                {semTelefone ? "· sem telefone" : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section
                className="space-y-2 rounded-xl border border-border p-3"
                aria-label="Prévia da campanha"
              >
                <Rotulo>Prévia{amostra ? ` (com os dados de ${amostra.nome})` : ""}</Rotulo>
                {!templateOk ? (
                  <p className="text-sm text-muted-foreground">Escolha um modelo aprovado.</p>
                ) : !amostra ? (
                  <p className="text-sm text-muted-foreground">
                    Selecione ao menos um cliente para ver a prévia.
                  </p>
                ) : previa.isPending ? (
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
                    data-testid="previa-campanha"
                    className="whitespace-pre-wrap rounded-lg border border-success/25 bg-success/[0.06] px-3 py-2.5 text-sm"
                  >
                    {previa.data.texto}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Cada cliente recebe a mensagem com o próprio nome.
                </p>
              </section>
            </div>
          </div>
        ) : null}

        {etapa === "confirmacao" ? (
          <div className="space-y-4">
            <Aviso titulo="Confirme antes de iniciar">
              Serão enviadas até {alvos.length} mensagem(ns) de MARKETING com o modelo “
              {template?.chave}”, uma por cliente, pelo WhatsApp oficial. Clientes bloqueados ou que
              já receberam a campanha neste ano são recusados pelo backend. A campanha não se repete
              sozinha e pode ser interrompida entre um envio e outro.
            </Aviso>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={aceiteOptIn}
                onCheckedChange={(v) => setAceiteOptIn(v === true)}
                aria-label="Confirmo o opt-in"
              />
              <span>
                Confirmo que os clientes selecionados autorizaram receber mensagens de marketing da
                loja pelo WhatsApp (opt-in) e que a mensagem informa como deixar de recebê-las.
              </span>
            </label>
          </div>
        ) : null}

        {etapa === "execucao" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span data-testid="progresso-campanha">
                  {concluidos} de {alvos.length} com resultado
                </span>
                {executando ? <span className="text-muted-foreground">Enviando…</span> : null}
              </div>
              <Progress value={alvos.length ? (concluidos / alvos.length) * 100 : 0} />
            </div>
            {fim ? (
              <FimCampanha motivo={fim.motivo} falha={fim.falha} restantes={restantes} />
            ) : null}
            <ul
              className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border"
              aria-label="Andamento da campanha"
            >
              {alvos.map((c) => (
                <li
                  key={c.id}
                  data-cliente-id={c.id}
                  data-situacao={situacoes[c.id]?.tipo ?? "aguardando"}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">{c.nome}</span>
                  <SituacaoItem s={situacoes[c.id]} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          {etapa === "selecao" ? (
            <>
              <Button type="button" variant="outline" onClick={() => fechar(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!templateOk || alvos.length === 0 || !previa.isSuccess}
                onClick={() => setEtapa("confirmacao")}
              >
                Revisar envio ({alvos.length})
              </Button>
            </>
          ) : etapa === "confirmacao" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setEtapa("selecao")}>
                Voltar
              </Button>
              <Button
                type="button"
                disabled={!aceiteOptIn || executando}
                onClick={() => void executar()}
              >
                <Send aria-hidden className="size-4" /> Iniciar campanha ({alvos.length})
              </Button>
            </>
          ) : executando ? (
            <Button
              type="button"
              variant="destructive"
              disabled={parando}
              onClick={() => {
                pararRef.current = true;
                setParando(true);
              }}
            >
              <Octagon aria-hidden className="size-4" />{" "}
              {parando ? "Interrompendo…" : "Interromper"}
            </Button>
          ) : (
            <>
              {fim && fim.motivo !== "concluida" && restantes > 0 ? (
                <Button type="button" variant="outline" onClick={() => void executar()}>
                  <Play aria-hidden className="size-4" /> Continuar com os restantes ({restantes})
                </Button>
              ) : null}
              <Button type="button" onClick={() => fechar(false)}>
                Fechar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FimCampanha({
  motivo,
  falha,
  restantes,
}: {
  motivo: MotivoFimCampanha;
  falha: FalhaEnvio | null;
  restantes: number;
}) {
  if (motivo === "concluida") {
    return (
      <Aviso tom="informacao" titulo="Campanha concluída" testId="fim-campanha">
        Todos os clientes selecionados têm um resultado.
      </Aviso>
    );
  }
  if (motivo === "interrompida") {
    return (
      <Aviso titulo="Campanha interrompida" testId="fim-campanha">
        Nenhum envio foi feito depois da interrupção. {restantes} cliente(s) ficaram sem envio.
      </Aviso>
    );
  }
  return (
    <Aviso
      tom={falha?.tipo === "desconhecido" ? "advertencia" : "erro"}
      titulo="Campanha pausada"
      testId="fim-campanha"
    >
      {falha?.mensagem} {restantes > 0 ? `${restantes} cliente(s) ainda sem envio.` : ""}
    </Aviso>
  );
}

function SituacaoItem({ s }: { s: SituacaoItemCampanha | undefined }) {
  if (!s || s.tipo === "aguardando") return <Badge variant="outline">Aguardando</Badge>;
  switch (s.tipo) {
    case "enviando":
      return (
        <Badge variant="outline">
          <Loader2 aria-hidden className="size-3 animate-spin" /> Enviando
        </Badge>
      );
    case "registrada":
      return (
        <span className="flex items-center gap-1.5">
          {s.repetida ? <span className="text-xs text-muted-foreground">já registrada</span> : null}
          <EstadoMensagemBadge estado={s.mensagem.estado} />
        </span>
      );
    case "falha":
      return (
        <span className="max-w-[60%] text-right text-xs" title={s.falha.mensagem}>
          <Badge variant={s.falha.tipo === "desconhecido" ? "warning" : "destructive"}>
            {s.falha.tipo === "desconhecido" ? "Resultado desconhecido" : "Não enviada"}
          </Badge>
          <span className="block text-muted-foreground">{s.falha.mensagem}</span>
        </span>
      );
    case "pendencia_anterior":
      return (
        <span className="max-w-[60%] text-right text-xs">
          <Badge variant="warning">Envio anterior sem confirmação</Badge>
          <span className="block text-muted-foreground">
            Verifique pela ficha do cliente antes de enviar de novo.
          </span>
        </span>
      );
    case "nao_executado":
      return <Badge variant="outline">Não enviada (interrompida)</Badge>;
  }
}
