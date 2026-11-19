import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Images, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDefinirFotoPrincipal } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { galeriaEfetiva } from "@/utils/galeria";
import { PlayerVideo } from "@/components/produtos/video/player-video";
import type { Produto } from "@/types/produto";

/**
 * Galeria administrativa do produto (visualização): imagem grande, miniaturas e a imagem principal (consumida pelo PDV e,
 * futuramente, pela MARIELA Vitrine Virtual).
 *
 * Fase 22.8.9.9.4 (M3) — mostra a galeria EFETIVA (`galeriaEfetiva`, mesma regra do backend): as fotos da galeria quando
 * ela tem imagens; senão as fotos antigas das variantes, como antes (inclusive a escolha da principal por variante).
 * O gerenciamento das fotos da galeria fica na edição do produto.
 */
export function GaleriaProduto({ produto }: { produto: Produto }) {
  const efetiva = galeriaEfetiva(produto);
  const coresPorVariante = new Map(produto.variantes.map((v) => [v.id, v.cor]));
  const fotos = efetiva.imagens.map((imagem, i) => ({
    ...imagem,
    rotulo:
      imagem.origem === "legado"
        ? (coresPorVariante.get(imagem.varianteId ?? "") ?? `Foto ${i + 1}`)
        : `Foto ${i + 1}`,
  }));
  const [indice, setIndice] = useState(0);
  const definirPrincipal = useDefinirFotoPrincipal(produto.id);
  const atual = fotos[Math.min(indice, Math.max(fotos.length - 1, 0))];
  // Guarda síncrona via ref: `disabled` só reflete a mutação em andamento
  // após o próximo render, tarde demais para barrar um duplo clique real —
  // comprovado na Etapa 20.18 (2 requisições reais aceitas). Precisa ficar
  // antes do `return` condicional abaixo (regra dos hooks).
  const marcandoRef = useRef(false);

  async function marcarPrincipalLegada(varianteId: string) {
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

  // Fase 22.8.9.9.6 (M4) — vídeo do produto (o da galeria; senão o antigo da variante), com player nativo.
  const videoDoProduto = efetiva.video ? (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {efetiva.video.origem === "galeria" ? "Vídeo do produto" : "Vídeo antigo (variante)"}
      </p>
      <PlayerVideo url={efetiva.video.url} titulo={`Vídeo de ${produto.nome}`} />
    </div>
  ) : null;

  const gerenciar = (
    <Button asChild variant="outline" size="sm" className="w-full">
      <Link to="/produtos/$id/editar" params={{ id: produto.id }}>
        <Images aria-hidden className="size-4" /> Gerenciar fotos
      </Link>
    </Button>
  );

  if (!atual) {
    return (
      <div className="space-y-3">
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-primary-soft/60 text-primary/60">
          <ImageIcon aria-hidden className="size-8" />
          <p className="font-brand text-[0.65rem] uppercase tracking-[0.18em]">Sem fotos</p>
          <p className="max-w-[16rem] text-center text-xs text-muted-foreground">
            Envie fotos do computador para montar a galeria do produto.
          </p>
        </div>
        {videoDoProduto}
        {gerenciar}
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
          alt={`${produto.nome} — ${atual.rotulo}`}
          loading="lazy"
          className="size-full object-cover"
        />
        {atual.principal ? (
          <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground">
            <Star aria-hidden className="size-3" /> Imagem principal
          </Badge>
        ) : null}
        <Badge variant="outline" className="absolute right-2 top-2 border-border bg-card/90">
          {atual.rotulo}
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
            key={foto.id}
            type="button"
            aria-label={`Ver foto ${foto.rotulo}`}
            aria-current={posicao === indice}
            onClick={() => setIndice(posicao)}
            className={
              posicao === indice
                ? "relative size-16 overflow-hidden rounded-lg border-2 border-primary"
                : "relative size-16 overflow-hidden rounded-lg border border-border transition-colors hover:border-primary/40"
            }
          >
            <img
              src={foto.url}
              alt={foto.rotulo}
              loading="lazy"
              className="size-full object-cover"
            />
            {foto.principal ? (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-primary/90 py-0.5 text-primary-foreground">
                <Star aria-hidden className="size-3" />
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {efetiva.fonte === "legado" && atual.varianteId ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={atual.principal || definirPrincipal.isPending}
          onClick={() => void marcarPrincipalLegada(atual.varianteId as string)}
        >
          <Star aria-hidden className="size-4" />
          {atual.principal ? "Já é a imagem principal" : "Definir como imagem principal"}
        </Button>
      ) : null}
      {videoDoProduto}
      {gerenciar}
      <p className="text-xs text-muted-foreground">
        {efetiva.fonte === "galeria"
          ? "Fotos da galeria do produto. A imagem principal é usada pelo PDV e pela futura Vitrine Virtual."
          : "Fotos antigas, cadastradas nas variantes. Elas continuam valendo até a galeria receber fotos."}
      </p>
    </div>
  );
}
