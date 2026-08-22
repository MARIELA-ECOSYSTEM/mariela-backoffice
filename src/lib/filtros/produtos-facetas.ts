/**
 * Contrato de facetas do catálogo de produtos — fonte única de verdade para a
 * UI (labels/opções) e para o mock (filtro + counts). Quando a API NestJS
 * assumir, apenas o mock para de usar os predicados: as chaves e os valores
 * enviados/recebidos continuam os mesmos.
 */

import type { Produto } from "@/types/produto";
import { valoresUnicos, type FacetaServidor } from "./facetas-servidor";

export const FACETAS_PRODUTO = {
  categorias: "categorias",
  colecoes: "colecoes",
  campanhas: "campanhas",
  fornecedores: "fornecedores",
  estoque: "estoque",
  promocao: "promocao",
  novidade: "novidade",
} as const;

export const COM_ESTOQUE = "com_estoque";
export const SEM_ESTOQUE = "sem_estoque";
export const EM_PROMOCAO = "promocao";
export const SEM_PROMOCAO = "sem_promocao";
export const EH_NOVIDADE = "novidade";
export const SEM_NOVIDADE = "sem_novidade";

export const facetasProduto: FacetaServidor<Produto>[] = [
  {
    id: FACETAS_PRODUTO.categorias,
    valores: (itens) => valoresUnicos(itens.map((produto) => produto.categoria)),
    corresponde: (produto, valor) => produto.categoria === valor,
  },
  {
    id: FACETAS_PRODUTO.colecoes,
    valores: (itens) => valoresUnicos(itens.map((produto) => produto.colecaoId)),
    corresponde: (produto, valor) => produto.colecaoId === valor,
  },
  {
    id: FACETAS_PRODUTO.campanhas,
    valores: (itens) => valoresUnicos(itens.map((produto) => produto.campanhaId)),
    corresponde: (produto, valor) => produto.campanhaId === valor,
  },
  {
    id: FACETAS_PRODUTO.fornecedores,
    valores: (itens) => valoresUnicos(itens.map((produto) => produto.fornecedorId)),
    corresponde: (produto, valor) => produto.fornecedorId === valor,
  },
  {
    id: FACETAS_PRODUTO.estoque,
    valores: () => [COM_ESTOQUE, SEM_ESTOQUE],
    corresponde: (produto, valor) =>
      valor === COM_ESTOQUE ? produto.quantidadeTotal > 0 : produto.quantidadeTotal === 0,
  },
  {
    id: FACETAS_PRODUTO.promocao,
    valores: () => [EM_PROMOCAO, SEM_PROMOCAO],
    corresponde: (produto, valor) =>
      valor === EM_PROMOCAO ? produto.ehPromocao : !produto.ehPromocao,
  },
  {
    id: FACETAS_PRODUTO.novidade,
    valores: () => [EH_NOVIDADE, SEM_NOVIDADE],
    corresponde: (produto, valor) =>
      valor === EH_NOVIDADE ? produto.ehNovidade : !produto.ehNovidade,
  },
];
