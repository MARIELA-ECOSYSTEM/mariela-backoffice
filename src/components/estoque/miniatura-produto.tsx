import { useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";

/**
 * Miniatura do produto para a listagem de Estoque.
 * Área visual ampliada (proporção 3:4) com object-contain para exibir a peça
 * completa. Carrossel ativo apenas quando há mais de uma foto.
 */
export function MiniaturaProduto({ fotos, alt }: { fotos: string[]; alt: string }) {
  const [indice, setIndice] = useState(0);
  const atual = fotos[Math.min(indice, Math.max(fotos.length - 1, 0))];

  if (!atual) {
    return (
      <span
        aria-label="Sem foto"
        className="flex h-36 w-28 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface text-muted-foreground/60"
      >
        <ImageIcon aria-hidden className="size-8" />
      </span>
    );
  }

  function mover(passo: number) {
    setIndice((anterior) => (anterior + passo + fotos.length) % fotos.length);
  }

  return (
    <span className="group/mini relative block h-36 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
      <img src={atual} alt={alt} loading="lazy" className="h-full w-full object-contain p-1" />
      {fotos.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => mover(-1)}
            className="absolute left-0 top-0 flex h-full w-1/2 items-center justify-start bg-card/70 pl-1 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/mini:opacity-100"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => mover(1)}
            className="absolute right-0 top-0 flex h-full w-1/2 items-center justify-end bg-card/70 pr-1 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/mini:opacity-100"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
          <span className="pointer-events-none absolute bottom-1 right-1 rounded-md bg-card/90 px-1.5 py-0.5 text-xs tabular-nums leading-none text-muted-foreground shadow-sm">
            {Math.min(indice, fotos.length - 1) + 1}/{fotos.length}
          </span>
        </>
      ) : null}
    </span>
  );
}

