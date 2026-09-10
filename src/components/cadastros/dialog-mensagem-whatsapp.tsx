import { useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useEnviarMensagemWhatsapp } from "@/hooks/use-whatsapp";
import { mensagemDeErro } from "@/services/api/client";
import {
  TEMPLATES_WHATSAPP,
  montarMensagem,
  type TipoMensagemWhatsapp,
} from "@/services/whatsapp/messages";
import { formatarTelefone } from "@/utils/cliente";

/**
 * Destinatário genérico: serve para cliente, fornecedor e vendedor.
 * O contrato da API não muda — `id` é enviado no campo `clienteId`.
 */
export interface AlvoMensagemWhatsapp {
  id: string;
  nome: string;
  telefone: string;
  tipoMensagem: TipoMensagemWhatsapp;
  /** Rótulo do tipo de destinatário exibido no resumo (ex.: "Fornecedor"). */
  papel?: string;
}

/**
 * Dialog único de composição de mensagem — reutilizado pelo card do cliente,
 * pela ficha e pelo dialog de aniversariantes.
 *
 * IMPORTANTE: não há integração real com o WhatsApp. Confirmar apenas chama o
 * serviço mockado, que simula o envio (nenhuma janela do WhatsApp é aberta).
 */
export function DialogMensagemWhatsapp({
  alvo,
  onOpenChange,
}: {
  alvo: AlvoMensagemWhatsapp | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const enviar = useEnviarMensagemWhatsapp();
  const [mensagem, setMensagem] = useState("");

  const telefone = alvo ? formatarTelefone(alvo.telefone) : "";
  const template = alvo ? TEMPLATES_WHATSAPP[alvo.tipoMensagem] : null;

  useEffect(() => {
    if (alvo) setMensagem(montarMensagem(alvo.tipoMensagem, alvo.nome));
  }, [alvo]);

  async function confirmar() {
    if (!alvo) return;
    try {
      await enviar.mutateAsync({
        clienteId: alvo.id,
        telefone: alvo.telefone,
        mensagem,
      });
      onOpenChange(false);
      toast.success("Mensagem preparada para envio.");
    } catch (err) {
      toast.error(mensagemDeErro(err, "Não foi possível preparar a mensagem."));
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl">
            <MessageCircle aria-hidden className="size-6 text-success" />
            {template?.titulo ?? "Enviar mensagem"}
          </DialogTitle>
          <DialogDescription>
            {template?.descricao} A integração com o WhatsApp ainda não está ativa — o envio é
            simulado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                {alvo?.papel ?? "Para"}
              </p>
              <p className="truncate text-sm text-foreground">{alvo?.nome}</p>
            </div>
            <div className="min-w-0">
              <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                Telefone
              </p>
              <p className="truncate text-sm text-foreground">
                {telefone || "Sem telefone cadastrado"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mensagem-whatsapp" className="text-sm font-medium text-foreground">
              Mensagem
            </label>
            <Textarea
              id="mensagem-whatsapp"
              rows={8}
              maxLength={1000}
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Você pode editar a mensagem antes de confirmar.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviar.isPending || !mensagem.trim() || !telefone}
          >
            {enviar.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {enviar.isPending ? "Enviando…" : "Confirmar envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
