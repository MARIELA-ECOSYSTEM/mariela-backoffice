import { ApiError } from "@/types/api";
import type { CancelamentoPayload } from "@/types/venda";

/**
 * Fase 22.5.1 + 22.5.2 — ciclo de vida da `idempotencyKey` de cancelamento/devolução (lógica pura, sem React).
 *
 * Uma operação = tipo + itens/quantidades normalizados (o motivo NÃO entra, como na assinatura do backend). A mesma
 * operação reusa a mesma chave; quando a confirmação de uma tentativa se perde (timeout, rede, 502/503/504), a chave
 * fica FIXADA e é persistida em `sessionStorage` (por venda), para sobreviver a reload na mesma aba. Ela só sai desse
 * estado por sucesso confirmado (inclusive replay) ou por descarte explícito do operador.
 */

export interface OperacaoCancelamento {
  vendaId: string;
  assinatura: string;
  chave: string;
  /** Nº de eventos de cancelamento quando a chave foi criada. Irrelevante (null) numa operação incerta. */
  eventos: number | null;
  /** `true` enquanto não se souber se a operação foi registrada pelo backend. */
  incerta: boolean;
  /** Momento (ISO) da primeira tentativa sem confirmação — só para orientar a conferência do histórico. */
  incertaDesde: string | null;
}

// ─── Assinatura canônica ────────────────────────────────────────────────────────────────────────────────────────────

export function assinaturaDaOperacao(payload: Pick<CancelamentoPayload, "tipo" | "itens">): string {
  const itens =
    payload.tipo === "integral"
      ? []
      : (payload.itens ?? [])
          .map(({ itemId, quantidade }) => ({ itemId, quantidade }))
          .sort((a, b) => a.itemId.localeCompare(b.itemId));
  return JSON.stringify({ tipo: payload.tipo, itens });
}

export interface OperacaoDaAssinatura {
  tipo: "integral" | "parcial";
  itens: { itemId: string; quantidade: number }[];
}

/**
 * Lê uma assinatura e devolve tipo/itens SOMENTE se ela estiver exatamente na forma canônica produzida por
 * `assinaturaDaOperacao` (rejeita campos extras, ordem diferente, itens repetidos, quantidades inválidas). `null` caso
 * contrário.
 */
export function lerAssinatura(assinatura: string): OperacaoDaAssinatura | null {
  let dados: unknown;
  try {
    dados = JSON.parse(assinatura);
  } catch {
    return null;
  }
  if (!ehObjeto(dados)) return null;
  const tipo = dados["tipo"];
  const itens = dados["itens"];
  if ((tipo !== "integral" && tipo !== "parcial") || !Array.isArray(itens)) return null;
  if (tipo === "integral" && itens.length !== 0) return null;
  if (tipo === "parcial" && itens.length === 0) return null;
  const ids = new Set<string>();
  const normalizados: OperacaoDaAssinatura["itens"] = [];
  for (const item of itens) {
    if (!ehObjeto(item)) return null;
    const itemId = item["itemId"];
    const quantidade = item["quantidade"];
    if (typeof itemId !== "string" || itemId === "" || ids.has(itemId)) return null;
    if (typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 1) {
      return null;
    }
    ids.add(itemId);
    normalizados.push({ itemId, quantidade });
  }
  const operacao: OperacaoDaAssinatura = { tipo, itens: normalizados };
  return assinaturaDaOperacao(operacao) === assinatura ? operacao : null;
}

export function assinaturaValida(assinatura: string): boolean {
  return lerAssinatura(assinatura) !== null;
}

// ─── Classificação de erros ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Status HTTP que um proxy/gateway (ex.: Render) pode devolver DEPOIS de o backend já ter gravado a operação. Os demais
 * erros HTTP (400, 401, 403, 404, 409, 422, 500…) são respostas do próprio backend e tratados como definitivos.
 */
export const STATUS_HTTP_INCERTOS: readonly number[] = [502, 503, 504];

/**
 * `true` quando a operação PODE ter sido registrada sem a confirmação chegar. Segue a representação real de
 * `services/api/client.ts`: timeout → `ApiError{code:"TIMEOUT", statusCode:408}`; falha de rede →
 * `ApiError{code:"NETWORK_ERROR", statusCode:0}`; resposta HTTP não-ok → `ApiError{statusCode: <status>}`, com `code`
 * vindo do corpo ou `"HTTP_ERROR"` (o corpo HTML de um gateway não é JSON).
 */
export function ehResultadoIncerto(erro: unknown): boolean {
  if (!(erro instanceof ApiError)) return false;
  if (erro.code === "TIMEOUT" || erro.code === "NETWORK_ERROR") return true;
  return STATUS_HTTP_INCERTOS.includes(erro.statusCode);
}

// ─── Decisão da chave ──────────────────────────────────────────────────────────────────────────────────────────────

export type DecisaoChave =
  | { tipo: "enviar"; operacao: OperacaoCancelamento }
  | { tipo: "bloqueada"; pendente: OperacaoCancelamento };

/**
 * Qual chave usar para enviar `payload` agora.
 *   - Operação incerta da MESMA venda e mesma assinatura → a mesma chave, ignorando o nº de eventos (o refetch após
 *     um registro "perdido" incrementa esse nº; gerar chave nova aí viraria uma SEGUNDA devolução).
 *   - Operação incerta da mesma venda com assinatura DIFERENTE → bloqueada: o operador precisa reenviar a operação
 *     pendente ou descartá-la explicitamente; ela nunca é substituída em silêncio.
 *   - Operação não incerta, mesma venda, assinatura e nº de eventos → mesma chave (duplo clique, reabertura, erro
 *     definitivo seguido de nova tentativa).
 *   - Qualquer outro caso (nada em andamento, outra venda, outra operação) → chave nova.
 */
export function decidirChave(parametros: {
  atual: OperacaoCancelamento | null;
  vendaId: string;
  payload: Pick<CancelamentoPayload, "tipo" | "itens">;
  eventos: number;
  gerarChave: () => string;
}): DecisaoChave {
  const { atual, vendaId, payload, eventos, gerarChave } = parametros;
  const assinatura = assinaturaDaOperacao(payload);
  if (atual && atual.vendaId === vendaId) {
    if (atual.incerta) {
      return atual.assinatura === assinatura
        ? { tipo: "enviar", operacao: atual }
        : { tipo: "bloqueada", pendente: atual };
    }
    if (atual.assinatura === assinatura && atual.eventos === eventos) {
      return { tipo: "enviar", operacao: atual };
    }
  }
  return {
    tipo: "enviar",
    operacao: {
      vendaId,
      assinatura,
      chave: gerarChave(),
      eventos,
      incerta: false,
      incertaDesde: null,
    },
  };
}

/** A operação após uma tentativa de resultado incerto (preserva chave, assinatura e o instante original). */
export function marcarIncerta(operacao: OperacaoCancelamento, agora: Date): OperacaoCancelamento {
  return {
    ...operacao,
    eventos: null,
    incerta: true,
    incertaDesde: operacao.incertaDesde ?? agora.toISOString(),
  };
}

// ─── Persistência (sessionStorage) ─────────────────────────────────────────────────────────────────────────────────

/** Namespace + versão do formato. Mudar o formato ⇒ subir a versão (registros antigos passam a ser "incompatíveis"). */
export const PREFIXO_ARMAZENAMENTO = "mariela.backoffice.cancelamento-incerto";
export const VERSAO_FORMATO = 1;

export function chaveDeArmazenamento(vendaId: string): string {
  return `${PREFIXO_ARMAZENAMENTO}.v${VERSAO_FORMATO}.${vendaId}`;
}

/** Único conteúdo gravado: nada de token, dados do cliente ou payload da venda (o motivo também fica de fora). */
interface RegistroPersistido {
  versao: typeof VERSAO_FORMATO;
  vendaId: string;
  chave: string;
  assinatura: string;
  incertaDesde: string;
}

export type LeituraOperacaoIncerta =
  | { estado: "ausente" }
  | { estado: "recuperada"; operacao: OperacaoCancelamento }
  /** Há um registro para esta venda, mas ilegível/incompatível: NÃO se inventa chave nem se faz replay. */
  | { estado: "invalida" }
  /** `sessionStorage` inacessível (bloqueado, modo privado restritivo, ambiente sem `window`). */
  | { estado: "indisponivel" };

/** `sessionStorage` da aba, ou `null` se o acesso ao próprio objeto lançar (ex.: SecurityError). Nunca `localStorage`. */
export function obterArmazenamentoDaSessao(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const FORMATO_CHAVE = /^[A-Za-z0-9-]{8,128}$/;

export function lerOperacaoIncerta(
  vendaId: string,
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): LeituraOperacaoIncerta {
  if (!armazenamento) return { estado: "indisponivel" };
  let bruto: string | null;
  try {
    bruto = armazenamento.getItem(chaveDeArmazenamento(vendaId));
  } catch {
    return { estado: "indisponivel" };
  }
  if (bruto === null) return { estado: "ausente" };

  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return { estado: "invalida" };
  }
  if (!ehObjeto(dados)) return { estado: "invalida" };
  const { versao, chave, assinatura, incertaDesde } = dados;
  const vendaGravada = dados["vendaId"];
  if (
    versao !== VERSAO_FORMATO ||
    vendaGravada !== vendaId || // registro de outra venda nunca é aplicado a esta
    typeof chave !== "string" ||
    !FORMATO_CHAVE.test(chave) ||
    typeof assinatura !== "string" ||
    !assinaturaValida(assinatura) ||
    typeof incertaDesde !== "string" ||
    Number.isNaN(Date.parse(incertaDesde))
  ) {
    return { estado: "invalida" };
  }
  return {
    estado: "recuperada",
    operacao: { vendaId, assinatura, chave, eventos: null, incerta: true, incertaDesde },
  };
}

/** Grava a operação incerta da venda. Retorna `false` se não foi possível (a proteção fica só em memória). */
export function persistirOperacaoIncerta(
  operacao: OperacaoCancelamento,
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): boolean {
  if (!armazenamento || !operacao.incerta || !operacao.incertaDesde) return false;
  const registro: RegistroPersistido = {
    versao: VERSAO_FORMATO,
    vendaId: operacao.vendaId,
    chave: operacao.chave,
    assinatura: operacao.assinatura,
    incertaDesde: operacao.incertaDesde,
  };
  try {
    armazenamento.setItem(chaveDeArmazenamento(operacao.vendaId), JSON.stringify(registro));
    return true;
  } catch {
    return false;
  }
}

/** Remove SOMENTE o registro da venda indicada. Retorna `false` se o armazenamento estiver inacessível. */
export function removerOperacaoIncerta(
  vendaId: string,
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.removeItem(chaveDeArmazenamento(vendaId));
    return true;
  } catch {
    return false;
  }
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
