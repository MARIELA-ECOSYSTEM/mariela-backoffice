/**
 * Contrato de facetas da tela de Vendedores — fonte única de verdade para a UI
 * (labels/opções) e para o mock (filtro + counts). Quando a API NestJS
 * assume a listagem, apenas o mock para de usar os predicados: as chaves e
 * os valores enviados/recebidos continuam os mesmos (mesmo padrão de
 * `campanhas-facetas.ts`/`colecoes-facetas.ts`).
 */

import type { Vendedor } from "@/types/vendedor";
import {
  naFaixaDeValor,
  naFaixaDeVendas,
  nascimentoNoMes,
  ultimaVendaNoPeriodo,
} from "@/utils/vendedor";
import type { FacetaServidor } from "./facetas-servidor";

export const FACETAS_VENDEDOR = {
  status: "status",
  vendas: "vendas",
  valor: "valor",
  ultimaVenda: "ultimaVenda",
  nascimento: "nascimento",
  observacao: "observacao",
} as const;

export const facetasVendedor: FacetaServidor<Vendedor>[] = [
  {
    id: FACETAS_VENDEDOR.status,
    valores: () => ["ativos", "inativos"],
    corresponde: (vendedor, valor) => (valor === "ativos" ? vendedor.ativo : !vendedor.ativo),
  },
  {
    id: FACETAS_VENDEDOR.vendas,
    valores: () => ["sem", "1-5", "6-20", "21+"],
    corresponde: (vendedor, valor) => naFaixaDeVendas(vendedor.vendas, valor),
  },
  {
    id: FACETAS_VENDEDOR.valor,
    valores: () => ["ate-500", "500-2000", "2000-10000", "10000+"],
    corresponde: (vendedor, valor) => naFaixaDeValor(vendedor.totalVendido, valor),
  },
  {
    id: FACETAS_VENDEDOR.ultimaVenda,
    valores: () => ["7", "30", "90", "nunca"],
    corresponde: (vendedor, valor) => ultimaVendaNoPeriodo(vendedor, valor),
  },
  {
    id: FACETAS_VENDEDOR.nascimento,
    valores: () => ["mes", "com", "sem"],
    corresponde: (vendedor, valor) =>
      valor === "mes"
        ? nascimentoNoMes(vendedor.dataNascimento)
        : valor === "com"
          ? Boolean(vendedor.dataNascimento)
          : !vendedor.dataNascimento,
  },
  {
    id: FACETAS_VENDEDOR.observacao,
    valores: () => ["com", "sem"],
    corresponde: (vendedor, valor) =>
      valor === "com" ? Boolean(vendedor.observacao) : !vendedor.observacao,
  },
];
