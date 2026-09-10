import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface AcaoLinha {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destrutivo?: boolean;
  disabled?: boolean;
}

/**
 * Grupo compacto de ações por linha de tabela: ícones com tooltip e
 * `aria-label`. Apresentação apenas — os handlers vêm da tela.
 */
export function AcoesLinha({ acoes, className }: { acoes: AcaoLinha[]; className?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center justify-end gap-1", className)}>
        {acoes.map((acao) => (
          <Tooltip key={acao.label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={acao.label}
                disabled={acao.disabled}
                onClick={acao.onClick}
                className={cn(
                  "size-9",
                  acao.destrutivo
                    ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <acao.icon aria-hidden className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{acao.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
