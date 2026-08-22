/**
 * Ponto único de encerramento de sessão.
 *
 * Usado tanto pelo logout manual quanto pelo tratamento global de HTTP 401.
 * Os handlers (limpar usuário do contexto, limpar cache do TanStack Query e
 * redirecionar) são registrados uma vez na raiz da aplicação.
 */
import { tokenStorage } from "./token-storage";

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

export function registerSessionHandlers(next: SessionHandlers | null): void {
  handlers = next;
}

/** Encerra a sessão: token → usuário → cache → /login. */
export async function encerrarSessao({ redirecionar }: { redirecionar: boolean }): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  try {
    tokenStorage.clear();
    handlers?.limparUsuario();
    await handlers?.limparCache();
    if (redirecionar && handlers && !handlers.rotaAtual().startsWith("/login")) {
      handlers.irParaLogin();
    }
  } finally {
    encerrando = false;
  }
}

/** Chamado pelo client HTTP em qualquer resposta 401. */
export function handleUnauthorized(): void {
  void encerrarSessao({ redirecionar: true });
}
