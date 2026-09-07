/**
 * Contrato de facetas da tela de Fornecedores — fonte única de verdade para a
 * UI (labels/opções) e para o mock (filtro + counts). Quando a API NestJS
 * assume a listagem, apenas o mock para de usar os predicados: as chaves e os
 * valores enviados/recebidos continuam os mesmos (mesmo padrão de
 * `produtos-facetas.ts`/`clientes-facetas.ts`).
 */

import type { Fornecedor } from "@/types/fornecedor";
import { naFaixaDeProdutos, temEndereco, ultimaEntradaDentroDe } from "@/utils/fornecedor";
import type { FacetaServidor } from "./facetas-servidor";

export const FACETAS_FORNECEDOR = {
  produtos: "produtos",
  endereco: "endereco",
  entrada: "entrada",
  documento: "documento",
} as const;

export const facetasFornecedor: FacetaServidor<Fornecedor>[] = [
  {
    id: FACETAS_FORNECEDOR.produtos,
    valores: () => ["sem", "1-5", "6-15", "16+"],
    corresponde: (fornecedor, valor) => naFaixaDeProdutos(fornecedor.produtosVinculados, valor),
  },
  {
    id: FACETAS_FORNECEDOR.endereco,
    valores: () => ["com", "sem"],
    corresponde: (fornecedor, valor) =>
      valor === "com" ? temEndereco(fornecedor) : !temEndereco(fornecedor),
  },
  {
    id: FACETAS_FORNECEDOR.entrada,
    valores: () => ["30", "90", "nunca"],
    corresponde: (fornecedor, valor) =>
      valor === "nunca"
        ? !fornecedor.ultimaEntrada
        : ultimaEntradaDentroDe(fornecedor, Number(valor)),
  },
  {
    id: FACETAS_FORNECEDOR.documento,
    valores: () => ["com", "sem"],
    corresponde: (fornecedor, valor) =>
      valor === "com" ? Boolean(fornecedor.cnpj) : !fornecedor.cnpj,
  },
];
