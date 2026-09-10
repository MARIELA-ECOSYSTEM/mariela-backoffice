import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Campo de busca padrão do backoffice (apresentação apenas).
 * Reutilizado pela DataToolbar e pelos cabeçalhos do PainelFiltros.
 */
export function BuscaInput({
  valor,
  onValorChange,
  placeholder = "Buscar…",
  className,
  ariaLabel,
}: {
  valor: string;
  onValorChange: (valor: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative w-full min-w-0 sm:min-w-72 lg:max-w-sm", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label={ariaLabel ?? placeholder}
        value={valor}
        onChange={(event) => onValorChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 pl-9"
      />
    </div>
  );
}

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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/60 p-4 lg:flex-row lg:items-center">
      <BuscaInput valor={busca} onValorChange={onBuscaChange} placeholder={placeholder} />
      {children ? (
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Janela de páginas exibidas ao redor da página atual. */
function janelaDePaginas(pagina: number, totalPaginas: number) {
  const maximo = 5;
  if (totalPaginas <= maximo) {
    return Array.from({ length: totalPaginas }, (_, indice) => indice + 1);
  }
  const inicio = Math.min(Math.max(1, pagina - 2), totalPaginas - (maximo - 1));
  return Array.from({ length: maximo }, (_, indice) => inicio + indice);
}

/** Paginação padrão do backoffice, com totalizadores e números de página. */
export function Paginacao({
  pagina,
  totalPaginas,
  total,
  rotulo,
  onPaginaChange,
  extra,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  rotulo: string;
  onPaginaChange: (pagina: number) => void;
  /** Conteúdo opcional à esquerda dos controles (ex.: indicador de atualização). */
  extra?: ReactNode;
}) {
  if (total === 0) return null;
  const paginas = Math.max(1, totalPaginas);
  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="font-brand text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        {total} {rotulo} · página {pagina} de {paginas}
      </p>
      <div className="flex items-center gap-2">
        {extra}
        <Button
          variant="outline"
          size="sm"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => onPaginaChange(pagina - 1)}
        >
          <ChevronLeft aria-hidden className="size-4" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>
        <div className="flex items-center gap-1">
          {janelaDePaginas(pagina, paginas).map((numero) => (
            <Button
              key={numero}
              variant={numero === pagina ? "default" : "ghost"}
              size="sm"
              aria-label={`Página ${numero}`}
              aria-current={numero === pagina ? "page" : undefined}
              className="min-w-9"
              onClick={() => onPaginaChange(numero)}
            >
              {numero}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Próxima página"
          disabled={pagina >= paginas}
          onClick={() => onPaginaChange(pagina + 1)}
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

/** Aviso padrão de dados de demonstração enquanto a API definitiva não existir. */
export function NotaDemonstracao({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3">
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: itens }).map((_, index) => (
        <Skeleton key={index} className="rounded-xl" style={{ height: altura }} />
      ))}
    </div>
  );
}
