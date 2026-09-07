import type { Ordem, OrdenarVendaPor, StatusVenda, VendaResumo } from "@/types/venda";

/** Variante visual do badge de status — padrão único do backoffice. */
export const VARIANTE_STATUS_VENDA: Record<StatusVenda, "success" | "warning" | "destructive"> = {
  concluida: "success",
  em_pagamento: "warning",
  cancelada: "destructive",
};

export type OrdenacaoVenda =
  "data-desc" | "data-asc" | "valor-desc" | "valor-asc" | "pendente-desc";

export const OPCOES_ORDENACAO_VENDA: { valor: OrdenacaoVenda; label: string }[] = [
  { valor: "data-desc", label: "Mais recentes" },
  { valor: "data-asc", label: "Mais antigas" },
  { valor: "valor-desc", label: "Maior valor" },
  { valor: "valor-asc", label: "Menor valor" },
  { valor: "pendente-desc", label: "Maior valor pendente" },
];

/**
 * Converte a opção combinada do seletor (`OPCOES_ORDENACAO_VENDA`) em
 * `ordenarPor`/`ordem` — o par que a API (`ListarVendasQueryDto`) realmente
 * espera. A ordenação passou a acontecer no servidor; este mapa existe só
 * para preservar o rótulo único já exposto na tela.
 */
export function paraOrdenarPorEOrdem(valor: OrdenacaoVenda): {
  ordenarPor: OrdenarVendaPor;
  ordem: Ordem;
} {
  switch (valor) {
    case "data-asc":
      return { ordenarPor: "data", ordem: "asc" };
    case "valor-desc":
      return { ordenarPor: "valor", ordem: "desc" };
    case "valor-asc":
      return { ordenarPor: "valor", ordem: "asc" };
    case "pendente-desc":
      return { ordenarPor: "pendente", ordem: "desc" };
    case "data-desc":
    default:
      return { ordenarPor: "data", ordem: "desc" };
  }
}

/** @deprecated A ordenação agora é feita pelo backend (ver `paraOrdenarPorEOrdem`); mantida para compatibilidade de testes/consumidores que ainda ordenam localmente. */
export function ordenarVendas(vendas: VendaResumo[], ordem: OrdenacaoVenda): VendaResumo[] {
  const lista = [...vendas];
  switch (ordem) {
    case "data-asc":
      return lista.sort((a, b) => a.dataVenda.localeCompare(b.dataVenda));
    case "valor-desc":
      return lista.sort((a, b) => b.valorFinal - a.valorFinal);
    case "valor-asc":
      return lista.sort((a, b) => a.valorFinal - b.valorFinal);
    case "pendente-desc":
      return lista.sort((a, b) => b.valorPendente - a.valorPendente);
    default:
      return lista.sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));
  }
}

export type PeriodoVenda = "hoje" | "7d" | "30d" | "mes" | "mes-anterior";

export const OPCOES_PERIODO_VENDA: { valor: PeriodoVenda; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "7d", label: "Últimos 7 dias" },
  { valor: "30d", label: "Últimos 30 dias" },
  { valor: "mes", label: "Mês atual" },
  { valor: "mes-anterior", label: "Mês anterior" },
];

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** Uma venda pertence ao período? Regra usada tanto no filtro quanto na contagem. */
export function vendaNoPeriodo(venda: VendaResumo, periodo: PeriodoVenda): boolean {
  const data = new Date(venda.dataVenda);
  const hoje = inicioDoDia(new Date());

  if (periodo === "hoje") return inicioDoDia(data).getTime() === hoje.getTime();

  if (periodo === "7d" || periodo === "30d") {
    const dias = periodo === "7d" ? 7 : 30;
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() - (dias - 1));
    return data.getTime() >= limite.getTime();
  }

  const referencia = new Date();
  if (periodo === "mes-anterior") referencia.setMonth(referencia.getMonth() - 1);
  return (
    data.getFullYear() === referencia.getFullYear() && data.getMonth() === referencia.getMonth()
  );
}

/** Faixas de valor usadas no filtro facetado. */
export const FAIXAS_VALOR_VENDA: { valor: string; label: string; min: number; max: number }[] = [
  { valor: "ate-200", label: "Até R$ 200", min: 0, max: 200 },
  { valor: "200-500", label: "R$ 200 a R$ 500", min: 200, max: 500 },
  { valor: "500-1000", label: "R$ 500 a R$ 1.000", min: 500, max: 1000 },
  { valor: "acima-1000", label: "Acima de R$ 1.000", min: 1000, max: Number.POSITIVE_INFINITY },
];

export function vendaNaFaixa(venda: VendaResumo, faixa: string): boolean {
  const definicao = FAIXAS_VALOR_VENDA.find((item) => item.valor === faixa);
  if (!definicao) return true;
  return venda.valorFinal > definicao.min && venda.valorFinal <= definicao.max;
}

/** Percentual de desconto aplicado sobre o valor bruto. */
export function percentualDesconto(venda: VendaResumo): number {
  if (venda.valorBruto <= 0) return 0;
  return Number(((venda.descontoTotal / venda.valorBruto) * 100).toFixed(1));
}

/** Uma venda cancelada/devolvida não pode receber novas operações. */
export function vendaImutavel(venda: VendaResumo): boolean {
  return venda.status === "cancelada";
}

export function descricaoItemVenda(item: { cor: string | null; tamanho: string | null }): string {
  return (
    [item.cor, item.tamanho ? `Tam. ${item.tamanho}` : null].filter(Boolean).join(" · ") || "—"
  );
}
