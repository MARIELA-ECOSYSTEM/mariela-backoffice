/**
 * Fase 22.8.8.3 (M3) — cliente TypeScript do armazenamento NATIVO da sessão (Windows Credential Manager), sobre os
 * três comandos Rust da Fase 22.8.8.2 (`src-tauri/src/sessao.rs`): `sessao_carregar`, `sessao_gravar`,
 * `sessao_apagar`.
 *
 * ISOLADO: nesta fase nada no fluxo de autenticação usa este módulo — `token-storage.ts` (localStorage) continua
 * sendo a fonte de verdade. A ligação, a migração e o modo legado são da fase M4. Importar este arquivo não tem
 * efeito colateral (nenhuma instância global, nenhuma chamada nativa).
 *
 * Regras:
 *   - Resultados EXPLÍCITOS (`{ ok: true, valor } | { ok: false, codigo }`): nada é lançado e nada é registrado em log.
 *     Os códigos são estáveis e nunca carregam tokens, chaves ou conteúdo.
 *   - Fora do Tauri (navegador, testes de interface): `AMBIENTE_SEM_COFRE`, sem invocar nada e sem simular sucesso.
 *     Este módulo NUNCA recorre ao localStorage.
 *   - Todas as operações passam por UMA fila (uma termina antes da próxima começar).
 *   - `seq` (contrato nativo): começa no valor devolvido por `sessao_carregar`; cada gravação/exclusão usa o próximo
 *     número e o considera CONSUMIDO antes de invocar (o Rust também o consome na tentativa, mesmo se o Windows
 *     falhar). Quando o `seq` fica INCERTO (operação obsoleta, falha de invocação, resposta inválida), a próxima
 *     operação relê o cofre antes de gravar. Conteúdo inválido é recusado aqui, antes de qualquer invocação, e não
 *     consome `seq` — mesmo comportamento do Rust.
 *   - A validação do formato v1 espelha exatamente a do Rust; o conteúdo lido do cofre é validado de novo aqui.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

// ─── Contrato v1 ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface PendenciaV1 {
  /** SHA-256 (hex minúsculo) do refresh token ao qual a chave pertence. */
  vinculo: string;
  /** `Idempotency-Key` (UUID canônico minúsculo). */
  chave: string;
  /** ISO 8601 UTC (`Date.prototype.toISOString()`). */
  criadaEm: string;
}

export interface SessaoV1 {
  v: 1;
  accessToken: string;
  refreshToken: string;
  /** Instante absoluto (epoch ms) em que o access token expira. */
  expiresAt: number;
  pendencia: PendenciaV1 | null;
}

/** Códigos do Rust (M2) + três locais deste cliente. */
export type CodigoErroCofre =
  /** Credential Manager indisponível (Rust). */
  | "COFRE_INDISPONIVEL"
  /** Conteúdo fora do formato v1 (Rust ou validação local antes de invocar). */
  | "FORMATO_INVALIDO"
  /** `seq` não é maior que o último aceito pelo processo nativo (Rust). */
  | "GRAVACAO_OBSOLETA"
  /** Conteúdo acima de 2.560 bytes (Rust ou validação local antes de invocar). */
  | "TAMANHO_EXCEDIDO"
  /** Fora do Tauri: não há cofre nativo (nada foi invocado). */
  | "AMBIENTE_SEM_COFRE"
  /** A invocação falhou sem um código do contrato (comando inexistente, negado pela ACL, falha de IPC…). */
  | "FALHA_DE_INVOCACAO"
  /** O processo nativo respondeu algo fora do contrato (inclusive conteúdo do cofre que não passa na validação). */
  | "RESPOSTA_INVALIDA";

export type ResultadoCofre<T> = { ok: true; valor: T } | { ok: false; codigo: CodigoErroCofre };

/** Limite do Credential Manager (`CRED_MAX_CREDENTIAL_BLOB_SIZE`), em bytes UTF-8 — o mesmo do Rust. */
export const TAMANHO_MAXIMO_CONTEUDO = 2560;

const CODIGOS_NATIVOS: readonly CodigoErroCofre[] = [
  "COFRE_INDISPONIVEL",
  "FORMATO_INVALIDO",
  "GRAVACAO_OBSOLETA",
  "TAMANHO_EXCEDIDO",
];
const CAMPOS_SESSAO = ["v", "accessToken", "refreshToken", "expiresAt", "pendencia"];
const CAMPOS_PENDENCIA = ["vinculo", "chave", "criadaEm"];
/** 01/01/3000 em milissegundos — o mesmo teto do Rust. */
const EXPIRA_EM_MAXIMO = 32_503_680_000_000;

const ACCESS_TOKEN = /^[A-Za-z0-9\-_.~+/=]{1,2048}$/;
const REFRESH_TOKEN = /^[A-Za-z0-9\-_]{16,512}$/;
const VINCULO = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function objetoComCamposExatos(valor: unknown, campos: string[]): valor is Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return false;
  const chaves = Object.keys(valor);
  return chaves.length === campos.length && campos.every((c) => chaves.includes(c));
}

function pendenciaValida(valor: unknown): boolean {
  if (valor === null) return true;
  if (!objetoComCamposExatos(valor, CAMPOS_PENDENCIA)) return false;
  return (
    typeof valor["vinculo"] === "string" &&
    VINCULO.test(valor["vinculo"]) &&
    typeof valor["chave"] === "string" &&
    UUID.test(valor["chave"]) &&
    typeof valor["criadaEm"] === "string" &&
    DATA_ISO.test(valor["criadaEm"])
  );
}

/** Mesmas regras de `validar_conteudo` (Rust), aplicadas ao valor já interpretado. */
export function sessaoV1Valida(valor: unknown): valor is SessaoV1 {
  if (!objetoComCamposExatos(valor, CAMPOS_SESSAO)) return false;
  const { v, accessToken, refreshToken, expiresAt, pendencia } = valor;
  return (
    v === 1 &&
    typeof accessToken === "string" &&
    ACCESS_TOKEN.test(accessToken) &&
    typeof refreshToken === "string" &&
    REFRESH_TOKEN.test(refreshToken) &&
    typeof expiresAt === "number" &&
    Number.isSafeInteger(expiresAt) &&
    expiresAt >= 0 &&
    expiresAt <= EXPIRA_EM_MAXIMO &&
    pendenciaValida(pendencia)
  );
}

/** Serializa e valida ANTES de invocar (tamanho em bytes UTF-8, como o Rust). */
function serializar(
  sessao: SessaoV1,
): { ok: true; conteudo: string } | { ok: false; codigo: CodigoErroCofre } {
  if (!sessaoV1Valida(sessao)) return { ok: false, codigo: "FORMATO_INVALIDO" };
  const conteudo = JSON.stringify(sessao);
  if (new TextEncoder().encode(conteudo).length > TAMANHO_MAXIMO_CONTEUDO) {
    return { ok: false, codigo: "TAMANHO_EXCEDIDO" };
  }
  return { ok: true, conteudo };
}

// ─── Transporte ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Ponte com o processo nativo. Injetável para os testes; o padrão usa a API oficial do Tauri 2. */
export interface TransporteCofre {
  /** `true` só dentro do aplicativo Tauri. */
  disponivel(): boolean;
  invocar(comando: string, argumentos?: Record<string, unknown>): Promise<unknown>;
}

export const transporteTauri: TransporteCofre = {
  disponivel: () => isTauri(),
  invocar: (comando, argumentos) => invoke(comando, argumentos),
};

/** Converte a rejeição da invocação: só um código do contrato nativo é repassado; qualquer outra coisa vira genérico. */
function codigoDaFalha(erro: unknown): CodigoErroCofre {
  return typeof erro === "string" && CODIGOS_NATIVOS.includes(erro as CodigoErroCofre)
    ? (erro as CodigoErroCofre)
    : "FALHA_DE_INVOCACAO";
}

// ─── Cliente ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CofreSessao {
  /** Lê a sessão (`null` = não há credencial) e sincroniza o `seq` com o processo nativo. */
  carregar(): Promise<ResultadoCofre<SessaoV1 | null>>;
  /** Substitui a sessão inteira (uma única gravação nativa). */
  gravar(sessao: SessaoV1): Promise<ResultadoCofre<void>>;
  /** Apaga a sessão. Ausência não é erro. */
  apagar(): Promise<ResultadoCofre<void>>;
}

/**
 * Cria um cliente com fila e `seq` próprios. Deve existir UM por processo (a M4 decide onde criá-lo); este módulo
 * não cria nenhum sozinho.
 */
export function criarCofreSessao(transporte: TransporteCofre = transporteTauri): CofreSessao {
  /** Último `seq` usado/conhecido; `null` = incerto (exige leitura antes da próxima gravação/exclusão). */
  let seq: number | null = null;
  let fila: Promise<unknown> = Promise.resolve();

  function enfileirar<T>(operacao: () => Promise<T>): Promise<T> {
    const resultado = fila.then(operacao, operacao);
    fila = resultado.catch(() => undefined);
    return resultado;
  }

  /** Leitura bruta (já dentro da fila). Atualiza `seq` só quando a resposta é válida. */
  async function lerNativo(): Promise<ResultadoCofre<SessaoV1 | null>> {
    let resposta: unknown;
    try {
      resposta = await transporte.invocar("sessao_carregar");
    } catch (erro) {
      seq = null;
      return { ok: false, codigo: codigoDaFalha(erro) };
    }
    if (!objetoComCamposExatos(resposta, ["conteudo", "seq"])) {
      seq = null;
      return { ok: false, codigo: "RESPOSTA_INVALIDA" };
    }
    const { conteudo, seq: seqNativo } = resposta;
    if (typeof seqNativo !== "number" || !Number.isSafeInteger(seqNativo) || seqNativo < 0) {
      seq = null;
      return { ok: false, codigo: "RESPOSTA_INVALIDA" };
    }
    seq = seqNativo;
    if (conteudo === null) return { ok: true, valor: null };
    if (typeof conteudo !== "string") return { ok: false, codigo: "RESPOSTA_INVALIDA" };
    let sessao: unknown;
    try {
      sessao = JSON.parse(conteudo);
    } catch {
      return { ok: false, codigo: "RESPOSTA_INVALIDA" };
    }
    return sessaoV1Valida(sessao)
      ? { ok: true, valor: sessao }
      : { ok: false, codigo: "RESPOSTA_INVALIDA" };
  }

  /** Gravação/exclusão (já dentro da fila): sincroniza `seq` se incerto, consome o próximo e invoca. */
  async function mutarNativo(
    comando: "sessao_gravar" | "sessao_apagar",
    conteudo?: string,
  ): Promise<ResultadoCofre<void>> {
    if (seq === null) {
      const leitura = await lerNativo();
      // Só a sincronização do seq importa aqui; conteúdo inválido no cofre não impede sobrescrevê-lo/apagá-lo.
      if (seq === null)
        return { ok: false, codigo: leitura.ok ? "RESPOSTA_INVALIDA" : leitura.codigo };
    }
    const proximo = seq + 1;
    seq = proximo; // consumido ANTES de invocar: nunca é reutilizado, nem se a invocação falhar
    try {
      await transporte.invocar(
        comando,
        conteudo === undefined ? { seq: proximo } : { conteudo, seq: proximo },
      );
      return { ok: true, valor: undefined };
    } catch (erro) {
      const codigo = codigoDaFalha(erro);
      // Obsoleta: outro contexto avançou o seq nativo. Falha de invocação: não se sabe se o seq foi consumido.
      // Em ambos os casos, a próxima operação relê antes de tentar.
      if (codigo === "GRAVACAO_OBSOLETA" || codigo === "FALHA_DE_INVOCACAO") seq = null;
      return { ok: false, codigo };
    }
  }

  return {
    carregar() {
      if (!transporte.disponivel())
        return Promise.resolve({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
      return enfileirar(lerNativo);
    },
    gravar(sessao) {
      if (!transporte.disponivel())
        return Promise.resolve({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
      const serializado = serializar(sessao);
      if (!serializado.ok) return Promise.resolve(serializado);
      return enfileirar(() => mutarNativo("sessao_gravar", serializado.conteudo));
    },
    apagar() {
      if (!transporte.disponivel())
        return Promise.resolve({ ok: false, codigo: "AMBIENTE_SEM_COFRE" });
      return enfileirar(() => mutarNativo("sessao_apagar"));
    },
  };
}
