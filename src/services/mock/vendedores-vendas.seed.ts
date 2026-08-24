import type { VendaResumo } from "@/types/venda";

/**
 * Agregados de vendas por vendedor — o NestJS devolverá isso já calculado.
 * As vendas continuam pertencendo ao MARIELA PDV: aqui só há leitura.
 */
export function agregadosDoVendedor(
  vendedorId: string,
  vendas: VendaResumo[],
): { vendas: number; totalVendido: number; ultimaVenda: string | null } {
  const doVendedor = vendas.filter(
    (venda) => venda.vendedorId === vendedorId && venda.status !== "cancelada",
  );
  if (!doVendedor.length) return { vendas: 0, totalVendido: 0, ultimaVenda: null };
  const total = doVendedor.reduce((soma, venda) => soma + venda.valorFinal, 0);
  const ultima = doVendedor.reduce(
    (maior, venda) => (venda.dataVenda > maior ? venda.dataVenda : maior),
    doVendedor[0]!.dataVenda,
  );
  return {
    vendas: doVendedor.length,
    totalVendido: Number(total.toFixed(2)),
    ultimaVenda: ultima,
  };
}

/** Vendas de um vendedor, mais recentes primeiro. */
export function vendasDoVendedor(vendedorId: string, vendas: VendaResumo[]): VendaResumo[] {
  return vendas
    .filter((venda) => venda.vendedorId === vendedorId)
    .sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));
}
