/**
 * Contrato de facetas da tela de Caixa — fonte única de verdade para a UI
 * (labels/opções) e para o mock (filtro + counts). Mesmo padrão de
 * `campanhas-facetas.ts`/`vendedores-facetas.ts`, com uma particularidade: a
 * faceta `responsavel` tem valores DINÂMICOS (nomes reais encontrados nos
 * caixas), não uma lista fixa — por isso `valores()` deriva de `itens`.
 */

import { STATUS_CAIXA, type Caixa } from "@/types/caixa";
import {
  caixaNaFaixa,
  caixaNoPeriodo,
  caixaTemDiferenca,
  FAIXAS_SALDO_CAIXA,
  OPCOES_DIFERENCA_CAIXA,
  OPCOES_PERIODO_CAIXA,
  type PeriodoCaixa,
} from "@/utils/caixa";
import { valoresUnicos, type FacetaServidor } from "./facetas-servidor";

export const FACETAS_CAIXA = {
  status: "status",
  periodo: "periodo",
  responsavel: "responsavel",
  diferenca: "diferenca",
  saldo: "saldo",
} as const;

export const facetasCaixa: FacetaServidor<Caixa>[] = [
  {
    id: FACETAS_CAIXA.status,
    valores: () => [...STATUS_CAIXA],
    corresponde: (caixa, valor) => caixa.status === valor,
  },
  {
    id: FACETAS_CAIXA.periodo,
    valores: () => OPCOES_PERIODO_CAIXA.map((opcao) => opcao.valor),
    corresponde: (caixa, valor) => caixaNoPeriodo(caixa, valor as PeriodoCaixa),
  },
  {
    id: FACETAS_CAIXA.responsavel,
    valores: (itens) => valoresUnicos(itens.map((caixa) => caixa.abertura.responsavelNome)),
    corresponde: (caixa, valor) => caixa.abertura.responsavelNome === valor,
  },
  {
    id: FACETAS_CAIXA.diferenca,
    valores: () => OPCOES_DIFERENCA_CAIXA.map((opcao) => opcao.valor),
    corresponde: (caixa, valor) => caixaTemDiferenca(caixa, valor),
  },
  {
    id: FACETAS_CAIXA.saldo,
    valores: () => FAIXAS_SALDO_CAIXA.map((faixa) => faixa.valor),
    corresponde: (caixa, valor) => caixaNaFaixa(caixa, valor),
  },
];
