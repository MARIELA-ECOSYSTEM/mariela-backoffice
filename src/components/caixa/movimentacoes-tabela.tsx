import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import {
  LABEL_ORIGEM_MOVIMENTACAO,
  LABEL_TIPO_MOVIMENTACAO,
  type MovimentacaoCaixa,
} from "@/types/caixa";
import { formatarDataHora, formatarMoeda } from "@/utils/format";

function Coluna({
  children,
  alinharDireita,
}: {
  children: React.ReactNode;
  alinharDireita?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`py-2 text-xs font-medium text-muted-foreground ${alinharDireita ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

/** Tabela de movimentações — somente leitura: o histórico financeiro é imutável. */
export function MovimentacoesTabela({
  movimentacoes,
  vazio = "Nenhuma movimentação registrada neste caixa.",
}: {
  movimentacoes: MovimentacaoCaixa[];
  vazio?: string;
}) {
  if (movimentacoes.length === 0) {
    return <EmptyState titulo="Sem movimentações" descricao={vazio} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="border-b border-border/70">
            <Coluna>Data / hora</Coluna>
            <Coluna>Tipo</Coluna>
            <Coluna>Descrição</Coluna>
            <Coluna>Origem</Coluna>
            <Coluna>Pagamento</Coluna>
            <Coluna alinharDireita>Valor</Coluna>
          </tr>
        </thead>
        <tbody>
          {movimentacoes.map((movimentacao) => {
            const entrada = movimentacao.sentido === "entrada";
            const Icone = entrada ? ArrowUpRight : ArrowDownRight;
            return (
              <tr
                key={movimentacao.id}
                className="border-b border-border/40 last:border-0 hover:bg-surface/60"
              >
                <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                  {formatarDataHora(movimentacao.dataHora)}
                </td>
                <td className="py-2.5">
                  <Badge
                    variant={entrada ? "secondary" : "outline"}
                    className="gap-1 whitespace-nowrap"
                  >
                    <Icone aria-hidden className="size-3" />
                    {LABEL_TIPO_MOVIMENTACAO[movimentacao.tipo]}
                  </Badge>
                </td>
                <td className="max-w-[18rem] py-2.5">
                  <p className="truncate font-medium">{movimentacao.descricao}</p>
                  {movimentacao.vendaId ? (
                    <Link
                      to="/vendas/$id"
                      params={{ id: movimentacao.vendaId }}
                      className="text-xs text-primary hover:underline"
                    >
                      {movimentacao.vendaCodigo}
                    </Link>
                  ) : movimentacao.motivo ? (
                    <p className="text-xs text-muted-foreground">{movimentacao.motivo}</p>
                  ) : null}
                </td>
                <td className="py-2.5 text-muted-foreground">
                  {LABEL_ORIGEM_MOVIMENTACAO[movimentacao.origem]}
                </td>
                <td className="py-2.5 text-muted-foreground">{movimentacao.formaPagamento}</td>
                <td
                  className={`relative py-2.5 text-right text-base font-semibold whitespace-nowrap tabular-nums ${
                    entrada ? "text-success" : "text-destructive"
                  }`}
                >
                  <span className="sr-only">{entrada ? "Entrada de" : "Saída de"} </span>
                  <span aria-hidden>{entrada ? "+" : "−"} </span>
                  {formatarMoeda(movimentacao.valor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
