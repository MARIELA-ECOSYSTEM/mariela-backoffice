import { ApiError } from "@/types/api";
import type { CancelamentoPayload } from "@/types/venda";

/**
 * Fase 22.5.1 + 22.5.2 — ciclo de vida da `idempotencyKey` de cancelamento/devolução (lógica pura, sem React).
 *
 * Uma operação = tipo + itens/quantidades normalizados (o motivo NÃO entra, como na assinatura do backend). A mesma
 * operação reusa a mesma chave; quando a confirmação de uma tentativa se perde (timeout, rede, 502/503/504), a chave
 * fica FIXADA e é persistida em `sessionStorage` (por venda), para sobreviver a reload na mesma aba. Ela só sai desse
 * estado por sucesso confirmado (inclusive replay) ou por descarte explícito do operador.
 *
 * Fase 22.6.1 — (i) a operação é gravada como `em_andamento` ANTES do envio (reload durante a requisição não perde a
 * chave); (ii) após QUALQUER falha, a venda relida é reconciliada pela chave EXATA (`reconciliarPelaChave`): o
 * backend pode gravar o evento e ainda responder erro; (iii) o estado do estoque mostrado é o da OPERAÇÃO
 * (`resumoRestauracaoDoEvento`), não o da venda inteira.
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

/**
 * Namespace + versão do formato. Mudar o formato ⇒ subir a versão.
 *   - v2 (Fase 22.6.1): `{versao, vendaId, chave, assinatura, iniciadaEm, estado}` — gravado ANTES do envio
 *     (`em_andamento`) e atualizado para `incerta` quando a confirmação não vem.
 *   - v1 (Fase 22.5.2, legado): `{versao, vendaId, chave, assinatura, incertaDesde}` — ainda LIDO (uma aba aberta antes
 *     da atualização pode tê-lo), sempre como `incerta`; nunca mais gravado. Descartá-lo como "incompatível" perderia a
 *     chave de uma operação que pode ter sido registrada.
 */
export const PREFIXO_ARMAZENAMENTO = "mariela.backoffice.cancelamento-incerto";
export const VERSAO_FORMATO = 2;
export const VERSAO_FORMATO_LEGADO = 1;

export function chaveDeArmazenamento(vendaId: string, versao: number = VERSAO_FORMATO): string {
  return `${PREFIXO_ARMAZENAMENTO}.v${versao}.${vendaId}`;
}

/** Estado gravado: `em_andamento` (requisição enviada, sem resposta ainda) ou `incerta` (resposta sem confirmação). */
export type EstadoPersistido = "em_andamento" | "incerta";

/** Único conteúdo gravado: nada de token, dados do cliente ou payload da venda (o motivo também fica de fora). */
interface RegistroPersistido {
  versao: typeof VERSAO_FORMATO;
  vendaId: string;
  chave: string;
  assinatura: string;
  iniciadaEm: string;
  estado: EstadoPersistido;
}

export type LeituraOperacaoIncerta =
  | { estado: "ausente" }
  /**
   * Operação recuperada — SEMPRE como incerta (chave fixada). `origem` diz como ela ficou pendente: `em_andamento` =
   * a página foi recarregada/fechada durante o envio; `incerta` = a resposta não confirmou; `legado_v1` = registro v1.
   */
  | { estado: "recuperada"; operacao: OperacaoCancelamento; origem: EstadoPersistido | "legado_v1" }
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

/** Campos comuns validados em v1 e v2: venda, chave e assinatura canônica. */
function camposBasicosValidos(dados: Record<string, unknown>, vendaId: string): boolean {
  const chave = dados["chave"];
  const assinatura = dados["assinatura"];
  return (
    dados["vendaId"] === vendaId && // registro de outra venda nunca é aplicado a esta
    typeof chave === "string" &&
    FORMATO_CHAVE.test(chave) &&
    typeof assinatura === "string" &&
    assinaturaValida(assinatura)
  );
}

function dataValida(valor: unknown): valor is string {
  return typeof valor === "string" && !Number.isNaN(Date.parse(valor));
}

/** Lê o registro de UMA versão; `null` = ausente. Lança só se o armazenamento lançar. */
function lerRegistro(
  vendaId: string,
  versao: number,
  armazenamento: Storage,
): LeituraOperacaoIncerta | null {
  const bruto = armazenamento.getItem(chaveDeArmazenamento(vendaId, versao));
  if (bruto === null) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return { estado: "invalida" };
  }
  if (!ehObjeto(dados) || dados["versao"] !== versao || !camposBasicosValidos(dados, vendaId)) {
    return { estado: "invalida" };
  }
  const chave = dados["chave"] as string;
  const assinatura = dados["assinatura"] as string;
  if (versao === VERSAO_FORMATO) {
    const iniciadaEm = dados["iniciadaEm"];
    const estado = dados["estado"];
    if (!dataValida(iniciadaEm) || (estado !== "em_andamento" && estado !== "incerta")) {
      return { estado: "invalida" };
    }
    return {
      estado: "recuperada",
      origem: estado,
      operacao: {
        vendaId,
        assinatura,
        chave,
        eventos: null,
        incerta: true,
        incertaDesde: iniciadaEm,
      },
    };
  }
  const incertaDesde = dados["incertaDesde"];
  if (!dataValida(incertaDesde)) return { estado: "invalida" };
  return {
    estado: "recuperada",
    origem: "legado_v1",
    operacao: { vendaId, assinatura, chave, eventos: null, incerta: true, incertaDesde },
  };
}

/**
 * Operação pendente da venda (v2; se não houver, o legado v1). Toda operação recuperada volta como INCERTA (chave
 * fixada): não se sabe se a requisição interrompida/sem resposta foi processada pelo backend.
 */
export function lerOperacaoIncerta(
  vendaId: string,
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): LeituraOperacaoIncerta {
  if (!armazenamento) return { estado: "indisponivel" };
  try {
    return (
      lerRegistro(vendaId, VERSAO_FORMATO, armazenamento) ??
      lerRegistro(vendaId, VERSAO_FORMATO_LEGADO, armazenamento) ?? { estado: "ausente" }
    );
  } catch {
    return { estado: "indisponivel" };
  }
}

/**
 * Grava a operação da venda no estado indicado (v2) e apaga o legado v1 dela, se houver. `iniciadaEm` = instante da
 * primeira tentativa desta operação (`incertaDesde`), ou `agora`. Retorna `false` se não foi possível gravar (a
 * proteção fica só em memória).
 */
export function persistirOperacao(
  operacao: OperacaoCancelamento,
  estado: EstadoPersistido,
  agora: Date = new Date(),
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): boolean {
  if (!armazenamento) return false;
  const registro: RegistroPersistido = {
    versao: VERSAO_FORMATO,
    vendaId: operacao.vendaId,
    chave: operacao.chave,
    assinatura: operacao.assinatura,
    iniciadaEm: operacao.incertaDesde ?? agora.toISOString(),
    estado,
  };
  try {
    armazenamento.setItem(chaveDeArmazenamento(operacao.vendaId), JSON.stringify(registro));
  } catch {
    return false;
  }
  try {
    armazenamento.removeItem(chaveDeArmazenamento(operacao.vendaId, VERSAO_FORMATO_LEGADO));
  } catch {
    // O v2 recém-gravado tem precedência na leitura; o legado remanescente é inofensivo.
  }
  return true;
}

/** Grava a operação INCERTA da venda (atalho de `persistirOperacao`). Exige `incerta` e `incertaDesde`. */
export function persistirOperacaoIncerta(
  operacao: OperacaoCancelamento,
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): boolean {
  if (!operacao.incerta || !operacao.incertaDesde) return false;
  return persistirOperacao(operacao, "incerta", new Date(), armazenamento);
}

/** Remove SOMENTE o(s) registro(s) da venda indicada (v2 e legado v1). `false` se o armazenamento falhar. */
export function removerOperacaoIncerta(
  vendaId: string,
  armazenamento: Storage | null = obterArmazenamentoDaSessao(),
): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.removeItem(chaveDeArmazenamento(vendaId));
    armazenamento.removeItem(chaveDeArmazenamento(vendaId, VERSAO_FORMATO_LEGADO));
    return true;
  } catch {
    return false;
  }
}

// ─── Reconciliação pela chave (Fase 22.6.1) ────────────────────────────────────────────────────────────────────────

/** Evento de cancelamento como lido da API — só o que a reconciliação e o resumo de restauração usam. */
export interface EventoCancelamentoLido {
  idempotencyKey?: string | null;
  itens?: unknown;
}

/** Resultado da LEITURA da venda feita para reconciliar (o chamador faz a requisição; aqui só se interpreta). */
export type LeituraVendaParaReconciliacao = { ok: true; venda: unknown } | { ok: false };

export type ResultadoReconciliacao =
  /** A venda relida tem um evento com EXATAMENTE a chave enviada: a operação foi registrada pelo backend. */
  | { tipo: "registrada"; evento: EventoCancelamentoLido }
  /** Venda lida por completo e nenhum evento tem a chave: ausência de confirmação NESTE momento (não prova nada). */
  | { tipo: "nao_encontrada" }
  /** Não dá para concluir: a consulta falhou, a venda veio incompleta ou não é a venda pedida. */
  | { tipo: "inconclusiva"; motivo: "consulta_falhou" | "dados_incompletos" | "venda_diferente" };

/**
 * Procura, na venda lida, o evento cuja `idempotencyKey` é EXATAMENTE `chave`. Só a chave decide — nunca tipo, motivo,
 * quantidades, assinatura, nº de eventos ou horário. Presença é prova de registro (eventos são append-only no backend);
 * ausência NUNCA prova que não foi registrada.
 */
export function reconciliarPelaChave(
  vendaId: string,
  chave: string,
  leitura: LeituraVendaParaReconciliacao,
): ResultadoReconciliacao {
  if (!leitura.ok) return { tipo: "inconclusiva", motivo: "consulta_falhou" };
  const venda = leitura.venda;
  if (!ehObjeto(venda)) return { tipo: "inconclusiva", motivo: "dados_incompletos" };
  if (typeof venda["id"] !== "string") return { tipo: "inconclusiva", motivo: "dados_incompletos" };
  if (venda["id"] !== vendaId) return { tipo: "inconclusiva", motivo: "venda_diferente" };
  const cancelamentos = venda["cancelamentos"];
  if (!Array.isArray(cancelamentos)) return { tipo: "inconclusiva", motivo: "dados_incompletos" };
  let algumIlegivel = false;
  for (const evento of cancelamentos) {
    if (!ehObjeto(evento)) {
      algumIlegivel = true;
      continue;
    }
    if (typeof evento["idempotencyKey"] === "string" && evento["idempotencyKey"] === chave) {
      return { tipo: "registrada", evento: evento as EventoCancelamentoLido };
    }
  }
  return algumIlegivel
    ? { tipo: "inconclusiva", motivo: "dados_incompletos" }
    : { tipo: "nao_encontrada" };
}

/** Atalho: o evento com a chave exata, se a venda (já carregada) o contiver. */
export function eventoComChave(venda: unknown, chave: string): EventoCancelamentoLido | null {
  if (!ehObjeto(venda) || typeof venda["id"] !== "string") return null;
  const r = reconciliarPelaChave(venda["id"], chave, { ok: true, venda });
  return r.tipo === "registrada" ? r.evento : null;
}

// ─── Restauração de estoque DA OPERAÇÃO (Fase 22.6.1) ──────────────────────────────────────────────────────────────

/**
 * Situação da devolução de estoque de UM evento (a operação atual), espelhando a classificação por linha do backend
 * (`classificarRestauracao`, `restauracao-estoque.util.ts`): `restaurado: true` → concluída; `estadoRestauracao`
 * `pendente`/`falha_recuperavel`/`requer_intervencao` → o próprio estado; qualquer outra coisa (ausente, desconhecido,
 * `concluida` sem `restaurado: true`) → `indeterminado`. O resumo do BACKEND (`venda.restauracaoEstoque`) cobre a
 * venda INTEIRA — usá-lo após uma operação atribuiria a ela linhas de eventos antigos.
 */
export type StatusRestauracaoOperacao =
  | "nao_aplicavel"
  | "concluida"
  | "pendente"
  | "falha_recuperavel"
  | "requer_intervencao"
  | "indeterminado";

export interface ResumoRestauracaoOperacao {
  status: StatusRestauracaoOperacao;
  totalLinhas: number;
  concluidas: number;
  pendentes: number;
  falhasRecuperaveis: number;
  requeremIntervencao: number;
  indeterminadas: number;
}

export function resumoRestauracaoDoEvento(
  evento: EventoCancelamentoLido | null,
): ResumoRestauracaoOperacao {
  const resumo: ResumoRestauracaoOperacao = {
    status: "indeterminado",
    totalLinhas: 0,
    concluidas: 0,
    pendentes: 0,
    falhasRecuperaveis: 0,
    requeremIntervencao: 0,
    indeterminadas: 0,
  };
  // Sem o evento (ou sem lista de linhas legível) não há como afirmar nada sobre o estoque desta operação.
  if (!evento || !Array.isArray(evento.itens)) return resumo;
  for (const linha of evento.itens) {
    resumo.totalLinhas += 1;
    const estado = ehObjeto(linha) ? linha["estadoRestauracao"] : undefined;
    if (ehObjeto(linha) && linha["restaurado"] === true) resumo.concluidas += 1;
    else if (estado === "pendente") resumo.pendentes += 1;
    else if (estado === "falha_recuperavel") resumo.falhasRecuperaveis += 1;
    else if (estado === "requer_intervencao") resumo.requeremIntervencao += 1;
    else resumo.indeterminadas += 1;
  }
  resumo.status =
    resumo.totalLinhas === 0
      ? "nao_aplicavel"
      : resumo.requeremIntervencao > 0
        ? "requer_intervencao"
        : resumo.indeterminadas > 0
          ? "indeterminado"
          : resumo.falhasRecuperaveis > 0
            ? "falha_recuperavel"
            : resumo.pendentes > 0
              ? "pendente"
              : "concluida";
  return resumo;
}

/** Complemento da mensagem ao operador sobre o estoque DESTA operação; `tom` nunca é sucesso quando há dúvida. */
export function mensagemDeRestauracao(status: StatusRestauracaoOperacao): {
  tom: "sucesso" | "aviso";
  texto: string | null;
} {
  switch (status) {
    case "concluida":
    case "nao_aplicavel":
      return { tom: "sucesso", texto: null };
    case "pendente":
      return {
        tom: "aviso",
        texto:
          "a devolução de estoque desta operação ainda está pendente. O sistema tentará novamente automaticamente — não é preciso repetir a operação.",
      };
    case "falha_recuperavel":
      return {
        tom: "aviso",
        texto:
          "a devolução de estoque desta operação falhou nesta tentativa. O sistema tentará novamente automaticamente — não repita a operação.",
      };
    case "requer_intervencao":
      return {
        tom: "aviso",
        texto:
          "a devolução de estoque desta operação não pôde ser concluída e precisa de verificação do administrador. Não repita a operação.",
      };
    case "indeterminado":
      return {
        tom: "aviso",
        texto:
          "não foi possível determinar se o estoque desta operação foi devolvido. Confira o estoque dos itens antes de qualquer ajuste. Não repita a operação.",
      };
  }
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
