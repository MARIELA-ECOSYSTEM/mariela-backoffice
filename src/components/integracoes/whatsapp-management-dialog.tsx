import { useRef } from "react";
import { Loader2, MessageCircle, Plug, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
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
import { ErrorState } from "@/components/common/states";
import { useConectarWhatsapp, useDesconectarWhatsapp, useWhatsappStatus } from "@/hooks/use-whatsapp";
import { mensagemDeErro } from "@/services/api/client";
import type { StatusConexaoWhatsapp } from "@/services/api/whatsapp.api";

const STATUS_VISUAL: Record<StatusConexaoWhatsapp, { label: string; variante: "success" | "warning" | "destructive" | "outline" }> = {
  CONNECTED: { label: "🟢 Conectado", variante: "success" },
  CONNECTING: { label: "🟡 Conectando", variante: "warning" },
  QRCODE: { label: "🟡 QR Code necessário", variante: "warning" },
  DISCONNECTED: { label: "🔴 Desconectado", variante: "destructive" },
  NOT_CONFIGURED: { label: "⚠️ Não configurado", variante: "outline" },
  ERROR: { label: "⚠️ Erro", variante: "destructive" },
};

/**
 * Tela de gerenciamento do WhatsApp da loja (Etapa Pré-22). Consome apenas
 * `src/services/api/whatsapp.api.ts` — nunca fala com a Evolution API
 * diretamente e nunca exibe API key (o backend não a devolve em nenhuma
 * resposta deste contrato).
 */
export function WhatsappManagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const { data: status, isPending, isError, error, refetch, isFetching } = useWhatsappStatus({ habilitado: open });
  const conectar = useConectarWhatsapp();
  const desconectar = useDesconectarWhatsapp();
  // Guardas síncronas via ref: mesmo padrão da Etapa 20 — `isPending` só
  // reflete a mutação em andamento a partir do próximo render.
  const conectandoRef = useRef(false);
  const desconectandoRef = useRef(false);

  async function aoConectar() {
    if (conectandoRef.current) return;
    conectandoRef.current = true;
    try {
      const resultado = await conectar.mutateAsync();
      if (resultado.status === "CONNECTED") toast.success("WhatsApp conectado.");
      else if (resultado.status === "QRCODE") toast.info("Escaneie o QR Code com o WhatsApp da loja.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível conectar o WhatsApp."));
    } finally {
      conectandoRef.current = false;
    }
  }

  async function aoDesconectar() {
    if (desconectandoRef.current) return;
    desconectandoRef.current = true;
    try {
      await desconectar.mutateAsync();
      toast.success("WhatsApp desconectado.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível desconectar o WhatsApp."));
    } finally {
      desconectandoRef.current = false;
    }
  }

  async function testarConexao() {
    try {
      const resultado = await refetch();
      const atual = resultado.data;
      if (!atual || atual.status === "NOT_CONFIGURED") {
        toast.warning("Evolution API não está configurada neste ambiente.");
      } else if (atual.status === "CONNECTED") {
        toast.success("Conexão OK: instância acessível e conectada.");
      } else {
        toast.warning(`Instância acessível, mas não conectada (status: ${atual.status}).`);
      }
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível verificar a conexão."));
    }
  }

  const visual = status ? STATUS_VISUAL[status.status] : null;
  const podeConectar = status?.status === "DISCONNECTED" || status?.status === "NOT_CONFIGURED" || status?.status === "ERROR";
  const podeDesconectar = status?.status === "CONNECTED" || status?.status === "CONNECTING" || status?.status === "QRCODE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl">
            <MessageCircle aria-hidden className="size-6 text-success" />
            WhatsApp da Loja
          </DialogTitle>
          <DialogDescription>WhatsApp integrado via Evolution API / Baileys.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 aria-hidden className="size-6 animate-spin" />
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">Número</p>
                <p className="truncate text-sm text-foreground">{status?.numero ?? "Não configurado"}</p>
              </div>
              <div className="min-w-0">
                <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                {visual ? <Badge variant={visual.variante}>{visual.label}</Badge> : null}
              </div>
              <div className="min-w-0">
                <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">Provider</p>
                <p className="truncate text-sm text-foreground">Evolution API</p>
              </div>
              <div className="min-w-0">
                <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">Transporte</p>
                <p className="truncate text-sm text-foreground">Baileys (WhatsApp Web)</p>
              </div>
            </div>

            {status?.status === "QRCODE" && status.qrCode ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface/60 p-4">
                <img src={status.qrCode} alt="QR Code para conectar o WhatsApp da loja" className="size-48" />
                <p className="text-center text-xs text-muted-foreground">
                  Abra o WhatsApp da loja → Aparelhos conectados → escaneie este código.
                </p>
              </div>
            ) : null}

            {status?.status === "NOT_CONFIGURED" ? (
              <p className="rounded-lg border border-border bg-surface/60 p-3 text-xs leading-relaxed text-muted-foreground">
                A integração ainda não foi configurada neste ambiente (variáveis de infraestrutura da
                Evolution API ausentes). Fale com o responsável técnico.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void testarConexao()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
            Testar conexão
          </Button>
          <div className="flex gap-2">
            {podeDesconectar ? (
              <Button type="button" variant="outline" onClick={() => void aoDesconectar()} disabled={desconectar.isPending}>
                {desconectar.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Unplug aria-hidden className="size-4" />}
                Desconectar
              </Button>
            ) : null}
            {podeConectar ? (
              <Button type="button" onClick={() => void aoConectar()} disabled={conectar.isPending || status?.status === "NOT_CONFIGURED"}>
                {conectar.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plug aria-hidden className="size-4" />}
                Conectar
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
