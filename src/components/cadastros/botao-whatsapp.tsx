import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizarTelefoneWhatsapp } from "@/utils/whatsapp-link";

/**
 * Botão de WhatsApp (Clientes, Fornecedores e Vendedores). Abre o diálogo de mensagem (`DialogMensagemWhatsapp`), que
 * abre a conversa pelo link `wa.me` — nada é enviado automaticamente.
 *
 * Fase 1 (`wa.me`) — o telefone é validado antes: inválido, o botão fica esmaecido (motivo no título) e o clique só
 * mostra o motivo num aviso — o diálogo não abre e nenhum link é montado.
 */
export function BotaoWhatsapp({
  nome,
  numero,
  variante = "icone",
  rotulo,
  onClick,
}: {
  nome: string;
  numero: string;
  variante?: "icone" | "botao";
  /** Texto do botão (variante "botao"); com ele, o nome acessível passa a incluir o nome da pessoa. */
  rotulo?: string;
  onClick: () => void;
}) {
  const telefone = normalizarTelefoneWhatsapp(numero);
  const titulo = telefone.valido
    ? `Abrir conversa no WhatsApp com ${numero}`
    : `Telefone inválido para o WhatsApp: ${telefone.motivo}`;

  function clicar() {
    if (!telefone.valido) {
      toast.error(`Não é possível abrir o WhatsApp de ${nome}: ${telefone.motivo}`);
      return;
    }
    onClick();
  }

  if (variante === "botao") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={clicar}
        title={titulo}
        aria-label={rotulo ? `${rotulo} de ${nome}` : undefined}
        className={cn(
          "border-success/40 text-success hover:bg-success/10 hover:text-success",
          !telefone.valido && "opacity-50",
        )}
      >
        <MessageCircle aria-hidden className="size-4" />
        {rotulo ?? "WhatsApp"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={clicar}
      aria-label={`Abrir conversa no WhatsApp com ${nome}`}
      title={titulo}
      className={cn(
        "text-success hover:bg-success/10 hover:text-success",
        !telefone.valido && "opacity-50",
      )}
    >
      <MessageCircle aria-hidden className="size-4" />
    </Button>
  );
}
