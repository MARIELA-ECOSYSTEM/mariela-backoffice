/**
 * Fase 22.8.8.8.2 (M8.2) — sessões da MOCK API com rotação do refresh token e recuperação idempotente, espelhando o
 * contrato REAL do backend (Fase 22.8.7.2, `auth.service.ts` / `recuperacao-refresh.crypto.ts`), para validar no
 * ambiente isolado a resposta perdida da renovação. Só existe no modo Mock (nunca em build de produção: `client.ts` e
 * o `vite.config.ts` proíbem a Mock API em produção).
 *
 * Contrato reproduzido:
 * - `Idempotency-Key` opcional; presente, precisa ser UUID canônico (normalizado em minúsculas), senão 400
 *   `VALIDATION_ERROR` ANTES de qualquer efeito.
 * - Refresh token VIGENTE → rotação (uma geração nova); a chave, quando veio, fica associada ao token rotacionado.
 * - Token JÁ ROTACIONADO + a MESMA chave + sucessor ainda vigente + janela de 15 min + até 5 vezes → devolve o MESMO
 *   sucessor (replay), sem nova rotação. Janela vencida (com a chave certa) → `REFRESH_TOKEN_INVALID` e a família é
 *   revogada. Qualquer outro caso de token já rotacionado (sem chave, chave de OUTRA operação, sucessor já consumido,
 *   limite esgotado) → reuso: `REFRESH_TOKEN_REUSED` e a família é revogada.
 * - Token desconhecido → `REFRESH_TOKEN_INVALID`.
 *
 * Simulação de resposta perdida: com `localStorage["mariela.mock.perderProximaRespostaRefresh"] = "1"`, a PRÓXIMA
 * rotação é processada e gravada normalmente e, em seguida, a resposta é "perdida" (o cliente recebe o mesmo erro de
 * rede do transporte HTTP real). A marca é consumida nessa vez.
 *
 * Os tokens são sintéticos e por geração (`mock-token-g<n>` / `mock-refresh-token-g<n>`), válidos no formato v1 do
 * cofre. O estado fica no `localStorage` do próprio ambiente (sobrevive à reabertura do app isolado).
 */
import { ApiError } from "@/types/api";

export const CHAVE_ESTADO_MOCK = "mariela.mock.auth.v1";
export const CHAVE_PERDER_RESPOSTA = "mariela.mock.perderProximaRespostaRefresh";
export const JANELA_RECUPERACAO_MS = 15 * 60 * 1000;
export const LIMITE_RECUPERACOES = 5;
/** 15 min, mesmo padrão do backend real (`JWT_ACCESS_EXPIRES_IN`). */
export const EXPIRES_IN_SEGUNDOS = 15 * 60;

/** UUID canônico (RFC 9562, versões 1–8, variante 10xx) — o mesmo `FORMATO_CHAVE` do backend. */
const FORMATO_CHAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const accessDaGeracao = (g: number) => `mock-token-g${g}`;
export const refreshDaGeracao = (g: number) => `mock-refresh-token-g${g}`;

interface Rotacao {
  /** Geração emitida por esta rotação (o sucessor). */
  sucessor: number;
  /** Chave da operação (minúsculas), ou `null` quando a renovação veio sem `Idempotency-Key`. */
  chave: string | null;
  recuperacoes: number;
  recuperavelAte: number;
}

export interface EstadoAuthMock {
  versao: 1;
  geracao: number;
  /** Geração do refresh token vigente; `null` = nenhuma sessão (logout ou família revogada). */
  atual: number | null;
  /** Por refresh token já rotacionado. */
  rotacoes: Record<string, Rotacao>;
  /** Rotações efetivamente processadas (cada uma = uma geração nova). */
  processadas: number;
  /** Replays devolvidos (recuperações idempotentes). */
  recuperadas: number;
}

export interface ArmazenamentoMock {
  get(chave: string): string | null;
  set(chave: string, valor: string): void;
  remove(chave: string): void;
}

export interface ParMock {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const estadoInicial = (): EstadoAuthMock => ({
  versao: 1,
  geracao: 0,
  atual: null,
  rotacoes: {},
  processadas: 0,
  recuperadas: 0,
});

function estadoValido(v: unknown): v is EstadoAuthMock {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    e["versao"] === 1 &&
    Number.isInteger(e["geracao"]) &&
    (e["atual"] === null || Number.isInteger(e["atual"])) &&
    typeof e["rotacoes"] === "object" &&
    e["rotacoes"] !== null &&
    Number.isInteger(e["processadas"]) &&
    Number.isInteger(e["recuperadas"])
  );
}

const par = (g: number): ParMock => ({
  accessToken: accessDaGeracao(g),
  refreshToken: refreshDaGeracao(g),
  expiresIn: EXPIRES_IN_SEGUNDOS,
});

const erro401 = (code: "REFRESH_TOKEN_INVALID" | "REFRESH_TOKEN_REUSED") =>
  new ApiError({ statusCode: 401, code, message: "Sessão expirada. Faça login novamente." });

/** Lê `Idempotency-Key` (nome sem diferenciar maiúsculas, como em HTTP). Ausente → `null`; inválida → 400. */
function lerChave(headers: Record<string, string> | undefined): string | null {
  const entrada = Object.entries(headers ?? {}).find(
    ([k]) => k.toLowerCase() === "idempotency-key",
  );
  if (!entrada) return null;
  const valor = entrada[1];
  const normalizada = typeof valor === "string" && valor.length === 36 ? valor.toLowerCase() : "";
  if (!FORMATO_CHAVE.test(normalizada)) {
    throw ApiError.validation("Dados inválidos.", [
      {
        field: "Idempotency-Key",
        message: "Idempotency-Key inválida: use um UUID canônico (36 caracteres).",
      },
    ]);
  }
  return normalizada;
}

export function criarSessoesMock(armazenamento: ArmazenamentoMock, agora: () => number = Date.now) {
  function ler(): EstadoAuthMock {
    try {
      const bruto = armazenamento.get(CHAVE_ESTADO_MOCK);
      const v: unknown = bruto ? JSON.parse(bruto) : null;
      return estadoValido(v) ? v : estadoInicial();
    } catch {
      return estadoInicial();
    }
  }
  const salvar = (e: EstadoAuthMock) => armazenamento.set(CHAVE_ESTADO_MOCK, JSON.stringify(e));

  return {
    estado: ler,

    login(): ParMock {
      const e = ler();
      e.geracao += 1;
      e.atual = e.geracao;
      salvar(e);
      return par(e.geracao);
    },

    refresh(refreshToken: unknown, headers: Record<string, string> | undefined): ParMock {
      const chave = lerChave(headers); // valida ANTES de qualquer leitura/efeito
      if (typeof refreshToken !== "string" || refreshToken.length === 0) {
        throw ApiError.validation("Dados inválidos.", [
          { field: "refreshToken", message: "refreshToken é obrigatório." },
        ]);
      }
      const e = ler();

      // 1) Token vigente: rotação.
      if (e.atual !== null && refreshToken === refreshDaGeracao(e.atual)) {
        e.geracao += 1;
        e.rotacoes[refreshToken] = {
          sucessor: e.geracao,
          chave,
          recuperacoes: 0,
          recuperavelAte: agora() + JANELA_RECUPERACAO_MS,
        };
        e.atual = e.geracao;
        e.processadas += 1;
        salvar(e);
        if (armazenamento.get(CHAVE_PERDER_RESPOSTA) === "1") {
          armazenamento.remove(CHAVE_PERDER_RESPOSTA);
          // Rotação já gravada; a resposta "se perde" — o mesmo erro do transporte HTTP real sem resposta.
          throw new ApiError({
            statusCode: 0,
            code: "NETWORK_ERROR",
            message: "Falha de conexão com o servidor.",
          });
        }
        return par(e.geracao);
      }

      // 2) Token já rotacionado: recuperação (mesma operação) ou reuso.
      const rotacao = e.rotacoes[refreshToken];
      if (rotacao) {
        const mesmaOperacao = chave !== null && rotacao.chave === chave;
        if (mesmaOperacao && agora() > rotacao.recuperavelAte) {
          e.atual = null; // janela vencida: família revogada, sem classificar como reuso
          salvar(e);
          throw erro401("REFRESH_TOKEN_INVALID");
        }
        if (
          mesmaOperacao &&
          rotacao.sucessor === e.atual &&
          rotacao.recuperacoes < LIMITE_RECUPERACOES
        ) {
          rotacao.recuperacoes += 1;
          e.recuperadas += 1;
          salvar(e);
          return par(rotacao.sucessor); // o MESMO sucessor, sem nova rotação
        }
        e.atual = null; // reuso suspeito: família revogada
        salvar(e);
        throw erro401("REFRESH_TOKEN_REUSED");
      }

      // 3) Desconhecido.
      throw erro401("REFRESH_TOKEN_INVALID");
    },

    /** Idempotente: revoga o token vigente, se for ele; nunca falha. */
    logout(refreshToken: unknown): void {
      const e = ler();
      if (e.atual !== null && refreshToken === refreshDaGeracao(e.atual)) {
        e.atual = null;
        salvar(e);
      }
    },
  };
}

/** `localStorage` do ambiente (navegador/WebView); fora do navegador, memória. */
export function armazenamentoPadraoMock(): ArmazenamentoMock {
  if (typeof window !== "undefined" && window.localStorage) {
    const ls = window.localStorage;
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
    };
  }
  const memoria = new Map<string, string>();
  return {
    get: (k) => memoria.get(k) ?? null,
    set: (k, v) => void memoria.set(k, v),
    remove: (k) => void memoria.delete(k),
  };
}
