import type { ReactNode } from "react";
import { AlertTriangle, PackageOpen, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mensagemDeErro } from "@/services/api/client";

export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/50 px-6 py-20 text-center">
      <PackageOpen aria-hidden className="size-7 text-muted-foreground/60" />
      <h3 className="font-display text-2xl">{titulo}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{descricao}</p>
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  fallback = "Não foi possível carregar os dados.",
}: {
  error: unknown;
  onRetry?: () => void;
  fallback?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.04] px-6 py-16 text-center"
    >
      <AlertTriangle aria-hidden className="size-6 text-destructive/80" />
      <h3 className="font-display text-2xl">Algo deu errado</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {mensagemDeErro(error, fallback)}
      </p>

      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ linhas = 6, colunas = 6 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-card">
      {Array.from({ length: linhas }).map((_, linha) => (
        <div
          key={linha}
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${colunas}, 1fr)` }}
        >
          {Array.from({ length: colunas }).map((__, coluna) => (
            <Skeleton key={coluna} className="h-6" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmDesenvolvimento({ modulo }: { modulo: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/50 px-6 py-24 text-center">
      <Wrench aria-hidden className="size-7 text-muted-foreground/60" />
      <span aria-hidden className="rule-gold h-px w-16" />
      <h3 className="font-display text-3xl">{modulo}</h3>
      <p className="text-eyebrow">Em desenvolvimento</p>

      <p className="max-w-md text-sm text-muted-foreground">
        Este módulo já possui navegação preparada e será implementado nos próximos ciclos do MARIELA
        Backoffice.
      </p>
    </div>
  );
}
