import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PontoEvolucaoVendas } from "@/types/dashboard";
import { formatarMoeda } from "@/utils/format";

function ConteudoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: PontoEvolucaoVendas }[];
  label?: string;
}) {
  const ponto = payload?.[0]?.payload;
  if (!active || !ponto) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 text-xs shadow-raised">
      <p className="font-medium">{label}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {ponto.vendas} {ponto.vendas === 1 ? "venda" : "vendas"}
      </p>
      <p className="tabular-nums text-primary">{formatarMoeda(ponto.faturamento)}</p>
    </div>
  );
}

/** Evolução diária do mês: barras de faturamento + linha de quantidade de vendas. */
export function GraficoVendas({
  serie,
  mesLabel,
}: {
  serie: PontoEvolucaoVendas[];
  mesLabel: string;
}) {
  const semDados = serie.every((ponto) => ponto.vendas === 0);

  return (
    <Card className="shadow-card">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle className="font-display text-xl">Evolução de vendas</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Todos os dias de {mesLabel} — barras indicam faturamento e a linha, a quantidade de
          vendas.
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        {semDados ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhuma venda registrada no período.
          </p>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  yAxisId="faturamento"
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(valor: number) => `${Math.round(valor / 100) / 10}k`}
                />
                <YAxis
                  yAxisId="vendas"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip content={<ConteudoTooltip />} />
                <Bar
                  yAxisId="faturamento"
                  dataKey="faturamento"
                  name="Faturamento"
                  radius={[4, 4, 0, 0]}
                  fill="var(--primary-soft)"
                  stroke="var(--primary)"
                  strokeOpacity={0.25}
                />
                <Line
                  yAxisId="vendas"
                  type="monotone"
                  dataKey="vendas"
                  name="Vendas"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
