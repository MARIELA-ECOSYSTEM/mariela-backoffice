import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, MessageSquareText, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/common/states";
import { useLiberarReenvioWhatsapp, useMensagemWhatsapp } from "@/hooks/use-whatsapp-oficial";
import { mensagemDeErro } from "@/services/api/client";
import { ROTULO_ORIGEM_MENSAGEM, ofereceLiberacao } from "@/services/whatsapp/envio-oficial";
import { LIMITES_WHATSAPP_OFICIAL, type MensagemWhatsapp } from "@/types/whatsapp-oficial";
import { formatarDataHora } from "@/utils/format";
import { Aviso, EstadoMensagemBadge, Rotulo } from "./comum";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <Rotulo>{rotulo}</Rotulo>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

/**
 * Detalhes de UMA mensagem (dados do backend, sem texto e com telefone mascarado) e a liberação MANUAL de reenvio.
 * Liberar não reenvia nada: só autoriza, no backend, que um NOVO envio (nova chave) seja feito depois, pela ficha do
 * cliente. Para `indeterminada`, o backend exige a confirmação explícita do risco de duplicidade e 24 h de espera.
 */
export function DetalheMensagemDialog({
  mensagemId,
  nomeCliente,
  onOpenChange,
}: {
  mensagemId: string | null;
  nomeCliente: (clienteId: string) => string | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const consulta = useMensagemWhatsapp(mensagemId);
  const m = consulta.data;

  return (
    <Dialog open={mensagemId !== null} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl">
            <MessageSquareText aria-hidden className="size-6 text-primary" />
            Detalhes da mensagem
          </DialogTitle>
          <DialogDescription>
            Informações registradas no backend para esta mensagem.
          </DialogDescription>
        </DialogHeader>

        {consulta.isPending ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 aria-hidden className="size-6 animate-spin" />
          </div>
        ) : consulta.isError ? (
          <ErrorState error={consulta.error} onRetry={() => void consulta.refetch()} />
        ) : m ? (
          <div className="space-y-4" data-testid="detalhe-mensagem">
            <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5 sm:grid-cols-2">
              <Campo rotulo="Cliente">
                {nomeCliente(m.destinatario.id) ?? "Cliente não encontrado no cadastro"}
                <span className="block text-xs text-muted-foreground">
                  {m.destinatario.telefoneMascarado}
                </span>
              </Campo>
              <Campo rotulo="Estado">
                <EstadoMensagemBadge estado={m.estado} />
              </Campo>
              {m.template ? (
                <Campo rotulo="Modelo">
                  {m.template.chave}
                  <span className="block text-xs text-muted-foreground">
                    {m.template.categoria}
                  </span>
                </Campo>
              ) : (
                <Campo rotulo="Tipo">Texto livre (janela de 24 h)</Campo>
              )}
              <Campo rotulo="Origem">{ROTULO_ORIGEM_MENSAGEM[m.origem]}</Campo>
              <Campo rotulo="Criada em">{formatarDataHora(m.criadoEm)}</Campo>
              <Campo rotulo="Atualizada em">{formatarDataHora(m.atualizadoEm)}</Campo>
              {m.campanha ? (
                <Campo rotulo="Campanha">
                  {m.campanha.tipo === "ANIVERSARIO" ? "Aniversário" : m.campanha.tipo} ·{" "}
                  {m.campanha.ano}
                </Campo>
              ) : null}
            </div>

            {m.texto !== null ? (
              <Campo rotulo="Texto enviado">
                <span
                  data-testid="detalhe-texto"
                  className="block whitespace-pre-wrap rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm"
                >
                  {m.texto}
                </span>
              </Campo>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-4">
              <Campo rotulo="Aceita">{m.aceitaEm ? formatarDataHora(m.aceitaEm) : "—"}</Campo>
              <Campo rotulo="Entregue">{m.entregueEm ? formatarDataHora(m.entregueEm) : "—"}</Campo>
              <Campo rotulo="Lida">{m.lidaEm ? formatarDataHora(m.lidaEm) : "—"}</Campo>
              <Campo rotulo="Falha">{m.falhaEm ? formatarDataHora(m.falhaEm) : "—"}</Campo>
            </div>

            {m.erro ? (
              <Aviso
                tom={m.estado === "indeterminada" ? "advertencia" : "erro"}
                titulo={`Erro: ${m.erro.codigo}`}
              >
                {m.erro.mensagem}
              </Aviso>
            ) : null}

            {m.liberacao ? (
              <Aviso
                tom="informacao"
                titulo={`Reenvio liberado em ${formatarDataHora(m.liberacao.em)}`}
              >
                {m.liberacao.motivo ? `Motivo: ${m.liberacao.motivo}. ` : ""}
                Um novo envio, se desejado, deve ser feito pela ficha do cliente (WhatsApp oficial).
              </Aviso>
            ) : null}

            {ofereceLiberacao(m) ? <LiberarReenvio mensagem={m} /> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LiberarReenvio({ mensagem }: { mensagem: MensagemWhatsapp }) {
  const liberar = useLiberarReenvioWhatsapp();
  const [motivo, setMotivo] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const emAndamento = useRef(false);
  const indeterminada = mensagem.estado === "indeterminada";

  useEffect(() => {
    setMotivo("");
    setConfirmo(false);
  }, [mensagem.id]);

  const motivoLimpo = motivo.trim();
  const motivoValido =
    motivoLimpo.length >= LIMITES_WHATSAPP_OFICIAL.motivoLiberacaoMin &&
    motivoLimpo.length <= LIMITES_WHATSAPP_OFICIAL.motivoLiberacaoMax;

  async function confirmar() {
    if (emAndamento.current) return;
    emAndamento.current = true;
    try {
      await liberar.mutateAsync({
        id: mensagem.id,
        payload: {
          motivo: motivoLimpo,
          ...(indeterminada ? { confirmoRiscoDeDuplicidade: confirmo } : {}),
        },
      });
      toast.success(
        "Reenvio liberado. Nada foi enviado: faça o novo envio pela ficha do cliente, se desejar.",
      );
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível liberar o reenvio."));
    } finally {
      emAndamento.current = false;
    }
  }

  return (
    <section
      aria-label="Liberar reenvio"
      className="space-y-3 rounded-lg border border-warning/40 p-3"
    >
      <Aviso titulo="Liberação manual de reenvio — risco de duplicidade">
        {indeterminada
          ? "Não se sabe se esta mensagem chegou ao cliente: ela PODE ter sido enviada. Liberar não prova que não foi. Só libere depois de pelo menos 24 h e se aceitar que o cliente pode receber a mensagem duas vezes."
          : "A liberação permite UM novo envio desta mensagem para o cliente. Nada é reenviado automaticamente."}
      </Aviso>
      <div className="space-y-1.5">
        <Label htmlFor="motivo-liberacao">Motivo da liberação</Label>
        <Textarea
          id="motivo-liberacao"
          rows={3}
          maxLength={LIMITES_WHATSAPP_OFICIAL.motivoLiberacaoMax}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Mínimo de {LIMITES_WHATSAPP_OFICIAL.motivoLiberacaoMin} caracteres.
        </p>
      </div>
      {indeterminada ? (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox
            checked={confirmo}
            onCheckedChange={(v) => setConfirmo(v === true)}
            aria-label="Confirmo o risco de duplicidade"
          />
          <span>Entendo que o cliente pode receber esta mensagem duas vezes.</span>
        </label>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={liberar.isPending || !motivoValido || (indeterminada && !confirmo)}
          onClick={() => void confirmar()}
        >
          {liberar.isPending ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Unlock aria-hidden className="size-4" />
          )}
          Liberar reenvio
        </Button>
      </div>
    </section>
  );
}
