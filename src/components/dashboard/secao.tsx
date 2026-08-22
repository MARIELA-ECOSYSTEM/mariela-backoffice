import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Cabeçalho de seção do Dashboard — cria a hierarquia entre grupos de indicadores. */
export function SecaoDashboard({
  titulo,
  descricao,
  icone: Icone,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  icone: LucideIcon;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icone aria-hidden className="size-4" />
          </span>
          <div>
            <h2 className="text-eyebrow text-primary">{titulo}</h2>
            {descricao ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descricao}</p>
            ) : null}
          </div>
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </header>
      {children}
    </section>
  );
}
