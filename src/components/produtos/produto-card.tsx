import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IndicadorCor } from "@/components/common/indicador-cor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDefinirNovidade, useDefinirPromocao } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { formatarMoeda, formatarPercentual } from "@/utils/format";
import { fotosDoProduto, lucroFinal, margemVigente, precoFinal } from "@/utils/produto";
import type { Produto } from "@/types/produto";

export function ProdutoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/** Carrossel leve: só troca o índice, sem bibliotecas nem animações pesadas. */
function GaleriaCard({ produto }: { produto: Produto }) {
  const fotos = fotosDoProduto(produto);
  const [indice, setIndice] = useState(0);
  const atual = fotos[Math.min(indice, fotos.length - 1)];

  if (!atual) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-primary-soft/70 text-primary/60">
        <ImageIcon aria-hidden className="size-6" />
        <span className="font-brand text-[0.7rem] uppercase tracking-[0.16em]">Sem foto</span>
      </div>
    );
  }

  function mover(passo: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIndice((anterior) => (anterior + passo + fotos.length) % fotos.length);
  }

  return (
    <>
      <img
        src={atual.url}
        alt={`${produto.nome} — ${atual.cor}`}
        loading="lazy"
        className="size-full object-contain p-1 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
      />

      {fotos.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(event) => mover(-1, event)}
            className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-card/85 p-1 text-foreground opacity-0 shadow-card transition-opacity hover:bg-card focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={(event) => mover(1, event)}
            className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-card/85 p-1 text-foreground opacity-0 shadow-card transition-opacity hover:bg-card focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ChevronRight aria-hidden className="size-3.5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center gap-1">
            {fotos.map((foto, posicao) => (
              <span
                key={foto.varianteId}
                className={
                  posicao === Math.min(indice, fotos.length - 1)
                    ? "size-1.5 rounded-full bg-primary"
                    : "size-1.5 rounded-full bg-card/80"
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

/** Estoque compacto: bolinha da cor → COR → TAMANHO(QTD). */
function EstoqueCompacto({ produto }: { produto: Produto }) {
  const comEstoque = produto.variantes.filter((variante) => variante.quantidadeVariante > 0);
  if (!comEstoque.length) {
    return <p className="text-[0.78rem] text-muted-foreground">Nenhuma variante com estoque.</p>;
  }
  const visiveis = comEstoque.slice(0, 3);
  const restantes = comEstoque.length - visiveis.length;

  return (
    <div className="space-y-1">
      {visiveis.map((variante) => (
        <div key={variante.id} className="flex items-center gap-1.5 text-[0.7rem] leading-tight">
          <IndicadorCor cor={variante.cor} />
          <span className="shrink-0 truncate font-medium text-foreground">{variante.cor}</span>
          <span className="truncate tabular-nums text-muted-foreground">
            {variante.tamanhos
              .filter((tamanho) => tamanho.quantidade > 0)
              .map((tamanho) => `${tamanho.tamanho}(${tamanho.quantidade})`)
              .join(" ")}
          </span>
        </div>
      ))}
      {restantes > 0 ? (
        <p className="text-[0.74rem] text-muted-foreground">+{restantes} cor(es)</p>
      ) : null}
    </div>
  );
}

export function ProdutoCard({
  produto,
  onExcluir,
  onPromocao,
}: {
  produto: Produto;
  onExcluir: (produto: Produto) => void;
  onPromocao: (produto: Produto) => void;
}) {
  const desativarPromocao = useDefinirPromocao(produto.id);
  const definirNovidade = useDefinirNovidade(produto.id);
  const semEstoque = produto.quantidadeTotal === 0;
  const preco = precoFinal(produto);
  const lucro = lucroFinal(produto);
  const margem = margemVigente(produto);
  // Guardas síncronas via ref: os itens de menu disparam a mutation direto
  // via DropdownMenuItem.onSelect, sem guarda própria — duplo clique/seleção
  // real disparava duas mutations aceitas pelo backend (Etapa 20.18). Esta é
  // uma instância distinta da corrigida na Etapa 20.16 (aquela ficava na
  // página de detalhe do produto; este card é usado na listagem).
  const alternandoNovidadeRef = useRef(false);
  const desativandoPromocaoRef = useRef(false);

  async function alternarNovidade() {
    if (alternandoNovidadeRef.current) return;
    alternandoNovidadeRef.current = true;
    try {
      await definirNovidade.mutateAsync({ ehNovidade: !produto.ehNovidade });
      toast.success(
        produto.ehNovidade ? "Marca de novidade removida." : "Produto marcado como novidade.",
      );
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível atualizar a novidade."));
    } finally {
      alternandoNovidadeRef.current = false;
    }
  }

  async function desativar() {
    if (desativandoPromocaoRef.current) return;
    desativandoPromocaoRef.current = true;
    try {
      await desativarPromocao.mutateAsync({ ehPromocao: false });
      toast.success("Promoção desativada com sucesso.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível desativar a promoção."));
    } finally {
      desativandoPromocaoRef.current = false;
    }
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raised">
      <div className="relative aspect-[3/4] overflow-hidden bg-surface">
        <Link
          to="/produtos/$id"
          params={{ id: produto.id }}
          aria-label={`Abrir ${produto.nome}`}
          className="absolute inset-0 z-10"
        >
          <span className="sr-only">{produto.nome}</span>
        </Link>
        <GaleriaCard produto={produto} />

        <div className="pointer-events-none absolute left-1.5 top-1.5 z-20 flex flex-wrap items-start gap-1">
          {produto.ehNovidade ? (
            <Badge
              variant="outline"
              className="border-primary/30 bg-card/90 px-1.5 py-0 text-[0.7rem] text-primary"
            >
              Novidade
            </Badge>
          ) : null}
          {produto.ehPromocao ? (
            <Badge className="bg-primary px-1.5 py-0 text-[0.7rem] text-primary-foreground">
              Promoção
            </Badge>
          ) : null}
          {semEstoque ? (
            <Badge variant="destructive" className="px-1.5 py-0 text-[0.7rem]">
              Sem estoque
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[0.95rem] leading-snug">
              <Link
                to="/produtos/$id"
                params={{ id: produto.id }}
                className="transition-colors hover:text-primary"
              >
                {produto.nome}
              </Link>
            </h3>
            <p className="truncate text-[0.74rem] text-muted-foreground">{produto.categoria}</p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 -mt-1 size-7 shrink-0"
                aria-label={`Ações de ${produto.nome}`}
              >
                <MoreHorizontal aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/produtos/$id" params={{ id: produto.id }}>
                  <Eye aria-hidden className="size-4" /> Visualizar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/produtos/$id/editar" params={{ id: produto.id }}>
                  <Pencil aria-hidden className="size-4" /> Editar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/produtos/$id/variantes" params={{ id: produto.id }}>
                  <Boxes aria-hidden className="size-4" /> Gerenciar variantes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/estoque/$produtoId" params={{ produtoId: produto.id }}>
                  <Plus aria-hidden className="size-4" /> Adicionar estoque
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void alternarNovidade()}>
                <Sparkles aria-hidden className="size-4" />{" "}
                {produto.ehNovidade ? "Remover marca de novidade" : "Marcar como novidade"}
              </DropdownMenuItem>
              {produto.ehPromocao ? (
                <DropdownMenuItem onSelect={() => void desativar()}>
                  <Percent aria-hidden className="size-4" /> Desativar promoção
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => onPromocao(produto)}>
                  <Percent aria-hidden className="size-4" /> Ativar promoção
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onExcluir(produto)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 aria-hidden className="size-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-xl leading-none tabular-nums text-foreground">
              {formatarMoeda(preco)}
            </span>
            {produto.ehPromocao ? (
              <span className="text-[0.72rem] tabular-nums text-muted-foreground line-through">
                {formatarMoeda(produto.precoVenda)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 text-[0.74rem] text-muted-foreground">
            <span>
              Custo <span className="tabular-nums">{formatarMoeda(produto.precoCusto)}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              Lucro <span className="tabular-nums">{formatarMoeda(lucro)}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              Margem <span className="tabular-nums">{formatarPercentual(margem)}</span>
            </span>
          </div>
        </div>

        <div className="mt-auto space-y-1.5 border-t border-border pt-2">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={
                semEstoque
                  ? "font-brand text-[0.72rem] uppercase tracking-[0.14em] text-destructive"
                  : "font-brand text-[0.72rem] uppercase tracking-[0.14em] text-primary"
              }
            >
              {semEstoque ? "Sem estoque" : "Em estoque"}
              <span className="ml-1.5 tabular-nums text-foreground">{produto.quantidadeTotal}</span>
            </span>
            <Link
              to="/produtos/$id"
              params={{ id: produto.id }}
              className="text-[0.74rem] text-primary underline-offset-4 hover:underline"
            >
              Abrir
            </Link>
          </div>
          <EstoqueCompacto produto={produto} />
        </div>
      </div>
    </article>
  );
}
