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
