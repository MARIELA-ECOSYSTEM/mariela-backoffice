import { useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ConfirmDialog({
  trigger,
  titulo,
  descricao,
  confirmarLabel = "Confirmar",
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  titulo: string;
  descricao: string;
  confirmarLabel?: string;
  onConfirm: () => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [abertoInterno, setAbertoInterno] = useState(false);
  const aberto = open ?? abertoInterno;
  const mudarAberto = onOpenChange ?? setAbertoInterno;

  const [pendente, setPendente] = useState(false);

  function aoMudarAbertura(proximoAberto: boolean) {
    // Enquanto a mutação está em andamento, ignora qualquer tentativa de
    // fechamento (ESC, etc.) para não perder o resultado da operação.
    if (pendente && !proximoAberto) return;
    mudarAberto(proximoAberto);
  }

  async function confirmar(event: { preventDefault: () => void }) {
    // AlertDialogAction fecha o diálogo automaticamente ao ser clicado (é um
    // alias de DialogPrimitive.Close); preventDefault() suprime esse
    // fechamento para que o diálogo só feche depois que a mutação resolver.
    event.preventDefault();
    if (pendente) return;
    setPendente(true);
    try {
      await onConfirm();
      mudarAberto(false);
    } catch {
      // Erro já reportado (toast) pelo caller; diálogo permanece aberto para nova tentativa.
    } finally {
      setPendente(false);
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={aoMudarAbertura}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => void confirmar(event)}
            disabled={pendente}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pendente ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {confirmarLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
