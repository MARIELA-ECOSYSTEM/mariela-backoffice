import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botão do envio OFICIAL (modelo aprovado pela Meta). Só para clientes: o backend resolve o número pelo cadastro.
 * Sem telefone no cadastro, fica desabilitado (o backend recusaria de qualquer forma).
 */
export function BotaoWhatsappOficial({
  nome,
  temTelefone,
  variante = "icone",
  onClick,
}: {
  nome: string;
  temTelefone: boolean;
  variante?: "icone" | "botao";
  onClick: () => void;
}) {
  const titulo = temTelefone ? "WhatsApp oficial (modelo aprovado)" : "Sem telefone cadastrado";
  if (variante === "botao") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!temTelefone}
        onClick={onClick}
        title={titulo}
        className="border-success/40 text-success hover:bg-success/10 hover:text-success"
      >
        <ShieldCheck aria-hidden className="size-4" />
        WhatsApp oficial
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={!temTelefone}
      onClick={onClick}
      aria-label={`WhatsApp oficial para ${nome}`}
      title={titulo}
      className="text-success hover:bg-success/10 hover:text-success"
    >
      <ShieldCheck aria-hidden className="size-4" />
    </Button>
  );
}
