import { Link } from "@tanstack/react-router";
import { CreditCard, Landmark, Package, Percent, User, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { LABEL_STATUS_VENDA, type VendaResumo } from "@/types/venda";
import { VARIANTE_STATUS_VENDA, percentualDesconto } from "@/utils/venda";
import { formatarDataHora, formatarMoeda, pluralizar } from "@/utils/format";

function Linha({ icon: Icone, label, valor }: { icon: typeof User; label: string; valor: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icone aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="sr-only">{label}:</span>
      <span className="min-w-0 flex-1 truncate text-foreground/85">{valor}</span>
    </div>
  );
}

/** Card de venda — mesma linguagem visual das listagens de cadastros. */
export function VendaCard({ venda }: { venda: VendaResumo }) {
  const desconto = percentualDesconto(venda);

  return (
    <Card className="group h-full overflow-hidden transition-shadow duration-200 hover:shadow-raised">
      <CardContent className="flex h-full flex-col gap-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CodigoBadge codigo={venda.codigo} />
          <Badge variant={VARIANTE_STATUS_VENDA[venda.status]}>
            {LABEL_STATUS_VENDA[venda.status]}
          </Badge>
        </div>

        <div>
          <Link
            to="/vendas/$id"
            params={{ id: venda.id }}
            className="font-display text-2xl leading-tight transition-colors hover:text-primary"
          >
            {formatarMoeda(venda.valorFinal)}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">{formatarDataHora(venda.dataVenda)}</p>
        </div>

        <div className="space-y-1.5">
          <Linha icon={User} label="Cliente" valor={venda.clienteNome} />
          <Linha icon={UserRound} label="Vendedor" valor={venda.vendedorNome} />
          <Linha
            icon={Package}
            label="Itens"
            valor={`${venda.totalItens} ${pluralizar(venda.totalItens, "item", "itens")}`}
          />
          <Linha
            icon={CreditCard}
            label="Pagamento"
            valor={
              venda.totalParcelas > 1
                ? `${venda.formaPagamento} · ${venda.parcelasPagas}/${venda.totalParcelas} parcelas`
                : venda.formaPagamento
            }
          />
          {venda.caixaCodigo ? (
            <Linha icon={Landmark} label="Caixa" valor={venda.caixaCodigo} />
          ) : null}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-3 border-t border-border/70 pt-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Bruto</p>
            <p className="mt-0.5 text-sm tabular-nums">{formatarMoeda(venda.valorBruto)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Desconto</p>
            <p className="mt-0.5 text-sm tabular-nums">
              {venda.descontoTotal > 0 ? "− " : ""}
              {formatarMoeda(venda.descontoTotal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Pendente</p>
            <p
              className={
                venda.valorPendente > 0
                  ? "mt-0.5 text-sm font-semibold tabular-nums text-warning"
                  : "mt-0.5 text-sm tabular-nums text-muted-foreground"
              }
            >
              {formatarMoeda(venda.valorPendente)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {venda.temPromocao ? (
            <Badge variant="outline" className="gap-1">
              <Percent aria-hidden className="size-3" />
              Promoção
            </Badge>
          ) : null}
          {venda.temDesconto ? <Badge variant="outline">Desconto {desconto}%</Badge> : null}
          {venda.valorDevolvido > 0 ? (
            <Badge variant="outline">Devolvido {formatarMoeda(venda.valorDevolvido)}</Badge>
          ) : null}
          <Link
            to="/vendas/$id"
            params={{ id: venda.id }}
            className="ml-auto text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver detalhes
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function VendasGridSkeleton({ itens = 8 }: { itens?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: itens }).map((_, index) => (
        <Skeleton key={index} className="h-72 rounded-xl" />
      ))}
    </div>
  );
}

export function VendasGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>;
}
