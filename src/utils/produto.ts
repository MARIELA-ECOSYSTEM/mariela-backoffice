import type { Produto } from "@/types/produto";

export const ESTOQUE_BAIXO = 5;

export function precoFinal(
  produto: Pick<Produto, "ehPromocao" | "precoPromocional" | "precoVenda">,
): number {
  if (produto.ehPromocao && produto.precoPromocional) return produto.precoPromocional;
  return produto.precoVenda;
}

export function calcularMargem(precoCusto: number, precoFinalValor: number): number {
  if (!precoCusto || precoCusto <= 0) return 0;
  return Number((((precoFinalValor - precoCusto) / precoCusto) * 100).toFixed(2));
}

export type StatusEstoque = "disponivel" | "baixo" | "sem-estoque";

export function statusEstoque(quantidadeTotal: number): StatusEstoque {
  if (quantidadeTotal <= 0) return "sem-estoque";
  if (quantidadeTotal <= ESTOQUE_BAIXO) return "baixo";
  return "disponivel";
}

export const LABEL_STATUS: Record<StatusEstoque, string> = {
  disponivel: "Disponível",
  baixo: "Estoque baixo",
  "sem-estoque": "Sem estoque",
};
