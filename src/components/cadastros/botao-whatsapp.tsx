import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Botão visual de WhatsApp.
 *
 * IMPORTANTE: não existe integração com o WhatsApp neste momento — nenhuma API,
 * webhook ou autenticação. O clique apenas dá um retorno visual, deixando a UI
 * preparada para a futura funcionalidade.
 */
export function BotaoWhatsapp({
  nome,
  numero,
  variante = "icone",
}: {
  nome: string;
  numero: string;
  variante?: "icone" | "botao";
}) {
  const habilitado = numero.trim().length > 0;

  function avisar() {
    toast.info(
      habilitado
        ? `WhatsApp de ${nome} (${numero}) — integração será habilitada em breve.`
        : `${nome} não possui WhatsApp cadastrado.`,
    );
  }

  if (variante === "botao") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={avisar}
        className="border-success/40 text-success hover:bg-success/10 hover:text-success"
      >
        <MessageCircle aria-hidden className="size-4" />
        WhatsApp
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={avisar}
      aria-label={`WhatsApp de ${nome}`}
      title={habilitado ? `WhatsApp: ${numero}` : "Sem WhatsApp cadastrado"}
      className="text-success hover:bg-success/10 hover:text-success"
    >
      <MessageCircle aria-hidden className="size-4" />
    </Button>
  );
}
