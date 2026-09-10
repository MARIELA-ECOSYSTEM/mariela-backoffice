import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão de WhatsApp.
 *
 * IMPORTANTE: não existe integração real com o WhatsApp. O clique apenas abre o
 * Dialog de composição de mensagem (`DialogMensagemWhatsapp`), que simula o envio.
 */
export function BotaoWhatsapp({
  nome,
  numero,
  variante = "icone",
  onClick,
}: {
  nome: string;
  numero: string;
  variante?: "icone" | "botao";
  onClick: () => void;
}) {
  const habilitado = numero.trim().length > 0;

  if (variante === "botao") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!habilitado}
        onClick={onClick}
        title={
          habilitado
            ? `Enviar mensagem para ${numero} (envio simulado)`
            : "Sem telefone cadastrado"
        }
        className="border-success/40 text-success hover:bg-success/10 hover:text-success"
      >
        <MessageCircle aria-hidden className="size-4" />
        Enviar mensagem
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={!habilitado}
      onClick={onClick}
      aria-label={`Enviar mensagem de WhatsApp para ${nome} (envio simulado)`}
      title={
        habilitado ? `Enviar mensagem para ${numero} (envio simulado)` : "Sem telefone cadastrado"
      }
      className="text-success hover:bg-success/10 hover:text-success"
    >
      <MessageCircle aria-hidden className="size-4" />
    </Button>
  );
}
