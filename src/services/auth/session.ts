/**
 * Ponto único de encerramento de sessão.
 *
 * Usado tanto pelo logout manual quanto pelo tratamento global de HTTP 401.
 * Os handlers (limpar usuário do contexto, limpar cache do TanStack Query e
 * redirecionar) são registrados uma vez na raiz da aplicação.
 */
import { limparSessao } from "./token-storage";

export interface SessionHandlers {
  /** Remove o usuário do contexto de autenticação. */
  limparUsuario: () => void;
  /** Limpa o cache do TanStack Query. */
  limparCache: () => Promise<void> | void;
  /** Redireciona para o login. */
  irParaLogin: () => void;
  /** Rota atual, para evitar loop de redirecionamento. */
  rotaAtual: () => string;
}

let handlers: SessionHandlers | null = null;
let encerrando = false;

/**
 * Fase 22.8.4 (A2) — GERAÇÃO da sessão local. Todo encerramento (logout, rejeição definitiva) e todo login novo
 * avançam a geração. Quem inicia uma operação assíncrona que pode gravar ou encerrar a sessão (renovação, recuperação
 * na abertura, requisição com 401) captura a geração no início e, ao terminar, só age se ela ainda for a vigente: uma
 * resposta tardia de uma sessão já encerrada nunca grava tokens, nunca restaura o estado autenticado e nunca encerra a
 * sessão de um usuário posterior. Contador em memória — não persiste e não depende de temporização.
 */
let geracao = 0;

export function geracaoDaSessao(): number {
  return geracao;
}

/** Invalida a geração vigente — síncrono, antes de qualquer `await`, para que nenhuma resposta pendente a alcance. */
export function invalidarGeracaoDaSessao(): void {
  geracao += 1;
}

export function registerSessionHandlers(next: SessionHandlers | null): void {
  handlers = next;
}

/** Encerra a sessão: geração → token → usuário → cache → /login. Não toca no `sessionStorage` (operações pendentes). */
export async function encerrarSessao({ redirecionar }: { redirecionar: boolean }): Promise<void> {
  invalidarGeracaoDaSessao();
  if (encerrando) return;
  encerrando = true;
  try {
    limparSessao();
    handlers?.limparUsuario();
    await handlers?.limparCache();
    if (redirecionar && handlers && !handlers.rotaAtual().startsWith("/login")) {
      handlers.irParaLogin();
    }
  } finally {
    encerrando = false;
  }
}

/**
 * Chamado pelo client HTTP quando a sessão acabou DE FATO: renovação rejeitada pelo servidor com um código definitivo,
 * ausência de refresh token, ou um access token recém-renovado também recusado. Nunca por falha de rede/indisponibilidade.
 */
export function handleUnauthorized(): void {
  void encerrarSessao({ redirecionar: true });
}
