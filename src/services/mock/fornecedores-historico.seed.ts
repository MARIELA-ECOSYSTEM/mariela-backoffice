import type { Fornecedor, FornecedorHistoricoItem } from "@/types/fornecedor";
import type { Produto } from "@/types/produto";
import { precoFinal } from "@/utils/produto";

/**
 * Histórico determinístico de vínculos produto × fornecedor.
 *
 * O vínculo vive em `produto.fornecedorId` (relação atual) — o backend real
 * não tem conceito de "vínculo encerrado" (não há coleção/histórico de troca
 * de fornecedor). Este seed reflete só isso: nenhum dado fictício de vínculo
 * encerrado é fabricado (ver auditoria pré-corte, achado B9).
 */
export function seedHistoricoFornecedores(
  produtos: Produto[],
  _fornecedores: Fornecedor[],
): FornecedorHistoricoItem[] {
  const historico: FornecedorHistoricoItem[] = [];
  let sequencia = 0;

  produtos.forEach((produto) => {
    if (!produto.fornecedorId) return;
    sequencia += 1;
    historico.push({
      id: `fvh_${sequencia}`,
      produtoId: produto.id,
      produtoNome: produto.nome,
      codProduto: produto.codProduto,
      vinculadoEm: produto.criadoEm,
      desvinculadoEm: null,
      precoCusto: produto.precoCusto,
      precoVenda: precoFinal(produto),
      situacao: "atual",
    });
  });

  return historico;
}

/** Histórico de um fornecedor, mais recentes primeiro. */
export function historicoDoFornecedor(
  fornecedorId: string,
  historico: FornecedorHistoricoItem[],
  produtos: Produto[],
): FornecedorHistoricoItem[] {
  return historico
    .filter((item) => produtos.find((registro) => registro.id === item.produtoId)?.fornecedorId === fornecedorId)
    .sort((a, b) => b.vinculadoEm.localeCompare(a.vinculadoEm));
}

/**
 * Agregados comerciais do fornecedor — o NestJS devolverá isso já calculado
 * (aggregation pipeline sobre produtos).
 */
export function agregadosDoFornecedor(
  fornecedorId: string,
  produtos: Produto[],
): { produtosVinculados: number; valorEmCusto: number; ultimaEntrada: string | null } {
  const vinculados = produtos.filter((produto) => produto.fornecedorId === fornecedorId);
  if (!vinculados.length) {
    return { produtosVinculados: 0, valorEmCusto: 0, ultimaEntrada: null };
  }
  // Valor em custo = custo unitário × quantidade em estoque dos produtos vinculados.
  const valor = vinculados.reduce(
    (soma, produto) => soma + produto.precoCusto * produto.quantidadeTotal,
    0,
  );
  const ultima = vinculados.reduce(
    (maior, produto) => (produto.criadoEm > maior ? produto.criadoEm : maior),
    vinculados[0]!.criadoEm,
  );
  return {
    produtosVinculados: vinculados.length,
    valorEmCusto: Number(valor.toFixed(2)),
    ultimaEntrada: ultima,
  };
}
