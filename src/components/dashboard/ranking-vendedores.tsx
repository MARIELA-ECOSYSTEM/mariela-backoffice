import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { RankingVendedor } from "@/types/dashboard";
import { formatarMoeda, iniciais } from "@/utils/format";

/** Ranking gerencial de vendedoras no mês — sem metas nem comissões. */
export function RankingVendedores({
  ranking,
  mesLabel,
}: {
  ranking: RankingVendedor[];
  mesLabel: string;
}) {
  const maior = ranking.reduce((maximo, item) => Math.max(maximo, item.faturamento), 0) || 1;

  return (
    <Card className="shadow-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="font-display text-xl">Ranking de vendedoras</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Desempenho em {mesLabel} — quantidade, faturamento e ticket médio
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        {ranking.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma venda atribuída no período.
          </p>
        ) : (
          <ul className="space-y-4">
            {ranking.map((item, indice) => (
              <li key={item.vendedorId} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="w-4 text-xs tabular-nums text-muted-foreground">
                    {indice + 1}
                  </span>
                  <Avatar className="size-8">
                    {item.foto ? <AvatarImage src={item.foto} alt={item.nome} /> : null}
                    <AvatarFallback className="bg-primary-soft text-[0.65rem] text-primary">
                      {iniciais(item.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.nome}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {item.vendas} {item.vendas === 1 ? "venda" : "vendas"} · ticket médio{" "}
                      {formatarMoeda(item.ticketMedio)}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">{formatarMoeda(item.faturamento)}</p>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-primary-soft">
                  <div
                    className="h-full rounded-full bg-primary/75"
                    style={{ width: `${Math.max(4, (item.faturamento / maior) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
