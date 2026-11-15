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

/**
 * Fase 22.8.7.3 — operação de renovação PENDENTE (recuperação idempotente do Backend, Fase 22.8.7.2): guarda só a
 * `Idempotency-Key` da rotação do refresh token ATUAL e um vínculo não reversível com ele (formato e regras em
 * `refresh-idempotencia.ts`). Mesmo armazenamento e mesma abstração dos tokens — quando eles migrarem para um
 * armazenamento seguro, este registro vai junto. Nunca contém R1 nem R2.
 */
export const RENOVACAO_PENDENTE_STORAGE_KEY = "mariela.refreshIdempotencia";

let renovacaoPendenteStorage: TokenStorage =
  typeof window === "undefined"
    ? createMemoryTokenStorage()
    : createWebTokenStorage(RENOVACAO_PENDENTE_STORAGE_KEY);

export function setRenovacaoPendenteStorage(next: TokenStorage): void {
  renovacaoPendenteStorage = next;
}

export const renovacaoPendenteStorageAtual: TokenStorage = {
  get: () => renovacaoPendenteStorage.get(),
  set: (valor) => renovacaoPendenteStorage.set(valor),
  clear: () => renovacaoPendenteStorage.clear(),
};

/**
 * A pendência só vale para o refresh token VIGENTE: um par novo (`salvarSessao`) ou o fim da sessão (`limparSessao`) a
 * tornam obsoleta. Falha do armazenamento aqui nunca impede gravar/limpar os tokens.
 */
function descartarRenovacaoPendente(): void {
  try {
    renovacaoPendenteStorage.clear();
  } catch {
    // Armazenamento indisponível: o registro (se existir) não casa com o próximo refresh token e é ignorado.
  }
}

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
  descartarRenovacaoPendente();
}

/** Limpa toda a sessão local: accessToken, refreshToken, o instante de expiração e a renovação pendente. */
export function limparSessao(): void {
  tokenStorage.clear();
  refreshTokenStorage.clear();
  expiresAtStorage.clear();
  descartarRenovacaoPendente();
}

/**
 * Fase 22.8.8.4 (M4) — regrava o espelho legado (localStorage) a partir de uma sessão já validada lida do Windows
 * Credential Manager: tokens, instante ABSOLUTO de expiração (sem recalcular) e a pendência idempotente já no formato
 * de `refresh-idempotencia.ts` (ou `null`). Usado só pela reconciliação de `sessao-nativa.ts` na abertura do app.
 */
export function restaurarSessaoPersistida(sessao: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  pendenciaSerializada: string | null;
}): void {
  tokenStorage.set(sessao.accessToken);
  refreshTokenStorage.set(sessao.refreshToken);
  expiresAtStorage.set(String(sessao.expiresAt));
  if (sessao.pendenciaSerializada === null) descartarRenovacaoPendente();
  else renovacaoPendenteStorage.set(sessao.pendenciaSerializada);
}

/**
 * Fase 22.8.8.4 (M4) — MARCADOR da sessão nativa (Credential Manager), sem segredo nenhum:
 *   `{ "v": 1, "estado": "migrada", "vinculo": "<SHA-256 do refresh token da última gravação CONFIRMADA no cofre>" }`
 *   `{ "v": 1, "estado": "encerrada" }` — a sessão foi encerrada (logout/rejeição); o cofre não pode ressuscitá-la.
 * Formato e regras em `sessao-nativa.ts`. Mesmo armazenamento dos tokens legados.
 */
export const MARCADOR_SESSAO_NATIVA_STORAGE_KEY = "mariela.sessaoNativa";

let marcadorSessaoNativaStorage: TokenStorage =
  typeof window === "undefined"
    ? createMemoryTokenStorage()
    : createWebTokenStorage(MARCADOR_SESSAO_NATIVA_STORAGE_KEY);

export function setMarcadorSessaoNativaStorage(next: TokenStorage): void {
  marcadorSessaoNativaStorage = next;
}

export const marcadorSessaoNativaStorageAtual: TokenStorage = {
  get: () => marcadorSessaoNativaStorage.get(),
  set: (valor) => marcadorSessaoNativaStorage.set(valor),
  clear: () => marcadorSessaoNativaStorage.clear(),
};

/** Instante absoluto (epoch ms) em que o accessToken atual expira, ou `null` quando não há sessão. */
export function obterExpiraEm(): number | null {
  const valor = expiresAtStorage.get();
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
