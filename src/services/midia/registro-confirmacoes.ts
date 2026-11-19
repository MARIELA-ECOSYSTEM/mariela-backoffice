/**
 * Fase 22.8.9.9.3 — registro DURÁVEL das confirmações de upload de mídia pendentes.
 *
 * Desktop: comandos `midia_confirmacao_*` (`src-tauri/src/confirmacoes_midia.rs`) — um arquivo por `uploadId`,
 * gravação atômica com `fsync`, no diretório de dados da identidade vigente (oficial e isolado nunca se misturam),
 * SEPARADO das operações de cancelamento (`registro-operacoes.ts`). Navegador/modo web: `localStorage`, com as mesmas
 * regras. Testes: memória.
 *
 * Formato v1 — só o necessário para retomar a confirmação: produto, `uploadId`, tipo, corpo EXATO da confirmação,
 * estado e data. Nunca a URL assinada, token, credencial, cabeçalhos ou o arquivo (o Rust recusa campos extras).
 */
import { invoke } from "@tauri-apps/api/core";
import type { ConfirmarUploadPayload, TipoMidia } from "@/types/media";

export const VERSAO_REGISTRO_CONFIRMACAO = 1;
export const TAMANHO_MAXIMO_REGISTRO_CONFIRMACAO = 1024;
export const PREFIXO_CONFIRMACOES_WEB = "mariela.backoffice.confirmacoes-midia.v1.";

/** `confirmando` = gravado ANTES do POST de confirmação; `pendente` = o POST terminou sem resultado conclusivo. */
export type EstadoConfirmacao = "confirmando" | "pendente";

export interface RegistroConfirmacao {
  versao: typeof VERSAO_REGISTRO_CONFIRMACAO;
  produtoId: string;
  uploadId: string;
  kind: TipoMidia;
  confirmacao: ConfirmarUploadPayload;
  estado: EstadoConfirmacao;
  criadoEm: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATA = /^[A-Za-z0-9\-:.+Z]{1,40}$/;
const CAMPOS = ["versao", "produtoId", "uploadId", "kind", "confirmacao", "estado", "criadoEm"];
const CAMPOS_CONFIRMACAO = ["varianteId", "principal", "substituiMidiaId"];

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function confirmacaoValida(v: unknown): v is ConfirmarUploadPayload {
  if (!ehObjeto(v)) return false;
  return (
    Object.keys(v).every((k) => CAMPOS_CONFIRMACAO.includes(k)) &&
    (v["varianteId"] === undefined ||
      (typeof v["varianteId"] === "string" && ID.test(v["varianteId"]))) &&
    (v["substituiMidiaId"] === undefined ||
      (typeof v["substituiMidiaId"] === "string" && ID.test(v["substituiMidiaId"]))) &&
    (v["principal"] === undefined || typeof v["principal"] === "boolean")
  );
}

/** Registro v1 válido PARA ESTE `uploadId`, ou `null` (corrompido/incompatível — nunca tratado como ausente). */
export function lerRegistroConfirmacao(
  uploadId: string,
  conteudo: string,
): RegistroConfirmacao | null {
  if (conteudo.length > TAMANHO_MAXIMO_REGISTRO_CONFIRMACAO) return null;
  let d: unknown;
  try {
    d = JSON.parse(conteudo);
  } catch {
    return null;
  }
  if (!ehObjeto(d)) return null;
  const ok =
    Object.keys(d).length === CAMPOS.length &&
    CAMPOS.every((c) => c in d) &&
    d["versao"] === VERSAO_REGISTRO_CONFIRMACAO &&
    d["uploadId"] === uploadId &&
    typeof d["produtoId"] === "string" &&
    ID.test(d["produtoId"]) &&
    (d["kind"] === "image" || d["kind"] === "video") &&
    confirmacaoValida(d["confirmacao"]) &&
    (d["estado"] === "confirmando" || d["estado"] === "pendente") &&
    typeof d["criadoEm"] === "string" &&
    DATA.test(d["criadoEm"]);
  return ok ? (d as unknown as RegistroConfirmacao) : null;
}

export function serializarRegistroConfirmacao(r: Omit<RegistroConfirmacao, "versao">): string {
  return JSON.stringify({
    versao: VERSAO_REGISTRO_CONFIRMACAO,
    produtoId: r.produtoId,
    uploadId: r.uploadId,
    kind: r.kind,
    confirmacao: r.confirmacao,
    estado: r.estado,
    criadoEm: r.criadoEm,
  } satisfies RegistroConfirmacao);
}

/** Mesma operação = mesmos produto, tipo, corpo da confirmação e criação (só o estado pode mudar). */
function mesmaOperacao(a: RegistroConfirmacao, b: RegistroConfirmacao): boolean {
  return (
    a.produtoId === b.produtoId &&
    a.kind === b.kind &&
    a.criadoEm === b.criadoEm &&
    JSON.stringify(ordenado(a.confirmacao)) === JSON.stringify(ordenado(b.confirmacao))
  );
}
const ordenado = (o: object) =>
  Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));

// ─── Armazenamento ──────────────────────────────────────────────────────────────────────────────────────────────────

export type CodigoErroConfirmacoes =
  "INDISPONIVEL" | "FORMATO_INVALIDO" | "TAMANHO_EXCEDIDO" | "CONFLITO" | "FALHA_DE_INVOCACAO";
export type ResultadoConfirmacoes<T> =
  { ok: true; valor: T } | { ok: false; codigo: CodigoErroConfirmacoes };
export interface RegistroBruto {
  uploadId: string;
  conteudo: string;
}

export interface ArmazenamentoConfirmacoes {
  readonly tipo: "nativo" | "web" | "memoria";
  listar(): Promise<ResultadoConfirmacoes<RegistroBruto[]>>;
  gravar(uploadId: string, conteudo: string): Promise<ResultadoConfirmacoes<null>>;
  remover(uploadId: string): Promise<ResultadoConfirmacoes<null>>;
}

const CODIGOS: readonly CodigoErroConfirmacoes[] = [
  "INDISPONIVEL",
  "FORMATO_INVALIDO",
  "TAMANHO_EXCEDIDO",
  "CONFLITO",
];
const codigoDoErro = (e: unknown): CodigoErroConfirmacoes =>
  typeof e === "string" && (CODIGOS as readonly string[]).includes(e)
    ? (e as CodigoErroConfirmacoes)
    : "FALHA_DE_INVOCACAO";

/** Desktop: comandos `midia_confirmacao_*`. */
export function criarArmazenamentoConfirmacoesNativo(
  invocar: (comando: string, args?: Record<string, unknown>) => Promise<unknown> = invoke,
): ArmazenamentoConfirmacoes {
  const listaValida = (v: unknown): v is RegistroBruto[] =>
    Array.isArray(v) &&
    v.every(
      (r) => ehObjeto(r) && typeof r["uploadId"] === "string" && typeof r["conteudo"] === "string",
    );
  return {
    tipo: "nativo",
    async listar() {
      try {
        const v = await invocar("midia_confirmacao_listar");
        return listaValida(v)
          ? { ok: true, valor: v }
          : { ok: false, codigo: "FALHA_DE_INVOCACAO" };
      } catch (e) {
        return { ok: false, codigo: codigoDoErro(e) };
      }
    },
    async gravar(uploadId, conteudo) {
      try {
        await invocar("midia_confirmacao_gravar", { uploadId, conteudo });
        return { ok: true, valor: null };
      } catch (e) {
        return { ok: false, codigo: codigoDoErro(e) };
      }
    },
    async remover(uploadId) {
      try {
        await invocar("midia_confirmacao_remover", { uploadId });
        return { ok: true, valor: null };
      } catch (e) {
        return { ok: false, codigo: codigoDoErro(e) };
      }
    },
  };
}

/** Navegador/memória: mesmas regras do Rust (outra operação ou registro ilegível nunca são sobrescritos). */
export function criarArmazenamentoConfirmacoesSobreStorage(
  obterStorage: () => Storage | null,
  tipo: "web" | "memoria" = "web",
): ArmazenamentoConfirmacoes {
  function com<T>(f: (s: Storage) => ResultadoConfirmacoes<T>): Promise<ResultadoConfirmacoes<T>> {
    const s = obterStorage();
    if (!s) return Promise.resolve({ ok: false, codigo: "INDISPONIVEL" });
    try {
      return Promise.resolve(f(s));
    } catch {
      return Promise.resolve({ ok: false, codigo: "INDISPONIVEL" });
    }
  }
  return {
    tipo,
    listar: () =>
      com((s) => {
        const registros: RegistroBruto[] = [];
        for (let i = 0; i < s.length; i += 1) {
          const k = s.key(i);
          if (!k?.startsWith(PREFIXO_CONFIRMACOES_WEB)) continue;
          const uploadId = k.slice(PREFIXO_CONFIRMACOES_WEB.length);
          if (!ID.test(uploadId)) continue;
          registros.push({ uploadId, conteudo: s.getItem(k) ?? "" });
        }
        registros.sort((a, b) => a.uploadId.localeCompare(b.uploadId));
        return { ok: true, valor: registros };
      }),
    gravar: (uploadId, conteudo) =>
      com((s) => {
        if (!ID.test(uploadId)) return { ok: false, codigo: "FORMATO_INVALIDO" };
        if (conteudo.length > TAMANHO_MAXIMO_REGISTRO_CONFIRMACAO)
          return { ok: false, codigo: "TAMANHO_EXCEDIDO" };
        const novo = lerRegistroConfirmacao(uploadId, conteudo);
        if (!novo) return { ok: false, codigo: "FORMATO_INVALIDO" };
        const existente = s.getItem(PREFIXO_CONFIRMACOES_WEB + uploadId);
        if (existente !== null) {
          const antigo = lerRegistroConfirmacao(uploadId, existente);
          if (!antigo || !mesmaOperacao(antigo, novo)) return { ok: false, codigo: "CONFLITO" };
        }
        s.setItem(PREFIXO_CONFIRMACOES_WEB + uploadId, conteudo);
        return { ok: true, valor: null };
      }),
    remover: (uploadId) =>
      com((s) => {
        if (!ID.test(uploadId)) return { ok: false, codigo: "FORMATO_INVALIDO" };
        s.removeItem(PREFIXO_CONFIRMACOES_WEB + uploadId);
        return { ok: true, valor: null };
      }),
  };
}

/** `Storage` em memória (testes e fallback explícito; não sobrevive ao processo). */
export function criarStorageMemoria(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
