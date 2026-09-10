import { useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Miniatura do produto para a listagem de Estoque.
 * Elemento secundário: pequena, proporção 3:4 e object-contain para exibir a
 * peça completa. Carrossel ativo apenas quando há mais de uma foto.
 */
export function MiniaturaProduto({
  fotos,
  alt,
  className,
}: {
  fotos: string[];
  alt: string;
  className?: string;
}) {
  const [indice, setIndice] = useState(0);
  const atual = fotos[Math.min(indice, Math.max(fotos.length - 1, 0))];
  const base = "h-14 w-11 shrink-0 rounded-md";

  if (!atual) {
    return (
      <span
        aria-label="Sem foto"
        className={cn(
          base,
          "flex items-center justify-center border border-dashed border-border-strong bg-surface text-muted-foreground/60",
          className,
        )}
      >
        <ImageIcon aria-hidden className="size-4" />
      </span>
    );
  }

  function mover(passo: number) {
    setIndice((anterior) => (anterior + passo + fotos.length) % fotos.length);
  }

  return (
    <span
      className={cn(
        base,
        "group/mini relative block overflow-hidden border border-border bg-surface",
        className,
      )}
    >
      <img src={atual} alt={alt} loading="lazy" className="h-full w-full object-contain" />
      {fotos.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => mover(-1)}
            className="absolute left-0 top-0 flex h-full w-1/2 items-center justify-start bg-card/70 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/mini:opacity-100"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => mover(1)}
            className="absolute right-0 top-0 flex h-full w-1/2 items-center justify-end bg-card/70 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/mini:opacity-100"
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </button>
          <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl-md bg-card/90 px-1 text-[0.6rem] tabular-nums leading-tight text-muted-foreground">
            {Math.min(indice, fotos.length - 1) + 1}/{fotos.length}
          </span>
        </>
      ) : null}
    </span>
  );
}
