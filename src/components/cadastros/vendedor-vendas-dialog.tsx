import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/states";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { useVendasDoVendedor } from "@/hooks/use-vendedores";
import { formatarDataHora, formatarMoeda } from "@/utils/format";
import { LABEL_STATUS_VENDA } from "@/types/venda";
import type { Vendedor } from "@/types/vendedor";

/**
 * Vendas vinculadas ao vendedor (somente leitura — origem: MARIELA PDV).
 * Cada linha navega para /vendas/{id}, que hoje é uma tela em desenvolvimento.
 */
export function VendedorVendasDialog({
  vendedor,
  onOpenChange,
}: {
  vendedor: Vendedor | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const { data, isPending, isError, error, refetch } = useVendasDoVendedor(vendedor?.id ?? null);

  return (
    <Dialog open={vendedor !== null} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            Vendas do vendedor
            {vendedor ? <CodigoBadge codigo={vendedor.codigo} /> : null}
          </DialogTitle>
          <DialogDescription>
            Histórico de vendas de {vendedor?.nome ?? "—"}. Clique em uma venda para ver os
            detalhes.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {isPending ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : !data?.length ? (
            <EmptyState
              titulo="Nenhuma venda registrada"
              descricao="Este vendedor ainda não possui vendas vinculadas."
            />
          ) : (
            data.map((venda) => (
              <Link
                key={venda.id}
                to="/vendas/$id"
                params={{ id: venda.id }}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-primary-soft/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CodigoBadge codigo={venda.codigo} />
                    <Badge variant={venda.status === "concluida" ? "success" : "outline"}>
                      {LABEL_STATUS_VENDA[venda.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {formatarDataHora(venda.dataVenda)} · {venda.clienteNome} · {venda.totalItens}{" "}
                    item(ns)
                  </p>
                </div>
                <p className="font-display text-lg text-primary">
                  {formatarMoeda(venda.valorFinal)}
                </p>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
