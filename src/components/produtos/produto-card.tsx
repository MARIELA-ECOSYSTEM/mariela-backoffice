import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Boxes,
  Eye,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Percent,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDefinirPromocao } from "@/hooks/use-produtos";
import { mensagemDeErro } from "@/services/api/client";
import { formatarMoeda } from "@/utils/format";
import { precoFinal, statusEstoque } from "@/utils/produto";
import type { Produto } from "@/types/produto";

export function ProdutoCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

function FotoProduto({ produto }: { produto: Produto }) {
  const foto = produto.variantes.find((variante) => variante.foto)?.foto ?? null;

  if (foto) {
    return (
      <img
        src={foto}
        alt={produto.nome}
        loading="lazy"
        className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
    );
  }

  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-primary-soft/70 text-primary/60">
      <ImageIcon aria-hidden className="size-7" />
      <span className="font-brand text-[0.6rem] uppercase tracking-[0.18em]">Sem foto</span>
      <span aria-hidden className="h-px w-8 bg-primary/20" />
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
  const status = statusEstoque(produto.quantidadeTotal);
  const semEstoque = produto.quantidadeTotal === 0;
  const preco = precoFinal(produto);

  async function desativar() {
    try {
      await desativarPromocao.mutateAsync({ ehPromocao: false });
      toast.success("Promoção desativada com sucesso.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível desativar a promoção."));
    }
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-raised">
      <Link
        to="/produtos/$id"
        params={{ id: produto.id }}
        aria-label={`Abrir ${produto.nome}`}
        className="relative block aspect-[3/4] overflow-hidden bg-surface"
      >
        <FotoProduto produto={produto} />

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {produto.ehNovidade ? (
            <Badge variant="outline" className="border-primary/30 bg-card/90 text-primary">
              Novidade
            </Badge>
          ) : null}
          {produto.ehPromocao ? (
            <Badge className="bg-primary text-primary-foreground">Promoção</Badge>
          ) : null}
        </div>

        {semEstoque ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/60 py-1.5 text-center font-brand text-[0.6rem] uppercase tracking-[0.16em] text-background">
            Sem estoque
          </div>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-brand text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
              {produto.codProduto}
            </p>
            <h3 className="truncate font-display text-base leading-snug">
              <Link
                to="/produtos/$id"
                params={{ id: produto.id }}
                className="transition-colors hover:text-primary"
              >
                {produto.nome}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted-foreground">{produto.categoria}</p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 -mt-1 shrink-0"
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

        <div className="mt-auto space-y-3">
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="font-display text-lg text-foreground">{formatarMoeda(preco)}</span>
            {produto.ehPromocao && preco !== produto.precoVenda ? (
              <span className="text-xs text-muted-foreground line-through">
                {formatarMoeda(produto.precoVenda)}
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span
              className={
                status === "sem-estoque"
                  ? "font-brand text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground"
                  : "font-brand text-[0.65rem] uppercase tracking-[0.14em] text-primary"
              }
            >
              {semEstoque ? "Sem estoque" : "Em estoque"}
              <span className="ml-1.5 tabular-nums text-foreground">{produto.quantidadeTotal}</span>
            </span>

            <Button asChild size="sm" variant="outline">
              <Link to="/produtos/$id" params={{ id: produto.id }}>
                Abrir
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
