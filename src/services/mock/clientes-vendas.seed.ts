import { formatarCodigoVenda } from "@/lib/codigos";
import type { Cliente } from "@/types/cliente";
import type { Produto } from "@/types/produto";
import type { Vendedor } from "@/types/vendedor";
import type { VendaResumo } from "@/types/venda";
import { precoFinal } from "@/utils/produto";
import { FORMAS_PAGAMENTO, PLANO_COMPRAS_CLIENTES } from "./seed";

/**
 * Vendas determinísticas vinculadas às clientes do seed.
 *
 * Existem para demonstrar os agregados (compras, total comprado, última compra)
 * e o filtro de recência. Nada aqui é aleatório: o mesmo reload produz sempre
 * os mesmos números.
 */
export function seedVendasClientes(
  produtos: Produto[],
  clientes: Cliente[],
  vendedores: Vendedor[],
): VendaResumo[] {
  const catalogo = produtos.filter((produto) => produto.precoVenda > 0);
  const equipe = vendedores.filter((vendedor) => vendedor.ativo);
  if (!catalogo.length || !equipe.length) return [];

  const vendas: VendaResumo[] = [];
  let sequencia = 5000;

  PLANO_COMPRAS_CLIENTES.forEach((plano, indiceCliente) => {
    const cliente = clientes.find((registro) => registro.id === plano.clienteId);
    if (!cliente) return;

    plano.diasAtras.forEach((diasAtras, indiceCompra) => {
      const dataVenda = new Date();
      dataVenda.setHours(0, 0, 0, 0);
      dataVenda.setDate(dataVenda.getDate() - diasAtras);
      dataVenda.setHours(10 + ((indiceCliente + indiceCompra) % 9), (indiceCompra * 7) % 60, 0, 0);

      const totalItens = 1 + ((indiceCliente + indiceCompra) % 3);
      let valorFinal = 0;
      for (let item = 0; item < totalItens; item += 1) {
        const produto =
          catalogo[(indiceCliente * 3 + indiceCompra * 2 + item) % catalogo.length]!;
        valorFinal += precoFinal(produto);
      }

      const vendedor = equipe[(indiceCliente + indiceCompra) % equipe.length]!;
      sequencia += 1;

      vendas.push({
        id: `vnd_cli_${sequencia}`,
        numero: String(sequencia).padStart(6, "0"),
        codigo: formatarCodigoVenda(dataVenda, sequencia),
        dataVenda: dataVenda.toISOString(),
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        vendedorId: vendedor.id,
        vendedorNome: vendedor.nome,
        totalItens,
        valorFinal: Number(valorFinal.toFixed(2)),
        formaPagamento: FORMAS_PAGAMENTO[(indiceCliente + indiceCompra) % FORMAS_PAGAMENTO.length]!,
        status: "concluida",
      });
    });
  });

  return vendas;
}

/** Agregados de compras por cliente — o NestJS devolverá isso já calculado. */
export function agregadosDoCliente(
  clienteId: string,
  vendas: VendaResumo[],
): { compras: number; totalComprado: number; ultimaCompra: string | null } {
  const doCliente = vendas.filter(
    (venda) => venda.clienteId === clienteId && venda.status !== "cancelada",
  );
  if (!doCliente.length) return { compras: 0, totalComprado: 0, ultimaCompra: null };
  const total = doCliente.reduce((soma, venda) => soma + venda.valorFinal, 0);
  const ultima = doCliente.reduce(
    (maior, venda) => (venda.dataVenda > maior ? venda.dataVenda : maior),
    doCliente[0]!.dataVenda,
  );
  return {
    compras: doCliente.length,
    totalComprado: Number(total.toFixed(2)),
    ultimaCompra: ultima,
  };
}

/** Vendas de um cliente, mais recentes primeiro. */
export function vendasDoCliente(clienteId: string, vendas: VendaResumo[]): VendaResumo[] {
  return vendas
    .filter((venda) => venda.clienteId === clienteId)
    .sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));
}
