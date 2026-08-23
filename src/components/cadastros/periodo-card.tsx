import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  Eye,
  Image as ImageIcon,
  LayoutPanelTop,
  MoreVertical,
  Package,
  Pencil,
  Power,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { cn } from "@/lib/utils";
import { formatarData } from "@/utils/format";
import { LABEL_VIGENCIA, statusVigencia, type ItemVitrine } from "@/utils/vitrine";

export interface ItemPeriodo extends ItemVitrine {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
}

/**
 * Card editorial compartilhado por COLEÇÕES e CAMPANHAS.
 * A coleção usa proporção editorial (retrato) e a campanha proporção de
 * banner (horizontal), reforçando visualmente a natureza de cada entidade.
 */
export function PeriodoCard({
  item,
  tipo,
  totalProdutos,
  detalheHref,
  onEditar,
  onAlternarStatus,
  onGerenciarProdutos,
  onExcluir,
}: {
  item: ItemPeriodo;
  tipo: "colecao" | "campanha";
  totalProdutos: number;
  detalheHref: string;
  onEditar: () => void;
  onAlternarStatus: () => void;
  onGerenciarProdutos: () => void;
  onExcluir: () => void;
}) {
  const status = statusVigencia(item);
  const ehCampanha = tipo === "campanha";
  const imagem = ehCampanha
    ? (item.fotoBanner ?? item.fotoDestaque)
    : (item.fotoDestaque ?? item.fotoBanner);

  const tomStatus =
    status === "ativa"
      ? "success"
      : status === "agendada"
        ? "gold"
        : status === "encerrada"
          ? "outline"
          : "destructive";

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated">
      <div
        className={cn(
          "relative overflow-hidden bg-primary-soft/40",
          ehCampanha ? "aspect-[16/9]" : "aspect-[4/5]",
        )}
      >
        {imagem ? (
          <img
            src={imagem}
            alt={`Imagem de ${item.nome}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-primary/50">
            <ImageIcon aria-hidden className="size-7" />
            <span className="font-brand text-[0.65rem] uppercase tracking-[0.18em]">
              {ehCampanha ? "Sem banner" : "Sem foto de destaque"}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-foreground/55 to-transparent" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant={tomStatus}>{LABEL_VIGENCIA[status]}</Badge>
          {ehCampanha ? (
            <Badge variant="outline" className="border-white/40 bg-background/85 text-primary">
              Ação temporária
            </Badge>
          ) : null}
        </div>

        <div className="absolute right-3 top-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-8 bg-background/85 backdrop-blur"
                aria-label={`Ações de ${item.nome}`}
              >
                <MoreVertical aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={detalheHref}>
                  <Eye aria-hidden className="size-4" />
                  Visualizar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditar}>
                <Pencil aria-hidden className="size-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onAlternarStatus}>
                <Power aria-hidden className="size-4" />
                {item.ativo ? "Inativar" : "Ativar"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onGerenciarProdutos}>
                <Package aria-hidden className="size-4" />
                Gerenciar produtos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onExcluir} className="text-destructive">
                <Trash2 aria-hidden className="size-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {item.destaque || item.banner ? (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
            {item.destaque ? (
              <Badge variant="gold">
                <Sparkles aria-hidden className="size-3" />
                Destaque
              </Badge>
            ) : null}
            {item.banner ? (
              <Badge variant="outline" className="border-white/40 bg-background/85 text-primary">
                <LayoutPanelTop aria-hidden className="size-3" />
                Banner
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <Link
            to={detalheHref}
            className="block truncate font-display text-xl leading-tight hover:text-primary"
          >
            {item.nome}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {item.descricao || "Sem descrição."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarRange aria-hidden className="size-3.5 text-primary/70" />
            {formatarData(item.inicio)} — {formatarData(item.fim)}
          </span>
          <span className="flex items-center gap-1.5">
            <Package aria-hidden className="size-3.5 text-primary/70" />
            {totalProdutos} produto{totalProdutos === 1 ? "" : "s"}
          </span>
        </div>

        <CodigoBadge codigo={item.codigo} tamanho="xs" />
      </div>
    </article>
  );
}
