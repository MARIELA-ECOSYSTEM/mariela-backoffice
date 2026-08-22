import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/** Barra de filtros padrão do backoffice: busca + controles adicionais. */
export function DataToolbar({
  busca,
  onBuscaChange,
  placeholder = "Buscar…",
  children,
}: {
  busca: string;
  onBuscaChange: (valor: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="relative min-w-64 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={placeholder}
          value={busca}
          onChange={(event) => onBuscaChange(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {children}
    </div>
  );
}

/** Paginação client-side padrão, com totalizadores. */
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  rotulo,
  onPaginaChange,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  rotulo: string;
  onPaginaChange: (pagina: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav
      aria-label="Paginação"
      className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5"
    >
      <p className="text-sm text-muted-foreground">
        {total} {rotulo} · página {pagina} de {Math.max(1, totalPaginas)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagina <= 1}
          onClick={() => onPaginaChange(pagina - 1)}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pagina >= totalPaginas}
          onClick={() => onPaginaChange(pagina + 1)}
        >
          Próxima
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

/** Aviso padrão de dados de demonstração enquanto a API definitiva não existir. */
export function NotaDemonstracao({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="text-sm leading-relaxed text-foreground/80">{children}</p>
    </div>
  );
}

export function AtivoBadge({ ativo }: { ativo: boolean }) {
  return (
    <Badge variant={ativo ? "success" : "outline"}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {ativo ? "Ativo" : "Inativo"}
    </Badge>
  );
}

/** Skeleton para listas em cards/grid. */
export function CardsSkeleton({ itens = 6, altura = 160 }: { itens?: number; altura?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: itens }).map((_, index) => (
        <Skeleton key={index} className="rounded-xl" style={{ height: altura }} />
      ))}
    </div>
  );
}
