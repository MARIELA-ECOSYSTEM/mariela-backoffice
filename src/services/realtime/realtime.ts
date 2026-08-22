/**
 * Camada de sincronização em tempo real.
 *
 * A fonte de verdade dos dados é a API remota — nada é persistido localmente.
 * Hoje a atualização acontece por invalidação de cache após mutations e por
 * refetch em foco/reconexão. Esta camada existe para que, no futuro, um
 * transporte WebSocket ou SSE possa ser plugado SEM tocar em hooks e telas:
 * basta implementar `RealtimeTransport` e registrá-lo em `setRealtimeTransport`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { produtosKeys } from "@/hooks/use-produtos";
import { estoqueKeys } from "@/hooks/use-estoque";
import { configuracoesKeys } from "@/hooks/use-configuracoes";
import { cadastrosKeys } from "@/hooks/use-cadastros";

/** Eventos que o backend poderá emitir. Mantidos alinhados às mutations atuais. */
export type RealtimeEventType =
  | "produto.criado"
  | "produto.atualizado"
  | "produto.excluido"
  | "variante.alterada"
  | "estoque.movimentado"
  | "configuracao.alterada";

export interface RealtimeEvent {
  type: RealtimeEventType;
  produtoId?: string;
  emitidoEm?: string;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeTransport {
  /** Abre a conexão e devolve a função de encerramento. */
  connect: (onEvent: RealtimeListener) => () => void;
}

let transport: RealtimeTransport | null = null;

export function setRealtimeTransport(next: RealtimeTransport | null): void {
  transport = next;
}

/** Chaves de cache invalidadas por cada evento remoto (sempre via factories). */
function chavesAfetadas(event: RealtimeEvent): readonly unknown[][] {
  switch (event.type) {
    case "produto.criado":
    case "produto.atualizado":
    case "produto.excluido":
    case "variante.alterada":
      return event.produtoId
        ? [produtosKeys.todos, estoqueKeys.todos, produtosKeys.detalhe(event.produtoId)]
        : [produtosKeys.todos, estoqueKeys.todos];
    case "estoque.movimentado":
      return [estoqueKeys.todos, produtosKeys.todos];
    case "configuracao.alterada":
      return [configuracoesKeys.todos, cadastrosKeys.todos];
    default:
      return [];
  }
}

export function aplicarEventoRealtime(queryClient: QueryClient, event: RealtimeEvent): void {
  for (const queryKey of chavesAfetadas(event)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Assina o transporte configurado (no-op enquanto nenhum estiver registrado).
 * Retorna a função de limpeza.
 */
export function subscribeRealtime(queryClient: QueryClient): () => void {
  if (!transport) return () => {};
  return transport.connect((event) => aplicarEventoRealtime(queryClient, event));
}
