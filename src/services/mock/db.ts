import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";
import type { Configuracoes } from "@/types/configuracoes";
import type { Cliente } from "@/types/cliente";
import type { Fornecedor, FornecedorHistoricoItem } from "@/types/fornecedor";
import type { Vendedor } from "@/types/vendedor";
import type { Colecao } from "@/types/colecao";
import type { Campanha } from "@/types/campanha";
import type { VendaDetalhe, VendaResumo } from "@/types/venda";
import type { Caixa, MovimentacaoCaixa, RecebimentoCaixa } from "@/types/caixa";
import { calcularMargem, precoFinal } from "@/utils/produto";
import {
  seedCampanhas,
  seedClientes,
  seedColecoes,
  seedConfiguracoes,
  seedFornecedores,
  seedVendedores,
  seedProdutos,
} from "./seed";
import { seedVendas } from "./vendas.seed";
import { seedVendasDetalhes } from "./vendas.detalhe.seed";
import { agregadosDoCliente, seedVendasClientes } from "./clientes-vendas.seed";
import { agregadosDoVendedor } from "./vendedores-vendas.seed";
import { agregadosDoFornecedor, seedHistoricoFornecedores } from "./fornecedores-historico.seed";

export interface MockDatabase {
  produtos: Produto[];
  configuracoes: Configuracoes;
  clientes: Cliente[];
  fornecedores: Fornecedor[];
  vendedores: Vendedor[];
  /** Hashes de senha dos vendedores — nunca expostos pela API mockada. */
  vendedoresSenhas: Record<string, string>;
  colecoes: Colecao[];
  campanhas: Campanha[];
  /** Vendas de leitura (fonte: MARIELA PDV) usadas pelos indicadores do Dashboard. */
  vendas: VendaResumo[];
  /** Detalhamento das vendas (itens, pagamentos, parcelas, histórico). */
  vendasDetalhes: VendaDetalhe[];
  /** Histórico de vínculos produto × fornecedor (somente leitura). */
  fornecedoresHistorico: FornecedorHistoricoItem[];
}

export const db: MockDatabase = {
  produtos: seedProdutos(),
  configuracoes: seedConfiguracoes(),
  clientes: seedClientes(),
  fornecedores: seedFornecedores(),
  vendedores: seedVendedores(),
  vendedoresSenhas: {},
  colecoes: seedColecoes(),
  campanhas: seedCampanhas(),
  vendas: [],
  vendasDetalhes: [],
  fornecedoresHistorico: [],
};

// Vendas anônimas (consumidor final) + vendas determinísticas vinculadas às clientes.
db.vendas = [
  ...seedVendas(db.produtos, [], db.vendedores),
  ...seedVendasClientes(db.produtos, db.clientes, db.vendedores),
].sort((a, b) => b.dataVenda.localeCompare(a.dataVenda));

// O detalhamento sincroniza os números do resumo (bruto, descontos, parcelas).
db.vendasDetalhes = seedVendasDetalhes(db.vendas, db.produtos);

db.fornecedoresHistorico = seedHistoricoFornecedores(db.produtos, db.fornecedores);

/** Reaplica os agregados de compras em todas as clientes do banco mock. */
export function sincronizarAgregadosClientes(): void {
  db.clientes.forEach((cliente) => {
    const resumo = agregadosDoCliente(cliente.id, db.vendas);
    cliente.compras = resumo.compras;
    cliente.totalComprado = resumo.totalComprado;
    cliente.ultimaCompra = resumo.ultimaCompra;
  });
}

/** Reaplica os agregados comerciais de todos os fornecedores. */
export function sincronizarAgregadosFornecedores(): void {
  db.fornecedores.forEach((fornecedor) => {
    const resumo = agregadosDoFornecedor(fornecedor.id, db.produtos);
    fornecedor.produtosVinculados = resumo.produtosVinculados;
    fornecedor.valorEmCusto = resumo.valorEmCusto;
    fornecedor.ultimaEntrada = resumo.ultimaEntrada;
  });
}

/** Reaplica os agregados de vendas de todos os vendedores. */
export function sincronizarAgregadosVendedores(): void {
  db.vendedores.forEach((vendedor) => {
    const resumo = agregadosDoVendedor(vendedor.id, db.vendas);
    vendedor.vendas = resumo.vendas;
    vendedor.totalVendido = resumo.totalVendido;
    vendedor.ultimaVenda = resumo.ultimaVenda;
  });
}

sincronizarAgregadosClientes();
sincronizarAgregadosFornecedores();
sincronizarAgregadosVendedores();

export function agora(): string {
  return new Date().toISOString();
}

let sequencia = 1000;
export function gerarId(prefixo: string): string {
  sequencia += 1;
  return `${prefixo}_${sequencia}`;
}

export function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

/** Recalcula quantidades da variante e do produto e mantém estoqueZeradoEm coerente. */
export function recalcularProduto(produto: Produto): Produto {
  produto.variantes.forEach((variante: Variante) => {
    variante.quantidadeVariante = variante.tamanhos.reduce((total, t) => total + t.quantidade, 0);
  });
  const anterior = produto.quantidadeTotal;
  produto.quantidadeTotal = produto.variantes.reduce((total, v) => total + v.quantidadeVariante, 0);

  if (produto.quantidadeTotal === 0 && (anterior > 0 || !produto.estoqueZeradoEm)) {
    produto.estoqueZeradoEm = produto.estoqueZeradoEm ?? agora();
    if (anterior > 0) produto.estoqueZeradoEm = agora();
  }
  if (produto.quantidadeTotal > 0) produto.estoqueZeradoEm = null;

  produto.margemLucro = calcularMargem(produto.precoCusto, precoFinal(produto));
  produto.atualizadoEm = agora();
  return produto;
}

/** Regras de preço vivem em `@/utils/produto` — o mock apenas reutiliza. */
export { calcularMargem, precoFinal };
