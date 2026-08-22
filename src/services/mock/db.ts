import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";
import type { Configuracoes } from "@/types/configuracoes";
import type { Cliente } from "@/types/cliente";
import type { Fornecedor } from "@/types/fornecedor";
import type { Vendedor } from "@/types/vendedor";
import type { Colecao } from "@/types/colecao";
import type { Campanha } from "@/types/campanha";
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
};

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
