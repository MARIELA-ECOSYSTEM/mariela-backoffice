import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarMoeda, formatarPercentual } from "@/utils/format";

export type TipoMetrica = "quantidade" | "valor" | "percentual";

function formatar(valor: number, tipo: TipoMetrica, unidade?: string): string {
  if (tipo === "valor") return formatarMoeda(valor);
  if (tipo === "percentual") return formatarPercentual(valor);
  return `${valor.toLocaleString("pt-BR")}${unidade ? ` ${unidade}` : ""}`;
}

/**
 * Card compacto de indicador. `tipo` deixa explícito se o número representa
 * quantidade, valor financeiro ou percentual — nunca misturar os dois.
 */
export function Metrica({
  rotulo,
  valor,
  tipo,
  unidade,
  detalhe,
  icone: Icone,
  destaque,
  variacao,
}: {
  rotulo: string;
  valor: number;
  tipo: TipoMetrica;
  unidade?: string;
  detalhe?: string;
  icone?: LucideIcon;
  destaque?: boolean;
  /** Variação percentual exibida como tendência funcional (verde/vermelho). */
  variacao?: number;
}) {
  const positiva = (variacao ?? 0) >= 0;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-shadow duration-200",
        destaque ? "border-primary/25 bg-primary-soft/50 shadow-raised" : "hover:shadow-raised",
      )}
    >
      {destaque ? (
        <span aria-hidden className="rule-gold absolute inset-x-0 top-0 h-px opacity-80" />
      ) : null}
      <CardContent className={cn("space-y-2", destaque ? "py-5" : "py-4")}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-eyebrow text-[0.6rem]">{rotulo}</p>
          {Icone ? (
            <Icone
              aria-hidden
              className={cn("size-3.5", destaque ? "text-primary/70" : "text-muted-foreground/60")}
            />
          ) : null}
        </div>
        <p
          className={cn(
            "tabular-nums",
            destaque ? "text-metric text-primary" : "text-xl font-medium tracking-tight",
          )}
        >
          {formatar(valor, tipo, unidade)}
        </p>
        {variacao !== undefined ? (
          <p
            className={cn(
              "flex items-center gap-1 text-xs tabular-nums",
              positiva ? "text-success" : "text-destructive",
            )}
          >
            {positiva ? (
              <TrendingUp aria-hidden className="size-3.5" />
            ) : (
              <TrendingDown aria-hidden className="size-3.5" />
            )}
            {formatarPercentual(variacao)}
            {detalhe ? <span className="text-muted-foreground">· {detalhe}</span> : null}
          </p>
        ) : detalhe ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{detalhe}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
