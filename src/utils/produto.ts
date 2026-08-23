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

/** Lucro em R$ sobre o preço vigente (promocional quando ativo). */
export function lucroFinal(
  produto: Pick<Produto, "ehPromocao" | "precoPromocional" | "precoVenda" | "precoCusto">,
): number {
  return Number((precoFinal(produto) - produto.precoCusto).toFixed(2));
}

/** Margem % sobre o preço vigente — mesma regra usada pela API. */
export function margemVigente(
  produto: Pick<Produto, "ehPromocao" | "precoPromocional" | "precoVenda" | "precoCusto">,
): number {
  return calcularMargem(produto.precoCusto, precoFinal(produto));
}

export interface FotoProdutoItem {
  varianteId: string;
  cor: string;
  url: string;
  principal: boolean;
}

/**
 * Galeria do produto: uma foto por variante (cor), na ordem de cadastro.
 * A imagem principal é a variante marcada em `fotoPrincipalVarianteId`; sem
 * marcação vale a primeira foto cadastrada.
 */
export function fotosDoProduto(produto: Produto): FotoProdutoItem[] {
  const comFoto = produto.variantes.filter((variante) => Boolean(variante.foto));
  const principalId =
    comFoto.find((variante) => variante.id === produto.fotoPrincipalVarianteId)?.id ??
    comFoto[0]?.id ??
    null;
  const itens = comFoto.map((variante) => ({
    varianteId: variante.id,
    cor: variante.cor,
    url: variante.foto as string,
    principal: variante.id === principalId,
  }));
  // A principal sempre aparece primeiro na galeria e nos cards.
  return itens.sort((a, b) => Number(b.principal) - Number(a.principal));
}
