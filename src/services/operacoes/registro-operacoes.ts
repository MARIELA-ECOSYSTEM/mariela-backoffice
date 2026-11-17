/**
 * Fase 22.8.9.5 — registro DURÁVEL das operações incertas de cancelamento/devolução.
 *
 * Até a v0.1.4 o registro vivia no `sessionStorage` (sobrevivia a recarregar a tela, não a fechar o aplicativo). Agora:
 *   - Desktop (Tauri): um arquivo por venda, gravado pelo Rust de forma atômica e com `fsync` (`src-tauri/src/
 *     operacoes.rs`), no diretório de dados da identidade vigente — sobrevive a fechamento, queda do processo e reinício
 *     do Windows; oficial e isolado nunca se misturam. NÃO é o Credential Manager (dados operacionais ≠ sessão).
 *   - Navegador (modo web, testes de interface): `localStorage` da origem, com as mesmas regras.
 *
 * Regras (as mesmas no Rust e no navegador):
 *   - Gravar só substitui um registro da MESMA operação (mesma chave). Outra operação ou registro ilegível ⇒
 *     `CONFLITO`: nada muda. Uma operação incerta nunca é trocada em silêncio.
 *   - Remover com `chave` só remove a MESMA operação; `null` = descarte explícito do operador (remove o que houver).
 *   - Toda gravação é conferida por uma nova leitura: só é "persistida" o que foi lido de volta igual.
 *   - Formato v3, sem token, senha ou dado do cliente (só venda, chave, assinatura canônica, datas e estado).
 *
 * Migração (registros v2/v1 do `sessionStorage`, Fases 22.5.2/22.6.1): ao abrir a venda, se o durável estiver vazio e
 * houver um registro legado válido, ele é gravado no durável, conferido, e SÓ ENTÃO removido do `sessionStorage`. Se
 * algo falhar, o legado fica onde está e a operação é recuperada a partir dele (sinalizada como não migrada).
 *
 * Nada aqui envia requisição ao backend: recuperar uma operação nunca a reenvia.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  assinaturaValida,
  lerOperacaoIncerta as lerOperacaoLegada,
  obterArmazenamentoDaSessao,
  removerOperacaoIncerta as removerOperacaoLegada,
  type EstadoPersistido,
  type OperacaoCancelamento,
} from "@/utils/operacao-cancelamento";

// ─── Formato v3 ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const VERSAO_REGISTRO = 3;
/** Mesmo limite do Rust (`TAMANHO_MAXIMO_CONTEUDO`). */
export const TAMANHO_MAXIMO_REGISTRO = 2048;
/** Prefixo do `localStorage` no navegador (o desktop usa arquivos; ver `operacoes.rs`). */
export const PREFIXO_REGISTRO_WEB = "mariela.backoffice.operacoes-pendentes.v3.";

const CAMPOS = ["versao", "vendaId", "chave", "assinatura", "iniciadaEm", "gravadaEm", "estado"];
const FORMATO_CHAVE = /^[A-Za-z0-9-]{8,128}$/;
const FORMATO_VENDA = /^[A-Za-z0-9_-]{1,64}$/;

export interface RegistroV3 {
  versao: typeof VERSAO_REGISTRO;
  vendaId: string;
  chave: string;
  assinatura: string;
  iniciadaEm: string;
  gravadaEm: string;
  estado: EstadoPersistido;
}

export function serializarRegistro(
  operacao: OperacaoCancelamento,
  estado: EstadoPersistido,
  agora: Date,
): string {
  const registro: RegistroV3 = {
    versao: VERSAO_REGISTRO,
    vendaId: operacao.vendaId,
    chave: operacao.chave,
    assinatura: operacao.assinatura,
    iniciadaEm: operacao.incertaDesde ?? agora.toISOString(),
    gravadaEm: agora.toISOString(),
    estado,
  };
  return JSON.stringify(registro);
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const dataValida = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** Registro v3 válido PARA ESTA VENDA, ou `null` (ilegível/incompatível — nunca tratado como ausente). */
export function lerRegistro(vendaId: string, conteudo: string): RegistroV3 | null {
  if (conteudo.length > TAMANHO_MAXIMO_REGISTRO) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(conteudo);
  } catch {
    return null;
  }
  if (!ehObjeto(dados)) return null;
  const chaves = Object.keys(dados);
  if (chaves.length !== CAMPOS.length || !CAMPOS.every((c) => c in dados)) return null;
  const { versao, chave, assinatura, iniciadaEm, gravadaEm, estado } = dados;
  const ok =
    versao === VERSAO_REGISTRO &&
    dados["vendaId"] === vendaId &&
    typeof chave === "string" &&
    FORMATO_CHAVE.test(chave) &&
    typeof assinatura === "string" &&
    assinaturaValida(assinatura) &&
    dataValida(iniciadaEm) &&
    dataValida(gravadaEm) &&
    (estado === "em_andamento" || estado === "incerta");
  return ok ? (dados as unknown as RegistroV3) : null;
}

// ─── Armazenamento (Rust no desktop, localStorage no navegador) ─────────────────────────────────────────────────────

export type CodigoErroRegistro =
  | "INDISPONIVEL"
  | "FORMATO_INVALIDO"
  | "TAMANHO_EXCEDIDO"
  | "CONFLITO"
  /** A invocação falhou sem um código do contrato (ACL, IPC, comando inexistente). */
  | "FALHA_DE_INVOCACAO";

export type ResultadoRegistro<T> =
  { ok: true; valor: T } | { ok: false; codigo: CodigoErroRegistro };

/** Primitivas de armazenamento — um registro (texto) por venda. Nunca lançam. */
export interface ArmazenamentoOperacoes {
  readonly tipo: "nativo" | "web" | "memoria";
  ler(vendaId: string): Promise<ResultadoRegistro<string | null>>;
  gravar(vendaId: string, conteudo: string): Promise<ResultadoRegistro<null>>;
  remover(vendaId: string, chave: string | null): Promise<ResultadoRegistro<null>>;
}

const CODIGOS_NATIVOS: readonly CodigoErroRegistro[] = [
  "INDISPONIVEL",
  "FORMATO_INVALIDO",
  "TAMANHO_EXCEDIDO",
  "CONFLITO",
];

function codigoDoErro(erro: unknown): CodigoErroRegistro {
  return typeof erro === "string" && (CODIGOS_NATIVOS as readonly string[]).includes(erro)
    ? (erro as CodigoErroRegistro)
    : "FALHA_DE_INVOCACAO";
}

/** Desktop: comandos `operacao_*` (`src-tauri/src/operacoes.rs`). */
export function criarArmazenamentoNativo(
  invocar: (comando: string, args: Record<string, unknown>) => Promise<unknown> = invoke,
): ArmazenamentoOperacoes {
  async function chamar<T>(
    comando: string,
    args: Record<string, unknown>,
    validar: (v: unknown) => v is T,
  ) {
    try {
      const valor = await invocar(comando, args);
      return validar(valor)
        ? ({ ok: true, valor } as const)
        : ({ ok: false, codigo: "FALHA_DE_INVOCACAO" } as const);
    } catch (erro) {
      return { ok: false, codigo: codigoDoErro(erro) } as const;
    }
  }
  const textoOuNulo = (v: unknown): v is string | null => v === null || typeof v === "string";
  const nulo = (v: unknown): v is null => v === null || v === undefined;
  return {
    tipo: "nativo",
    ler: (vendaId) => chamar("operacao_ler", { vendaId }, textoOuNulo),
    gravar: async (vendaId, conteudo) => {
      const r = await chamar("operacao_gravar", { vendaId, conteudo }, nulo);
      return r.ok ? { ok: true, valor: null } : r;
    },
    remover: async (vendaId, chave) => {
      const r = await chamar("operacao_remover", { vendaId, chave }, nulo);
      return r.ok ? { ok: true, valor: null } : r;
    },
  };
}

/**
 * Navegador/memória: mesmas regras do Rust (conflito por chave, ilegível nunca substituído) sobre um `Storage`.
 * `obterStorage` devolve `null` quando o `Storage` está inacessível.
 */
export function criarArmazenamentoSobreStorage(
  obterStorage: () => Storage | null,
  tipo: "web" | "memoria" = "web",
): ArmazenamentoOperacoes {
  const chaveDe = (vendaId: string) => `${PREFIXO_REGISTRO_WEB}${vendaId}`;
  function comStorage<T>(
    vendaId: string,
    f: (s: Storage) => ResultadoRegistro<T>,
  ): Promise<ResultadoRegistro<T>> {
    if (!FORMATO_VENDA.test(vendaId))
      return Promise.resolve({ ok: false, codigo: "FORMATO_INVALIDO" });
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
    ler: (vendaId) =>
      comStorage(vendaId, (s) => ({ ok: true, valor: s.getItem(chaveDe(vendaId)) })),
    gravar: (vendaId, conteudo) =>
      comStorage(vendaId, (s) => {
        if (conteudo.length > TAMANHO_MAXIMO_REGISTRO)
          return { ok: false, codigo: "TAMANHO_EXCEDIDO" };
        const novo = lerRegistro(vendaId, conteudo);
        if (!novo) return { ok: false, codigo: "FORMATO_INVALIDO" };
        const existente = s.getItem(chaveDe(vendaId));
        if (existente !== null && lerRegistro(vendaId, existente)?.chave !== novo.chave) {
          return { ok: false, codigo: "CONFLITO" };
        }
        s.setItem(chaveDe(vendaId), conteudo);
        return { ok: true, valor: null };
      }),
    remover: (vendaId, chave) =>
      comStorage(vendaId, (s) => {
        const existente = s.getItem(chaveDe(vendaId));
        if (existente === null) return { ok: true, valor: null };
        if (chave !== null && lerRegistro(vendaId, existente)?.chave !== chave) {
          return { ok: false, codigo: "CONFLITO" };
        }
        s.removeItem(chaveDe(vendaId));
        return { ok: true, valor: null };
      }),
  };
}

function localStorageSeguro(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// ─── Repositório (regras da operação + migração do legado) ─────────────────────────────────────────────────────────

export interface DependenciasRegistro {
  armazenamento: ArmazenamentoOperacoes;
  /** `sessionStorage` legado (Fases 22.5.2/22.6.1), só para migrar; `null` se inacessível. */
  legado: () => Storage | null;
  agora: () => Date;
}

let dependencias: DependenciasRegistro | null = null;

function padrao(): DependenciasRegistro {
  dependencias ??= {
    armazenamento: isTauri()
      ? criarArmazenamentoNativo()
      : criarArmazenamentoSobreStorage(localStorageSeguro),
    legado: obterArmazenamentoDaSessao,
    agora: () => new Date(),
  };
  return dependencias;
}

/** Só para testes: troca as dependências (`null` volta ao padrão). */
export function configurarRegistroParaTestes(novas: DependenciasRegistro | null): void {
  dependencias = novas;
}

export type CarregamentoOperacao =
  | { estado: "ausente" }
  /**
   * Operação recuperada — SEMPRE incerta (chave fixada). `duravel` = está no armazenamento durável (inclusive recém-
   * migrada); `false` = só no legado (a migração falhou) e pode se perder ao fechar o aplicativo.
   */
  | {
      estado: "recuperada";
      operacao: OperacaoCancelamento;
      origem: EstadoPersistido | "legado_v1";
      duravel: boolean;
      migrada: boolean;
    }
  /** Há um registro desta venda, mas ilegível: nenhuma chave é inventada; só o descarte explícito o remove. */
  | { estado: "invalida" }
  /** Armazenamento durável inacessível e nada no legado. */
  | { estado: "indisponivel" };

function operacaoDoRegistro(r: RegistroV3): OperacaoCancelamento {
  return {
    vendaId: r.vendaId,
    assinatura: r.assinatura,
    chave: r.chave,
    eventos: null,
    incerta: true,
    incertaDesde: r.iniciadaEm,
  };
}

async function gravarConferindo(
  deps: DependenciasRegistro,
  operacao: OperacaoCancelamento,
  estado: EstadoPersistido,
): Promise<ResultadoRegistro<null>> {
  const conteudo = serializarRegistro(operacao, estado, deps.agora());
  const gravado = await deps.armazenamento.gravar(operacao.vendaId, conteudo);
  if (!gravado.ok) return gravado;
  const relido = await deps.armazenamento.ler(operacao.vendaId);
  if (!relido.ok) return relido;
  return relido.valor === conteudo
    ? { ok: true, valor: null }
    : { ok: false, codigo: "INDISPONIVEL" };
}

/** Operação pendente da venda: durável primeiro; se vazio, o legado do `sessionStorage` (migrado). Nunca envia nada. */
export async function carregarOperacao(
  vendaId: string,
  deps: DependenciasRegistro = padrao(),
): Promise<CarregamentoOperacao> {
  const duravel = await deps.armazenamento.ler(vendaId);
  if (duravel.ok && duravel.valor !== null) {
    const registro = lerRegistro(vendaId, duravel.valor);
    if (!registro) return { estado: "invalida" };
    return {
      estado: "recuperada",
      operacao: operacaoDoRegistro(registro),
      origem: registro.estado,
      duravel: true,
      migrada: false,
    };
  }

  const legado = lerOperacaoLegada(vendaId, deps.legado());
  if (legado.estado === "invalida") return { estado: "invalida" };
  if (legado.estado !== "recuperada")
    return duravel.ok ? { estado: "ausente" } : { estado: "indisponivel" };

  // Migração: grava no durável e confere ANTES de remover o legado. Qualquer falha mantém o legado intacto.
  const estado: EstadoPersistido = legado.origem === "em_andamento" ? "em_andamento" : "incerta";
  const migracao = duravel.ok ? await gravarConferindo(deps, legado.operacao, estado) : duravel;
  if (migracao.ok) removerOperacaoLegada(vendaId, deps.legado());
  return {
    estado: "recuperada",
    operacao: legado.operacao,
    origem: legado.origem,
    duravel: migracao.ok,
    migrada: migracao.ok,
  };
}

export type ResultadoGravacao =
  | { ok: true }
  /** Já existe OUTRA operação (ou registro ilegível) desta venda: nada foi gravado; NÃO envie. */
  | { ok: false; motivo: "conflito" }
  /** Não foi possível gravar e conferir: a proteção não é durável. */
  | { ok: false; motivo: "falha" };

/** Grava (e confere) a operação no estado indicado. Só substitui um registro da MESMA operação. */
export async function gravarOperacao(
  operacao: OperacaoCancelamento,
  estado: EstadoPersistido,
  deps: DependenciasRegistro = padrao(),
): Promise<ResultadoGravacao> {
  const r = await gravarConferindo(deps, operacao, estado);
  if (r.ok) return { ok: true };
  return { ok: false, motivo: r.codigo === "CONFLITO" ? "conflito" : "falha" };
}

/**
 * Remove o registro da venda: com `chave`, só se for a mesma operação (conclusão confirmada); `null` = descarte
 * explícito do operador. Remove também o legado da venda. `true` = nada mais ficou guardado.
 */
export async function removerOperacao(
  vendaId: string,
  chave: string | null,
  deps: DependenciasRegistro = padrao(),
): Promise<boolean> {
  const r = await deps.armazenamento.remover(vendaId, chave);
  const legadoRemovido = removerOperacaoLegada(vendaId, deps.legado()) || deps.legado() === null;
  return r.ok && legadoRemovido;
}
