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
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface/50 px-6 py-16 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-full border border-border bg-card">
        <PackageOpen aria-hidden className="size-5 text-muted-foreground/70" />
      </span>
      <h3 className="font-display text-xl font-medium">{titulo}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{descricao}</p>
      {acao ? <div className="mt-3">{acao}</div> : null}
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
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.04] px-6 py-16 text-center"
    >
      <span className="mb-1 grid size-12 place-items-center rounded-full border border-destructive/20 bg-card">
        <AlertTriangle aria-hidden className="size-5 text-destructive/80" />
      </span>
      <h3 className="font-display text-xl font-medium">Algo deu errado</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {mensagemDeErro(error, fallback)}
      </p>

      {onRetry ? (
        <Button variant="outline" className="mt-3" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ linhas = 6, colunas = 6 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div
        className="grid gap-4 border-b border-border bg-surface/60 px-5 py-3"
        style={{ gridTemplateColumns: `repeat(${colunas}, 1fr)` }}
      >
        {Array.from({ length: colunas }).map((_, coluna) => (
          <Skeleton key={coluna} className="h-3.5" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: linhas }).map((_, linha) => (
          <div
            key={linha}
            className="grid gap-4 px-5 py-4"
            style={{ gridTemplateColumns: `repeat(${colunas}, 1fr)` }}
          >
            {Array.from({ length: colunas }).map((__, coluna) => (
              <Skeleton key={coluna} className="h-5" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton com a silhueta de um formulário em card (rótulo + campo). */
export function FormSkeleton({ campos = 6, colunas = 2 }: { campos?: number; colunas?: 1 | 2 }) {
  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className={colunas === 2 ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
        {Array.from({ length: campos }).map((_, campo) => (
          <div key={campo} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
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
