import { gerarIdempotencyKey } from "@/utils/idempotencia";
import { ehResultadoIncerto } from "@/utils/operacao-cancelamento";

/**
 * Fase 2 (P1-01/P1-02) — UMA `idempotencyKey` por OPERAÇÃO (entrada/saída de estoque, movimentação manual de caixa,
 * recebimento e baixa de parcela), nunca por clique.
 *
 * - A chave nasce no primeiro envio da operação e fica guardada até o servidor CONFIRMAR (sucesso ou replay).
 * - Se a confirmação se perde (timeout, rede, 502/503/504 — `ehResultadoIncerto`), a operação fica INCERTA: a chave e o
 *   payload ficam fixados. "Tentar novamente" reenvia exatamente o mesmo pedido com a mesma chave; o servidor reconhece
 *   a repetição e não registra duas vezes. Enquanto houver uma operação incerta no contexto, nenhuma operação nova
 *   (chave nova) é iniciada ali: o operador reenvia a pendente ou a descarta explicitamente.
 * - Erro definitivo do servidor (400, 404, 409, 422, 500…) = nada foi registrado: a operação é encerrada e a próxima
 *   tentativa, possivelmente com outros dados, é uma operação nova (chave nova).
 *
 * O registro fica em memória, por contexto (ex.: `caixa:saida:<id>`): sobrevive a fechar e reabrir o diálogo e a trocar
 * de tela, mas não a fechar o aplicativo.
 */
export type EstadoOperacaoPendente = "em_andamento" | "incerta";

export interface OperacaoPendente<P> {
  contexto: string;
  chave: string;
  payload: P;
  estado: EstadoOperacaoPendente;
}

export type ResultadoOperacao = "concluida" | "incerta" | "rejeitada";

const registro = new Map<string, OperacaoPendente<unknown>>();

export function operacaoPendente<P>(contexto: string): OperacaoPendente<P> | null {
  return (registro.get(contexto) as OperacaoPendente<P> | undefined) ?? null;
}

/**
 * Prepara um envio no `contexto`.
 *   - Nada pendente → operação nova, com chave nova e o `payload` informado.
 *   - Operação incerta → a MESMA chave e o MESMO payload da operação original (o `payload` informado é ignorado).
 *   - Envio ainda em andamento → `null` (não envia de novo).
 */
export function iniciarOperacao<P>(
  contexto: string,
  payload: P,
  gerarChave: () => string = gerarIdempotencyKey,
): OperacaoPendente<P> | null {
  const atual = operacaoPendente<P>(contexto);
  if (atual?.estado === "em_andamento") return null;
  const operacao: OperacaoPendente<P> = atual
    ? { ...atual, estado: "em_andamento" }
    : { contexto, chave: gerarChave(), payload, estado: "em_andamento" };
  registro.set(contexto, operacao);
  return operacao;
}

/** Registra o resultado do envio. Sem `erro` = confirmado pelo servidor. */
export function concluirOperacao(contexto: string, erro?: unknown): ResultadoOperacao {
  const atual = registro.get(contexto);
  if (erro === undefined) {
    registro.delete(contexto);
    return "concluida";
  }
  if (atual && ehResultadoIncerto(erro)) {
    registro.set(contexto, { ...atual, estado: "incerta" });
    return "incerta";
  }
  registro.delete(contexto);
  return "rejeitada";
}

/** Descarte explícito pelo operador (só de operação incerta; um envio em andamento não é descartado). */
export function descartarOperacao(contexto: string): void {
  if (registro.get(contexto)?.estado === "incerta") registro.delete(contexto);
}

/** Só para testes. */
export function limparOperacoesPendentes(): void {
  registro.clear();
}

export const contextoOperacao = {
  estoque: (tipo: "entrada" | "saida", produtoId: string, varianteId: string) =>
    `estoque:${tipo}:${produtoId}:${varianteId}`,
  caixa: (tipo: "entrada" | "saida", caixaId: string) => `caixa:${tipo}:${caixaId}`,
  recebimento: (vendaId: string) => `venda:recebimento:${vendaId}`,
  baixaParcela: (vendaId: string, parcelaId: string) => `venda:baixa:${vendaId}:${parcelaId}`,
};
