import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import {
  LABEL_ORIGEM_MOVIMENTACAO,
  LABEL_TIPO_MOVIMENTACAO,
  type MovimentacaoCaixa,
} from "@/types/caixa";
import { formatarDataHora, formatarMoeda } from "@/utils/format";

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
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-border/70 text-left">
            <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
              Data / hora
            </th>
            <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
              Tipo
            </th>
            <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
              Descrição
            </th>
            <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
              Origem
            </th>
            <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
              Pagamento
            </th>
            <th scope="col" className="text-eyebrow py-2 text-right text-[0.56rem]">
              Valor
            </th>
            <th scope="col" className="text-eyebrow py-2 text-[0.56rem]">
              Responsável
            </th>
          </tr>
        </thead>
        <tbody>
          {movimentacoes.map((movimentacao) => (
            <tr key={movimentacao.id} className="border-b border-border/40 last:border-0">
              <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                {formatarDataHora(movimentacao.dataHora)}
              </td>
              <td className="py-2.5">
                <Badge variant={movimentacao.sentido === "entrada" ? "secondary" : "outline"}>
                  {LABEL_TIPO_MOVIMENTACAO[movimentacao.tipo]}
                </Badge>
              </td>
              <td className="max-w-[18rem] py-2.5">
                <p className="truncate">{movimentacao.descricao}</p>
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
                className={
                  movimentacao.sentido === "entrada"
                    ? "py-2.5 text-right tabular-nums text-emerald-600"
                    : "py-2.5 text-right tabular-nums text-rose-600"
                }
              >
                {movimentacao.sentido === "entrada" ? "+" : "−"}{" "}
                {formatarMoeda(movimentacao.valor)}
              </td>
              <td className="py-2.5 text-muted-foreground">{movimentacao.responsavelNome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
