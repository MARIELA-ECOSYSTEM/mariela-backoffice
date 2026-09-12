import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDefinirFotoPrincipal } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { fotosDoProduto } from "@/utils/produto";
import type { Produto } from "@/types/produto";

/**
 * Galeria administrativa do produto: imagem grande, miniaturas e seleção da
 * imagem principal (que será consumida futuramente pela MARIELA Vitrine
 * Virtual). A galeria é derivada das fotos das variantes — não há segunda
 * fonte de verdade de imagens.
 */
export function GaleriaProduto({ produto }: { produto: Produto }) {
  const fotos = fotosDoProduto(produto);
  const [indice, setIndice] = useState(0);
  const definirPrincipal = useDefinirFotoPrincipal(produto.id);
  const atual = fotos[Math.min(indice, Math.max(fotos.length - 1, 0))];
  // Guarda síncrona via ref: `disabled` só reflete a mutação em andamento
  // após o próximo render, tarde demais para barrar um duplo clique real —
  // comprovado na Etapa 20.18 (2 requisições reais aceitas). Precisa ficar
  // antes do `return` condicional abaixo (regra dos hooks).
  const marcandoRef = useRef(false);

  async function marcarPrincipal(varianteId: string) {
    if (marcandoRef.current) return;
    marcandoRef.current = true;
    try {
      await definirPrincipal.mutateAsync({ varianteId });
      toast.success("Imagem principal atualizada.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível definir a imagem principal."));
    } finally {
      marcandoRef.current = false;
    }
  }

  if (!atual) {
    return (
      <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-primary-soft/60 text-primary/60">
        <ImageIcon aria-hidden className="size-8" />
        <p className="font-brand text-[0.65rem] uppercase tracking-[0.18em]">Sem fotos</p>
        <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
          Cadastre a foto de cada variante para montar a galeria do produto.
        </p>
      </div>
    );
  }

  function mover(passo: number) {
    setIndice((anterior) => (anterior + passo + fotos.length) % fotos.length);
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-surface">
        <img
          src={atual.url}
          alt={`${produto.nome} — ${atual.cor}`}
          loading="lazy"
          className="size-full object-cover"
        />
        {atual.principal ? (
          <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground">
            <Star aria-hidden className="size-3" /> Imagem principal
          </Badge>
        ) : null}
        <Badge variant="outline" className="absolute right-2 top-2 border-border bg-card/90">
          {atual.cor}
        </Badge>
        {fotos.length > 1 ? (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Foto anterior"
              onClick={() => mover(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-card/90"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Próxima foto"
              onClick={() => mover(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-card/90"
            >
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {fotos.map((foto, posicao) => (
          <button
            key={foto.varianteId}
            type="button"
            aria-label={`Ver foto ${foto.cor}`}
            aria-current={posicao === indice}
            onClick={() => setIndice(posicao)}
            className={
              posicao === indice
                ? "relative size-16 overflow-hidden rounded-lg border-2 border-primary"
                : "relative size-16 overflow-hidden rounded-lg border border-border transition-colors hover:border-primary/40"
            }
          >
            <img src={foto.url} alt={foto.cor} loading="lazy" className="size-full object-cover" />
            {foto.principal ? (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-primary/90 py-0.5 text-primary-foreground">
                <Star aria-hidden className="size-3" />
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={atual.principal || definirPrincipal.isPending}
        onClick={() => void marcarPrincipal(atual.varianteId)}
      >
        <Star aria-hidden className="size-4" />
        {atual.principal ? "Já é a imagem principal" : "Definir como imagem principal"}
      </Button>
      <p className="text-xs text-muted-foreground">
        A imagem principal será usada pela futura MARIELA Vitrine Virtual.
      </p>
    </div>
  );
}
