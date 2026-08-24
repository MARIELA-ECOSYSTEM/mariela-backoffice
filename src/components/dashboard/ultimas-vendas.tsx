import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LABEL_STATUS_VENDA, type StatusVenda, type VendaResumo } from "@/types/venda";
import { formatarMoeda } from "@/utils/format";

const VARIANTE_STATUS: Record<StatusVenda, "success" | "warning" | "destructive"> = {
  concluida: "success",
  em_pagamento: "warning",
  cancelada: "destructive",
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** As 6 vendas mais recentes (dataVenda DESC) em formato de lista gerencial. */
export function UltimasVendas({ vendas, acao }: { vendas: VendaResumo[]; acao?: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b border-border/70 pb-4">
        <div>
          <CardTitle className="font-display text-xl">Últimas vendas</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            As 6 vendas mais recentes registradas na loja
          </p>
        </div>
        {acao}
      </CardHeader>
      <CardContent className="pt-2">
        {vendas.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma venda registrada.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {vendas.map((venda) => (
              <li key={venda.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-brand text-[0.7rem] uppercase tracking-[0.14em] text-primary">
                    #{venda.numero}
                  </p>
                  <p className="text-xs text-muted-foreground">{dataHora(venda.dataVenda)}</p>
                </div>
                <div className="min-w-[9rem] flex-1">
                  <p className="truncate text-sm">{venda.clienteNome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Vendedora: {venda.vendedorNome}
                  </p>
                </div>
                <p className="w-20 text-xs tabular-nums text-muted-foreground">
                  {venda.totalItens} {venda.totalItens === 1 ? "item" : "itens"}
                </p>
                <p className="w-28 text-right text-sm tabular-nums">
                  {formatarMoeda(venda.valorFinal)}
                </p>
                <Badge variant={VARIANTE_STATUS[venda.status]}>
                  {LABEL_STATUS_VENDA[venda.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
