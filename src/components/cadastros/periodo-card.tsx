import { CalendarRange, MoreVertical, Package, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AtivoBadge } from "@/components/common/data-toolbar";
import { formatarData } from "@/utils/format";

export interface ItemPeriodo {
  id: string;
  nome: string;
  descricao: string;
  inicio: string;
  fim: string;
  ativo: boolean;
}

/** Card padrão para Coleções e Campanhas. */
export function PeriodoCard({
  item,
  totalProdutos,
  onEditar,
  onExcluir,
}: {
  item: ItemPeriodo;
  totalProdutos: number;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  return (
    <Card className="shadow-card transition-shadow hover:shadow-elevated">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-2xl leading-tight">{item.nome}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {item.descricao || "Sem descrição."}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Ações de ${item.nome}`}>
                <MoreVertical aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEditar}>
                <Pencil aria-hidden className="size-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onExcluir} className="text-destructive">
                <Trash2 aria-hidden className="size-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <CalendarRange aria-hidden className="size-4 text-primary/70" />
            {formatarData(item.inicio)} — {formatarData(item.fim)}
          </span>
          <span className="flex items-center gap-2">
            <Package aria-hidden className="size-4 text-primary/70" />
            {totalProdutos} produto{totalProdutos === 1 ? "" : "s"}
          </span>
        </div>

        <AtivoBadge ativo={item.ativo} />
      </CardContent>
    </Card>
  );
}
