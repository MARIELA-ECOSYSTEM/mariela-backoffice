/**
 * Abstração de armazenamento da sessão (access token + refresh token).
 *
 * Nenhum componente, hook ou service deve tocar em `localStorage` diretamente:
 * tudo passa por `tokenStorage`. Assim, quando o app rodar empacotado no
 * Tauri, basta registrar outra implementação (ex.: keychain do sistema via
 * `@tauri-apps/plugin-store` ou stronghold) chamando `setTokenStorage(...)`
 * uma única vez na inicialização — nenhum outro arquivo muda.
 *
 * DECISÃO DESTA ETAPA: continuamos com `localStorage` (web) — o refresh token
 * é tão sensível quanto o access token (rotação: cada um só é usado uma vez),
 * mas o Backoffice ainda não tem uma integração Tauri de storage seguro
 * implementada, e inventar uma agora seria escopo além do pedido. A interface
 * abaixo já expõe as duas chaves separadamente exatamente para que essa
 * migração futura troque só a implementação, nunca os chamadores.
 */
export interface TokenStorage {
  getAccessToken: () => string | null;
  setAccessToken: (token: string) => void;
  getRefreshToken: () => string | null;
  setRefreshToken: (token: string) => void;
  /** Limpa os dois de uma vez — usado em logout e em falha irrecuperável de sessão. */
  clear: () => void;
}

export const ACCESS_TOKEN_STORAGE_KEY = "mariela.accessToken";
export const REFRESH_TOKEN_STORAGE_KEY = "mariela.refreshToken";

/** Implementação web (desenvolvimento, preview no navegador e o WebView do Tauri hoje). */
export function createWebTokenStorage(
  accessKey = ACCESS_TOKEN_STORAGE_KEY,
  refreshKey = REFRESH_TOKEN_STORAGE_KEY,
): TokenStorage {
  const ler = (chave: string): string | null => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(chave);
  };
  const gravar = (chave: string, valor: string): void => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(chave, valor);
  };

  return {
    getAccessToken: () => ler(accessKey),
    setAccessToken: (token) => gravar(accessKey, token),
    getRefreshToken: () => ler(refreshKey),
    setRefreshToken: (token) => gravar(refreshKey, token),
    clear: () => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(accessKey);
      window.localStorage.removeItem(refreshKey);
    },
  };
}

/** Implementação em memória (SSR/testes). */
export function createMemoryTokenStorage(): TokenStorage {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    getRefreshToken: () => refreshToken,
    setRefreshToken: (token) => {
      refreshToken = token;
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
    },
  };
}

let storage: TokenStorage =
  typeof window === "undefined" ? createMemoryTokenStorage() : createWebTokenStorage();

/** Permite trocar a implementação (ex.: storage seguro do Tauri no futuro). */
export function setTokenStorage(next: TokenStorage): void {
  storage = next;
}

export const tokenStorage: TokenStorage = {
  getAccessToken: () => storage.getAccessToken(),
  setAccessToken: (token) => storage.setAccessToken(token),
  getRefreshToken: () => storage.getRefreshToken(),
  setRefreshToken: (token) => storage.setRefreshToken(token),
  clear: () => storage.clear(),
};
