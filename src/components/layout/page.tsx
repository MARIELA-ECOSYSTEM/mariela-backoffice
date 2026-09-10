import type { ReactNode } from "react";
import { AppHeader, type Breadcrumb } from "./app-header";

export function Page({
  titulo,
  breadcrumbs,
  acoes,
  descricao,
  children,
}: {
  titulo: string;
  breadcrumbs?: Breadcrumb[];
  acoes?: ReactNode;
  descricao?: string;
  children: ReactNode;
}) {
  const temCabecalho = Boolean(descricao || acoes);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <AppHeader titulo={titulo} {...(breadcrumbs ? { breadcrumbs } : {})} />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-7 lg:px-8">
        {temCabecalho ? (
          <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border/70 pb-5">
            <div className="min-w-0">
              {descricao ? (
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {descricao}
                </p>
              ) : null}
            </div>
            {acoes ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{acoes}</div>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-5">{children}</div>
      </main>
    </div>
  );
}
