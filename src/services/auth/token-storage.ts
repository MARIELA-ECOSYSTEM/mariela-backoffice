/**
 * Abstração de armazenamento do token de acesso.
 *
 * Nenhum componente, hook ou service deve tocar em `localStorage` diretamente:
 * tudo passa por `tokenStorage`. Assim, quando o app rodar empacotado no Tauri,
 * basta registrar outra implementação (ex.: keychain do sistema) sem alterar UI.
 */
export interface TokenStorage {
  get: () => string | null;
  set: (token: string) => void;
  clear: () => void;
}

export const TOKEN_STORAGE_KEY = "mariela.accessToken";
export const REFRESH_TOKEN_STORAGE_KEY = "mariela.refreshToken";
export const TOKEN_EXPIRES_AT_STORAGE_KEY = "mariela.tokenExpiresAt";

/** Implementação web (desenvolvimento e preview no navegador). */
export function createWebTokenStorage(key = TOKEN_STORAGE_KEY): TokenStorage {
  return {
    get: () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    },
    set: (token) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, token);
    },
    clear: () => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
    },
  };
}

/** Implementação em memória (SSR/testes). */
export function createMemoryTokenStorage(): TokenStorage {
  let atual: string | null = null;
  return {
    get: () => atual,
    set: (token) => {
      atual = token;
    },
    clear: () => {
      atual = null;
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
  get: () => storage.get(),
  set: (token) => storage.set(token),
  clear: () => storage.clear(),
};

/**
 * Etapa 18.28 — refresh token opaco (`POST /auth/refresh`), igualmente
 * sensível ao access token (mesma janela de troca de implementação para o
 * Tauri). Nunca enviado como header `Authorization` — só no corpo de
 * `/auth/refresh`/`/auth/logout`.
 */
let refreshStorage: TokenStorage =
  typeof window === "undefined"
    ? createMemoryTokenStorage()
    : createWebTokenStorage(REFRESH_TOKEN_STORAGE_KEY);

export function setRefreshTokenStorage(next: TokenStorage): void {
  refreshStorage = next;
}

export const refreshTokenStorage: TokenStorage = {
  get: () => refreshStorage.get(),
  set: (token) => refreshStorage.set(token),
  clear: () => refreshStorage.clear(),
};

/**
 * Instante absoluto (epoch ms) em que o accessToken atual expira — metadado
 * não sensível, sem necessidade de storage seguro dedicado (sempre
 * web/memória, nunca trocado via `setTokenStorage`-like hook).
 */
const expiresAtStorage: TokenStorage =
  typeof window === "undefined"
    ? createMemoryTokenStorage()
    : createWebTokenStorage(TOKEN_EXPIRES_AT_STORAGE_KEY);

export interface DadosSessao {
  accessToken: string;
  refreshToken: string;
  /** Segundos até o accessToken expirar, a partir de agora. */
  expiresIn: number;
}

/** Persiste accessToken + refreshToken e calcula/persiste o instante absoluto de expiração do accessToken. */
export function salvarSessao(dados: DadosSessao): void {
  tokenStorage.set(dados.accessToken);
  refreshTokenStorage.set(dados.refreshToken);
  expiresAtStorage.set(String(Date.now() + dados.expiresIn * 1000));
}

/** Limpa toda a sessão local: accessToken, refreshToken e o instante de expiração. */
export function limparSessao(): void {
  tokenStorage.clear();
  refreshTokenStorage.clear();
  expiresAtStorage.clear();
}

/** Instante absoluto (epoch ms) em que o accessToken atual expira, ou `null` quando não há sessão. */
export function obterExpiraEm(): number | null {
  const valor = expiresAtStorage.get();
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
