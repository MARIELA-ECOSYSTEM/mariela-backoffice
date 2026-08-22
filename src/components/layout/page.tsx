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
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AppHeader titulo={titulo} {...(breadcrumbs ? { breadcrumbs } : {})} />
      <main className="flex-1 px-8 py-7">
        {descricao || acoes ? (
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <p className="max-w-2xl text-sm text-muted-foreground">{descricao}</p>
            {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
