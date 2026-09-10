import { Link } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle, Clock3, Landmark, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { LABEL_STATUS_CAIXA, type Caixa } from "@/types/caixa";
import { LABEL_DIFERENCA, VARIANTE_STATUS_CAIXA, situacaoDiferenca } from "@/utils/caixa";
import { formatarDataHora, formatarMoeda, pluralizar } from "@/utils/format";

export function CaixasGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function CaixasGridSkeleton() {
  return (
    <CaixasGrid>
      {Array.from({ length: 6 }).map((_, indice) => (
        <Skeleton key={indice} className="h-64 w-full rounded-xl" />
      ))}
    </CaixasGrid>
  );
}

/** Card de caixa — mesma linguagem visual das listagens de vendas e cadastros. */
export function CaixaCard({ caixa }: { caixa: Caixa }) {
  const diferenca = caixa.fechamento ? situacaoDiferenca(caixa.fechamento.diferenca) : null;

  return (
    <Card className="group h-full overflow-hidden transition-shadow duration-200 hover:shadow-raised">
      <CardContent className="flex h-full flex-col gap-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CodigoBadge codigo={caixa.codigo} />
          <Badge variant={VARIANTE_STATUS_CAIXA[caixa.status]}>
            {LABEL_STATUS_CAIXA[caixa.status]}
          </Badge>
        </div>

        <div>
          <Link
            to="/caixa/$id"
            params={{ id: caixa.id }}
            className="font-display text-2xl leading-tight transition-colors hover:text-primary"
          >
            {formatarMoeda(caixa.resumo.saldoEsperado)}
          </Link>
          <p className="mt-1 text-xs font-medium text-muted-foreground">Saldo esperado</p>
        </div>

        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-2 text-foreground/85">
            <Clock3 aria-hidden className="size-3.5 text-muted-foreground/70" />
            {formatarDataHora(caixa.abertura.dataHora)}
          </p>
          <p className="flex items-center gap-2 text-foreground/85">
            <UserRound aria-hidden className="size-3.5 text-muted-foreground/70" />
            {caixa.abertura.responsavelNome}
          </p>
          <p className="flex items-center gap-2 text-foreground/85">
            <Landmark aria-hidden className="size-3.5 text-muted-foreground/70" />
            {caixa.resumo.quantidadeVendas}{" "}
            {pluralizar(caixa.resumo.quantidadeVendas, "venda", "vendas")} ·{" "}
            {caixa.resumo.quantidadeMovimentacoes} mov.
          </p>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Entradas</p>
            <p className="flex items-center gap-1 text-base font-semibold tabular-nums text-success">
              <ArrowUpCircle aria-hidden className="size-3.5" />
              {formatarMoeda(caixa.resumo.totalEntradas)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Saídas</p>
            <p className="flex items-center gap-1 text-base font-semibold tabular-nums text-destructive">
              <ArrowDownCircle aria-hidden className="size-3.5" />
              {formatarMoeda(caixa.resumo.totalSaidas)}
            </p>
          </div>
        </div>

        {caixa.fechamento && diferenca ? (
          <p
            className={
              diferenca === "conferido"
                ? "text-xs font-medium text-success"
                : diferenca === "sobra"
                  ? "text-xs font-medium text-warning"
                  : "text-xs font-medium text-destructive"
            }
          >
            {LABEL_DIFERENCA[diferenca]}
            {diferenca === "conferido"
              ? ""
              : ` · ${formatarMoeda(Math.abs(caixa.fechamento.diferenca))}`}
          </p>
        ) : (
          <p className="text-xs text-primary">Caixa em operação</p>
        )}
      </CardContent>
    </Card>
  );
}
