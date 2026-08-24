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
import { useHistoricoFornecedor } from "@/hooks/use-cadastros";
import { formatarData, formatarMoeda } from "@/utils/format";
import { LABEL_SITUACAO_VINCULO } from "@/types/fornecedor";
import type { Fornecedor } from "@/types/fornecedor";

/**
 * Histórico de vínculos produto × fornecedor (somente leitura).
 * Os dados vêm agregados da API — nenhum cálculo é feito aqui.
 */
export function FornecedorHistoricoDialog({
  fornecedor,
  onOpenChange,
}: {
  fornecedor: Fornecedor | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const { data, isPending, isError, error, refetch } = useHistoricoFornecedor(
    fornecedor?.id ?? null,
  );

  return (
    <Dialog open={fornecedor !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            Histórico de produtos
            {fornecedor ? <CodigoBadge codigo={fornecedor.codigo} /> : null}
          </DialogTitle>
          <DialogDescription>
            Produtos que estão ou já estiveram vinculados a {fornecedor?.nome ?? "este fornecedor"}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : !data?.length ? (
            <EmptyState
              titulo="Sem histórico"
              descricao="Nenhum produto foi vinculado a este fornecedor até agora."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left font-brand text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Vínculo</th>
                  <th className="py-2 pr-3">Desvínculo</th>
                  <th className="py-2 pr-3 text-right">Custo</th>
                  <th className="py-2 pr-3 text-right">Venda</th>
                  <th className="py-2 text-right">Situação</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-3 text-foreground">{item.produtoNome}</td>
                    <td className="py-2.5 pr-3">
                      <CodigoBadge codigo={item.codProduto} />
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {formatarData(item.vinculadoEm)}
                    </td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {item.desvinculadoEm ? formatarData(item.desvinculadoEm) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-foreground/80">
                      {formatarMoeda(item.precoCusto)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-foreground/80">
                      {formatarMoeda(item.precoVenda)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Badge variant={item.situacao === "atual" ? "success" : "outline"}>
                        {LABEL_SITUACAO_VINCULO[item.situacao]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
