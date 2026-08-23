/**
 * Padrão GLOBAL de códigos das entidades do MARIELA BACKOFFICE.
 *
 * REGRAS (a serem reproduzidas no NestJS + MongoDB):
 * 1. Todo cadastro possui um código sequencial gerado pelo BACKEND.
 * 2. O usuário NUNCA digita o código: na criação o campo é apenas informativo
 *    ("Será gerado automaticamente") e na edição é somente leitura.
 * 3. A sequência é um contador próprio por entidade — NUNCA a contagem de
 *    registros. Excluir PROD-0003 não libera o código: o próximo continua a
 *    partir do maior valor já emitido (PROD-0006 e assim por diante).
 * 4. Códigos nunca são reutilizados nem reordenados.
 * 5. O frontend apenas EXIBE o código devolvido pela API.
 */

export type EntidadeCodificada =
  "produto" | "colecao" | "campanha" | "cliente" | "fornecedor" | "vendedor" | "venda" | "caixa";

/** Prefixo oficial de cada entidade. */
export const PREFIXO_CODIGO: Record<EntidadeCodificada, string> = {
  produto: "PROD",
  colecao: "COL",
  campanha: "CAM",
  cliente: "CLI",
  fornecedor: "FOR",
  vendedor: "VEN",
  venda: "VENDA",
  caixa: "CAIXA",
};

/** Quantidade de dígitos do sufixo sequencial. */
export const DIGITOS_CODIGO = 4;

export function sufixoSequencial(sequencia: number): string {
  return String(sequencia).padStart(DIGITOS_CODIGO, "0");
}

/** `PROD-0001`, `COL-0002`, `CAIXA-0007`… */
export function formatarCodigo(entidade: EntidadeCodificada, sequencia: number): string {
  return `${PREFIXO_CODIGO[entidade]}-${sufixoSequencial(sequencia)}`;
}

/** Vendas incluem a data da operação: `VENDA-2026-08-23-0001`. */
export function formatarCodigoVenda(data: Date | string, sequencia: number): string {
  const iso = typeof data === "string" ? data : data.toISOString();
  return `${PREFIXO_CODIGO.venda}-${iso.slice(0, 10)}-${sufixoSequencial(sequencia)}`;
}

/** Extrai a sequência de um código já emitido (`PROD-0012` → 12). */
export function sequenciaDoCodigo(codigo: string | null | undefined): number {
  const partes = String(codigo ?? "").split("-");
  const numero = Number(partes[partes.length - 1]);
  return Number.isFinite(numero) ? numero : 0;
}

/** Texto exibido no formulário de criação, onde o código ainda não existe. */
export const CODIGO_AUTOMATICO = "Será gerado automaticamente";
