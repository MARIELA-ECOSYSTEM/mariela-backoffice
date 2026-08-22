import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RelatorioSerie } from "@/types/relatorio";

/** Lista de barras horizontais reutilizável para os relatórios. */
export function BarraSerie({
  titulo,
  descricao,
  serie,
  sufixo = "",
}: {
  titulo: string;
  descricao?: string;
  serie: RelatorioSerie[];
  sufixo?: string;
}) {
  const maximo = serie.reduce((maior, item) => Math.max(maior, item.valor), 0) || 1;

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">{titulo}</CardTitle>
        {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {serie.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          serie.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="truncate">{item.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {item.valor.toLocaleString("pt-BR")}
                  {sufixo}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-primary-soft">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${Math.max(3, (item.valor / maximo) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
