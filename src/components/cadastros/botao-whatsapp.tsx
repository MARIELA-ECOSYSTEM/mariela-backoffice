import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão de WhatsApp. Abre o Dialog de composição de mensagem
 * (`DialogMensagemWhatsapp`), que envia via `POST /integracoes/whatsapp/mensagens`
 * (Evolution API/Baileys — Etapa Pré-22) quando a API real está conectada.
 */
export function BotaoWhatsapp({
  nome,
  numero,
  variante = "icone",
  legado = false,
  onClick,
}: {
  nome: string;
  numero: string;
  variante?: "icone" | "botao";
  /**
   * Fase 22.8.9.10.6 — onde o WhatsApp oficial (Meta) também está disponível (Clientes), identifica este botão como o
   * fluxo antigo da Evolution, mantido durante a transição. Sem a propriedade, nada muda (Fornecedores/Vendedores).
   */
  legado?: boolean;
  onClick: () => void;
}) {
  const habilitado = numero.trim().length > 0;
  const sufixo = legado ? " (Evolution, legado)" : "";

  if (variante === "botao") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!habilitado}
        onClick={onClick}
        title={habilitado ? `Enviar mensagem para ${numero}${sufixo}` : "Sem telefone cadastrado"}
        className="border-success/40 text-success hover:bg-success/10 hover:text-success"
      >
        <MessageCircle aria-hidden className="size-4" />
        {legado ? "Evolution (legado)" : "Enviar mensagem"}
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
      aria-label={`Enviar mensagem de WhatsApp para ${nome}${sufixo}`}
      title={habilitado ? `Enviar mensagem para ${numero}${sufixo}` : "Sem telefone cadastrado"}
      className="text-success hover:bg-success/10 hover:text-success"
    >
      <MessageCircle aria-hidden className="size-4" />
    </Button>
  );
}
