import type { Cliente } from "@/types/cliente";
import type { Produto } from "@/types/produto";
import type { Vendedor } from "@/types/vendedor";
import type { StatusVenda, VendaResumo } from "@/types/venda";
import { precoFinal } from "@/utils/produto";
import { FORMAS_PAGAMENTO } from "./seed";

/** PRNG determinístico — a demonstração precisa ser estável entre recarregamentos. */
function prng(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const DIAS_HISTORICO = 75;

/**
 * Gera vendas de demonstração distribuídas pelos dias dos últimos meses,
 * sempre derivadas de produtos, clientes e vendedores reais do mock — assim os
 * indicadores do Dashboard permanecem matematicamente coerentes entre si.
 */
export function seedVendas(
  produtos: Produto[],
  clientes: Cliente[],
  vendedores: Vendedor[],
): VendaResumo[] {
  const aleatorio = prng(20260822);
  const catalogo = produtos.filter((produto) => produto.precoVenda > 0);
  const compradoras = clientes.length ? clientes : [];
  const equipe = vendedores.filter((vendedor) => vendedor.ativo);
  if (!catalogo.length || !equipe.length) return [];

  const vendas: VendaResumo[] = [];
  let sequencia = 1000;

  for (let diasAtras = DIAS_HISTORICO; diasAtras >= 0; diasAtras -= 1) {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - diasAtras);
    const diaSemana = base.getDay();
    // Domingo fechado; sábado com movimento maior.
    if (diaSemana === 0) continue;
    const teto = diaSemana === 6 ? 9 : 6;
    const quantidadeVendas = Math.floor(aleatorio() * teto) + (diaSemana === 6 ? 2 : 1);

    for (let i = 0; i < quantidadeVendas; i += 1) {
      const itens = 1 + Math.floor(aleatorio() * 4);
      let valorFinal = 0;
      for (let item = 0; item < itens; item += 1) {
        const produto = catalogo[Math.floor(aleatorio() * catalogo.length)]!;
        valorFinal += precoFinal(produto);
      }
      const vendedor = equipe[Math.floor(aleatorio() * equipe.length)]!;
      const cliente = compradoras.length
        ? (compradoras[Math.floor(aleatorio() * compradoras.length)] ?? null)
        : null;
      const sorteioStatus = aleatorio();
      const status: StatusVenda =
        diasAtras <= 2 && sorteioStatus > 0.9
          ? "pendente"
          : sorteioStatus > 0.97
            ? "cancelada"
            : "concluida";

      const dataVenda = new Date(base);
      dataVenda.setHours(9 + Math.floor(aleatorio() * 11), Math.floor(aleatorio() * 60), 0, 0);

      sequencia += 1;
      vendas.push({
        id: `vnd_${sequencia}`,
        numero: String(sequencia).padStart(6, "0"),
        dataVenda: dataVenda.toISOString(),
        clienteId: cliente?.id ?? null,
        clienteNome: cliente?.nome ?? "Consumidor final",
        vendedorId: vendedor.id,
        vendedorNome: vendedor.nome,
        totalItens: itens,
        valorFinal: Number(valorFinal.toFixed(2)),
        formaPagamento: FORMAS_PAGAMENTO[Math.floor(aleatorio() * FORMAS_PAGAMENTO.length)]!,
        status,
      });
    }
  }

  return vendas.sort(
    (a, b) => new Date(b.dataVenda).getTime() - new Date(a.dataVenda).getTime(),
  );
}
