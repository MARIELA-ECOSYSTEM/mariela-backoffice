import type { Fornecedor, FornecedorHistoricoItem } from "@/types/fornecedor";
import type { Produto } from "@/types/produto";
import { precoFinal } from "@/utils/produto";

/**
 * Histórico determinístico de vínculos produto × fornecedor.
 *
 * Hoje o vínculo vive em `produto.fornecedorId` (relação atual). O histórico de
 * vínculos encerrados ainda não existe como coleção real — este seed cria
 * registros estáveis para demonstrar a tela e, principalmente, para fixar o
 * CONTRATO que o NestJS devolverá em `GET /fornecedores/:id/historico`.
 */
/**
 * Mapa auxiliar id-do-histórico → fornecedorId, apenas para os vínculos
 * encerrados (os atuais são resolvidos por `produto.fornecedorId`).
 */
export const vinculosAnteriores = new Map<string, string>();

export function seedHistoricoFornecedores(
  produtos: Produto[],
  fornecedores: Fornecedor[],
): FornecedorHistoricoItem[] {
  const historico: FornecedorHistoricoItem[] = [];
  let sequencia = 0;

  // 1. Vínculos ATUAIS — derivados da relação vigente do produto.
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

  // 2. Vínculos ENCERRADOS — a cada 3º produto, um fornecedor anterior.
  const comFornecedor = produtos.filter((produto) => produto.fornecedorId);
  comFornecedor.forEach((produto, indice) => {
    if (indice % 3 !== 0) return;
    const anterior = fornecedores.find((item) => item.id !== produto.fornecedorId);
    if (!anterior) return;

    const vinculadoEm = new Date(produto.criadoEm);
    vinculadoEm.setDate(vinculadoEm.getDate() - 120);
    const desvinculadoEm = new Date(produto.criadoEm);
    desvinculadoEm.setDate(desvinculadoEm.getDate() - 5);

    sequencia += 1;
    historico.push({
      id: `fvh_${sequencia}`,
      produtoId: produto.id,
      produtoNome: produto.nome,
      codProduto: produto.codProduto,
      vinculadoEm: vinculadoEm.toISOString(),
      desvinculadoEm: desvinculadoEm.toISOString(),
      precoCusto: Number((produto.precoCusto * 0.9).toFixed(2)),
      precoVenda: Number((precoFinal(produto) * 0.95).toFixed(2)),
      situacao: "historico",
    });
    // O registro encerrado pertence ao fornecedor ANTERIOR.
    vinculosAnteriores.set(`fvh_${sequencia}`, anterior.id);
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
    .filter((item) => {
      if (item.situacao === "historico") return vinculosAnteriores.get(item.id) === fornecedorId;
      const produto = produtos.find((registro) => registro.id === item.produtoId);
      return produto?.fornecedorId === fornecedorId;
    })
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
