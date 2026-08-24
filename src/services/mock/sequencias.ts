import { formatarCodigo, formatarCodigoVenda, sequenciaDoCodigo } from "@/lib/codigos";
import type { EntidadeCodificada } from "@/lib/codigos";
import { db } from "./db";

/**
 * Simulação do gerador de códigos que hoje é responsabilidade do MOCK e amanhã
 * será do NestJS (collection de contadores no MongoDB, ex. `counters`).
 *
 * REGRA CENTRAL — códigos nunca são reutilizados:
 * o contador é monotônico e independente da quantidade de registros. Se
 * PROD-0003 for excluído, o próximo produto recebe PROD-0006 (e não 0003 nem
 * "total + 1"). No NestJS isso equivale a um `findOneAndUpdate` com `$inc` no
 * contador da entidade, dentro da mesma operação de criação.
 *
 * Esta camada é intencionalmente simples: o frontend NÃO deve conter a
 * arquitetura definitiva de geração de códigos, apenas exibir o que a API
 * devolve.
 */
const contadores = new Map<EntidadeCodificada, number>();

function maiorSequencia(codigos: (string | null | undefined)[]): number {
  return codigos.reduce<number>((maior, codigo) => Math.max(maior, sequenciaDoCodigo(codigo)), 0);
}

/** Inicializa cada contador a partir do maior código já presente no seed. */
function inicial(entidade: EntidadeCodificada): number {
  switch (entidade) {
    case "produto":
      return maiorSequencia(db.produtos.map((item) => item.codProduto));
    case "colecao":
      return maiorSequencia(db.colecoes.map((item) => item.codigo));
    case "campanha":
      return maiorSequencia(db.campanhas.map((item) => item.codigo));
    case "cliente":
      return maiorSequencia(db.clientes.map((item) => item.codigo));
    case "fornecedor":
      return maiorSequencia(db.fornecedores.map((item) => item.codigo));
    case "vendedor":
      return maiorSequencia(db.vendedores.map((item) => item.codigo));
    case "venda":
      return maiorSequencia(db.vendas.map((item) => item.codigo));
    case "caixa":
      return maiorSequencia(db.caixas.map((item) => item.codigo));
  }
}

function proximaSequencia(entidade: EntidadeCodificada): number {
  const atual = contadores.get(entidade) ?? inicial(entidade);
  const proxima = atual + 1;
  contadores.set(entidade, proxima);
  return proxima;
}

/** Próximo código da entidade (`PROD-0018`). */
export function proximoCodigo(entidade: Exclude<EntidadeCodificada, "venda">): string {
  return formatarCodigo(entidade, proximaSequencia(entidade));
}

/** Próximo código de venda, que carrega a data da operação. */
export function proximoCodigoVenda(data: Date | string = new Date()): string {
  return formatarCodigoVenda(data, proximaSequencia("venda"));
}
