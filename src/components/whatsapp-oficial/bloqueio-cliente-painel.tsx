import { useRef, useState } from "react";
import { Ban, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/common/states";
import {
  useBloquearClienteWhatsapp,
  useBloqueioClienteWhatsapp,
  useDesbloquearClienteWhatsapp,
} from "@/hooks/use-whatsapp-oficial";
import { mensagemDeErro } from "@/services/api/client";
import { ROTULO_ORIGEM_BLOQUEIO } from "@/services/whatsapp/envio-oficial";
import { LIMITES_WHATSAPP_OFICIAL } from "@/types/whatsapp-oficial";
import { formatarDataHora } from "@/utils/format";
import { Aviso, Rotulo } from "./comum";

/**
 * Situação de bloqueio (opt-out) do número ATUAL do cliente, com bloquear/desbloquear pelo contrato do backend:
 * bloquear com motivo opcional; desbloquear SEMPRE com motivo (o histórico do bloqueio é preservado no backend).
 * Nunca há desbloqueio automático — só por ação explícita aqui.
 */
export function BloqueioClientePainel({ clienteId }: { clienteId: string }) {
  const status = useBloqueioClienteWhatsapp(clienteId);
  const bloquear = useBloquearClienteWhatsapp();
  const desbloquear = useDesbloquearClienteWhatsapp();
  const [modo, setModo] = useState<"nenhum" | "bloquear" | "desbloquear">("nenhum");
  const [motivo, setMotivo] = useState("");
  const emAndamento = useRef(false);

  if (status.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 aria-hidden className="size-3.5 animate-spin" /> Consultando bloqueio…
      </div>
    );
  }
  if (status.isError) {
    return (
      <ErrorState
        error={status.error}
        onRetry={() => void status.refetch()}
        fallback="Não foi possível consultar o bloqueio."
      />
    );
  }
  const s = status.data;
  const motivoLimpo = motivo.trim();
  const motivoDesbloqueioValido =
    motivoLimpo.length >= LIMITES_WHATSAPP_OFICIAL.motivoDesbloqueioMin &&
    motivoLimpo.length <= LIMITES_WHATSAPP_OFICIAL.motivoDesbloqueioMax;

  async function confirmar() {
    if (emAndamento.current) return;
    emAndamento.current = true;
    try {
      if (modo === "bloquear") {
        const r = await bloquear.mutateAsync({ clienteId, motivo: motivoLimpo || null });
        toast.success(
          r.jaExistia
            ? "O número já estava bloqueado."
            : "Número bloqueado para mensagens de WhatsApp.",
        );
      } else if (modo === "desbloquear") {
        await desbloquear.mutateAsync({ clienteId, motivo: motivoLimpo });
        toast.success("Bloqueio removido. O histórico do bloqueio foi preservado.");
      }
      setModo("nenhum");
      setMotivo("");
      await status.refetch();
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível concluir a operação."));
    } finally {
      emAndamento.current = false;
    }
  }

  const pendente = bloquear.isPending || desbloquear.isPending;

  return (
    <section
      aria-label="Bloqueio de contato"
      className="space-y-3 rounded-lg border border-border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Rotulo>Bloqueio de contato</Rotulo>
          <p className="text-sm text-foreground" data-testid="situacao-bloqueio">
            {s.telefoneMascarado === null
              ? "O telefone do cadastro não é válido para WhatsApp."
              : s.bloqueado
                ? `Número ${s.telefoneMascarado} bloqueado`
                : `Número ${s.telefoneMascarado} sem bloqueio`}
          </p>
        </div>
        {s.telefoneMascarado !== null && modo === "nenhum" ? (
          s.bloqueado ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModo("desbloquear")}
            >
              <ShieldCheck aria-hidden className="size-4" /> Desbloquear
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setModo("bloquear")}>
              <Ban aria-hidden className="size-4" /> Bloquear número
            </Button>
          )
        ) : null}
      </div>

      {s.bloqueios.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {s.bloqueios.map((b) => (
            <li key={b.id}>
              {b.numeroMascarado} · {ROTULO_ORIGEM_BLOQUEIO[b.origem]} · desde{" "}
              {formatarDataHora(b.criadoEm)}
              {b.motivo ? ` · “${b.motivo}”` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {modo !== "nenhum" ? (
        <div className="space-y-2">
          {modo === "desbloquear" ? (
            <Aviso titulo="Desbloquear reverte um pedido de não contato">
              Só desbloqueie com a autorização do próprio cliente. O motivo é obrigatório e fica
              registrado.
            </Aviso>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="motivo-bloqueio">
              {modo === "bloquear" ? "Motivo (opcional)" : "Motivo do desbloqueio"}
            </Label>
            <Input
              id="motivo-bloqueio"
              value={motivo}
              maxLength={LIMITES_WHATSAPP_OFICIAL.motivoBloqueioMax}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendente}
              onClick={() => {
                setModo("nenhum");
                setMotivo("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={modo === "bloquear" ? "destructive" : "default"}
              disabled={pendente || (modo === "desbloquear" && !motivoDesbloqueioValido)}
              onClick={() => void confirmar()}
            >
              {pendente ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              {modo === "bloquear" ? "Confirmar bloqueio" : "Confirmar desbloqueio"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
