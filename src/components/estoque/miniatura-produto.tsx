import { useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";

/**
 * Miniatura compacta do produto para listagens densas (Estoque).
 * Com mais de uma foto ganha setas discretas para navegar; sem foto usa o
 * placeholder padrão do sistema.
 */
export function MiniaturaProduto({ fotos, alt }: { fotos: string[]; alt: string }) {
  const [indice, setIndice] = useState(0);
  const atual = fotos[Math.min(indice, Math.max(fotos.length - 1, 0))];

  if (!atual) {
    return (
      <span
        aria-label="Sem foto"
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong bg-surface text-muted-foreground/60"
      >
        <ImageIcon aria-hidden className="size-4" />
      </span>
    );
  }

  function mover(passo: number) {
    setIndice((anterior) => (anterior + passo + fotos.length) % fotos.length);
  }

  return (
    <span className="group/mini relative block size-10 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
      <img src={atual} alt={alt} loading="lazy" className="size-full object-contain" />
      {fotos.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => mover(-1)}
            className="absolute left-0 top-0 flex h-full w-1/2 items-center justify-start bg-card/70 pl-0.5 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/mini:opacity-100"
          >
            <ChevronLeft aria-hidden className="size-3" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => mover(1)}
            className="absolute right-0 top-0 flex h-full w-1/2 items-center justify-end bg-card/70 pr-0.5 text-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/mini:opacity-100"
          >
            <ChevronRight aria-hidden className="size-3" />
          </button>
          <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-card/85 px-1 text-[0.55rem] tabular-nums leading-tight text-muted-foreground">
            {Math.min(indice, fotos.length - 1) + 1}/{fotos.length}
          </span>
        </>
      ) : null}
    </span>
  );
}
