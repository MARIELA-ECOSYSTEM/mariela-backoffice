/**
 * Contrato de facetas da tela de Vendas — fonte única de verdade para a UI
 * (labels/opções) e para o mock (filtro + counts). Mesmo padrão de
 * `caixas-facetas.ts`: `vendedor`, `cliente`, `pagamento` e `caixa` têm
 * valores DINÂMICOS (derivados de `itens`), os demais são fixos.
 */

import { STATUS_VENDA, type VendaResumo } from "@/types/venda";
import {
  FAIXAS_VALOR_VENDA,
  OPCOES_PERIODO_VENDA,
  vendaNaFaixa,
  vendaNoPeriodo,
  type PeriodoVenda,
} from "@/utils/venda";
import { valoresUnicos, type FacetaServidor } from "./facetas-servidor";

export const FACETAS_VENDA = {
  status: "status",
  periodo: "periodo",
  vendedor: "vendedor",
  cliente: "cliente",
  pagamento: "pagamento",
  caixa: "caixa",
  valor: "valor",
  condicoes: "condicoes",
  financeiro: "financeiro",
} as const;

export const facetasVenda: FacetaServidor<VendaResumo>[] = [
  {
    id: FACETAS_VENDA.status,
    valores: () => [...STATUS_VENDA],
    corresponde: (venda, valor) => venda.status === valor,
  },
  {
    id: FACETAS_VENDA.periodo,
    valores: () => OPCOES_PERIODO_VENDA.map((opcao) => opcao.valor),
    corresponde: (venda, valor) => vendaNoPeriodo(venda, valor as PeriodoVenda),
  },
  {
    id: FACETAS_VENDA.vendedor,
    valores: (itens) => valoresUnicos(itens.map((venda) => venda.vendedorId)),
    corresponde: (venda, valor) => venda.vendedorId === valor,
  },
  {
    id: FACETAS_VENDA.cliente,
    valores: (itens) => valoresUnicos(itens.map((venda) => venda.clienteId ?? "consumidor-final")),
    corresponde: (venda, valor) =>
      valor === "consumidor-final" ? venda.clienteId === null : venda.clienteId === valor,
  },
  {
    id: FACETAS_VENDA.pagamento,
    valores: (itens) => valoresUnicos(itens.map((venda) => venda.formaPagamento)),
    corresponde: (venda, valor) => venda.formaPagamento === valor,
  },
  {
    id: FACETAS_VENDA.caixa,
    valores: (itens) => valoresUnicos(itens.map((venda) => venda.caixaCodigo)),
    corresponde: (venda, valor) => venda.caixaCodigo === valor,
  },
  {
    id: FACETAS_VENDA.valor,
    valores: () => FAIXAS_VALOR_VENDA.map((faixa) => faixa.valor),
    corresponde: (venda, valor) => vendaNaFaixa(venda, valor),
  },
  {
    id: FACETAS_VENDA.condicoes,
    valores: () => ["promocao", "desconto", "cheio"],
    corresponde: (venda, valor) =>
      valor === "promocao"
        ? venda.temPromocao
        : valor === "desconto"
          ? venda.temDesconto
          : !venda.temPromocao && !venda.temDesconto,
  },
  {
    id: FACETAS_VENDA.financeiro,
    valores: () => ["quitada", "pendente", "parcelada", "devolucao"],
    corresponde: (venda, valor) =>
      valor === "quitada"
        ? venda.valorPendente === 0
        : valor === "pendente"
          ? venda.valorPendente > 0
          : valor === "parcelada"
            ? venda.totalParcelas > 1
            : venda.valorDevolvido > 0,
  },
];
