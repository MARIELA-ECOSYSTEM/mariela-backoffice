/**
 * Fase 22.8.9.10.6 — regras de INTERFACE do envio oficial de WhatsApp (por template). Toda regra de negócio
 * (destinatário, bloqueio, aprovação do template, idempotência, deduplicação de campanha, estados) é do BACKEND; aqui
 * fica só o que a interface precisa decidir sozinha:
 *
 *   1. classificar a falha de uma requisição de envio — em especial, separar "o backend recusou (nada foi enviado)" de
 *      "não sabemos se foi enviada" (timeout, rede, 5xx). Na dúvida, SEMPRE "desconhecido";
 *   2. guardar, neste computador, a chave de idempotência de um envio ainda sem resposta conclusiva, para que a
 *      verificação posterior use a MESMA chave (o backend devolve o registro existente, HTTP 200, sem reenviar);
 *   3. executar a campanha de aniversário: um envio por cliente, sequencial, com interrupção entre envios, pausa
 *      automática diante de qualquer resultado desconhecido e NENHUMA repetição automática.
 */
import { ApiError } from "@/types/api";
import { LIMITE_TEXTO_LIVRE_WHATSAPP } from "@/types/whatsapp-oficial";
import type {
  EnviarTemplatePayload,
  EnviarTextoPayload,
  EstadoAprovacaoTemplateWhatsapp,
  EstadoMensagemWhatsapp,
  MensagemWhatsapp,
  OrigemBloqueioWhatsapp,
  OrigemMensagemWhatsapp,
  ResultadoEnvioTemplate,
  TemplateWhatsapp,
  TipoCampanhaWhatsapp,
} from "@/types/whatsapp-oficial";

// ─── Rótulos (somente apresentação; os valores vêm do backend sem alteração) ─────────────────────────────────────────

export const ROTULO_ESTADO_MENSAGEM: Record<EstadoMensagemWhatsapp, string> = {
  pendente: "Pendente",
  enviando: "Enviando",
  aceita: "Aceita pelo WhatsApp",
  entregue: "Entregue",
  lida: "Lida",
  falha: "Falha",
  indeterminada: "Resultado indeterminado",
};

export const TOM_ESTADO_MENSAGEM: Record<
  EstadoMensagemWhatsapp,
  "success" | "warning" | "destructive" | "outline" | "gold"
> = {
  pendente: "outline",
  enviando: "outline",
  aceita: "gold",
  entregue: "success",
  lida: "success",
  falha: "destructive",
  indeterminada: "warning",
};

export const ROTULO_APROVACAO_TEMPLATE: Record<EstadoAprovacaoTemplateWhatsapp, string> = {
  APROVADO: "Aprovado",
  PENDENTE: "Em análise",
  REJEITADO: "Rejeitado",
  PAUSADO: "Pausado",
  DESATIVADO: "Desativado",
  NAO_ENCONTRADO: "Não encontrado no provedor",
  DIVERGENTE: "Divergente do catálogo",
  DESCONHECIDO: "Não confirmado",
};

export const ROTULO_ORIGEM_MENSAGEM: Record<OrigemMensagemWhatsapp, string> = {
  INDIVIDUAL: "Envio individual",
  CAMPANHA_ANIVERSARIO: "Campanha de aniversário",
};

export const ROTULO_ORIGEM_BLOQUEIO: Record<OrigemBloqueioWhatsapp, string> = {
  ADMIN: "Bloqueio manual",
  PALAVRA_CHAVE: "Pedido do contato (palavra-chave)",
  META_OPT_OUT: "Opt-out informado pelo WhatsApp",
};

/** Só o estado `APROVADO`, CONFIRMADO pelo backend, permite envio. */
export function templateDisponivel(t: TemplateWhatsapp, uso: OrigemMensagemWhatsapp): boolean {
  return t.estadoAprovacao === "APROVADO" && t.usoPermitido.includes(uso);
}

export interface SituacaoIntegracaoOficial {
  tipo: "disponivel" | "nao_confirmada" | "sem_modelo_aprovado" | "sem_modelos";
  rotulo: string;
  tom: "success" | "warning" | "outline";
  descricao: string;
}

/**
 * Situação do fluxo oficial a partir do ÚNICO dado que o backend expõe sobre ele: a aprovação dos modelos, consultada
 * pelo próprio backend no provedor. `DESCONHECIDO` em todos = nada confirmado (inclusive provedor não configurado).
 * Nunca diz "conectado": aprovação confirmada indica que o envio é possível, não que cada mensagem será entregue.
 */
export function avaliarSituacaoIntegracao(
  templates: TemplateWhatsapp[],
): SituacaoIntegracaoOficial {
  if (templates.length === 0) {
    return {
      tipo: "sem_modelos",
      rotulo: "Sem modelos",
      tom: "outline",
      descricao:
        "O backend não informou nenhum modelo de mensagem. Nenhum envio oficial é possível.",
    };
  }
  const aprovados = templates.filter((t) => t.estadoAprovacao === "APROVADO").length;
  if (aprovados > 0) {
    return {
      tipo: "disponivel",
      rotulo: "Envio disponível",
      tom: "success",
      descricao: `O backend confirmou no provedor a aprovação de ${aprovados} modelo(s). Isso não garante a entrega de cada mensagem: o resultado de cada envio aparece no histórico.`,
    };
  }
  if (templates.every((t) => t.estadoAprovacao === "DESCONHECIDO")) {
    return {
      tipo: "nao_confirmada",
      rotulo: "Não confirmada",
      tom: "outline",
      descricao:
        "O backend não conseguiu confirmar a aprovação dos modelos no provedor — a integração com a Meta pode não estar configurada no servidor, ou a consulta falhou agora. Enquanto isso, nenhum envio oficial é feito.",
    };
  }
  return {
    tipo: "sem_modelo_aprovado",
    rotulo: "Sem modelo aprovado",
    tom: "warning",
    descricao:
      "O provedor respondeu, mas nenhum modelo está aprovado e compatível com o catálogo. Nenhum envio oficial é possível até a aprovação.",
  };
}

/**
 * Indica se a INTERFACE oferece o botão de liberação. É só uma dica: quem decide é o backend (estado, prazo de 24 h
 * para indeterminada, liberação anterior) — a recusa dele é exibida como veio.
 */
export function ofereceLiberacao(m: MensagemWhatsapp): boolean {
  return (m.estado === "falha" || m.estado === "indeterminada") && m.liberacao === null;
}

// ─── 1. Classificação das falhas de envio ────────────────────────────────────────────────────────────────────────────

export type TipoFalhaEnvio =
  /** O backend NÃO processou ou recusou ANTES de reservar: nada foi enviado. */
  | "recusada"
  /** Não se sabe se o backend processou (timeout, rede, 5xx…). NUNCA repetir com outra chave. */
  | "desconhecido"
  /** A chave já pertence a OUTRO pedido (409). Nada foi enviado por esta requisição. */
  | "conflito_chave";

export interface FalhaEnvio {
  tipo: TipoFalhaEnvio;
  /** Código do backend (ou do cliente HTTP: `TIMEOUT`, `NETWORK_ERROR`…). */
  codigo: string;
  mensagem: string;
  /** Interrompe a campanha inteira (não adianta seguir para os próximos clientes). */
  interrompeCampanha: boolean;
  /** Segundos de espera informados pelo backend num 429, quando legíveis. */
  retryAfterSegundos: number | null;
}

const MSG_DESCONHECIDO =
  "Não foi possível confirmar se a mensagem foi enviada. Ela NÃO será reenviada automaticamente: use “Verificar resultado”, que consulta o histórico e repete a MESMA solicitação (sem risco de duplicar).";

/** Códigos com que o backend recusa ANTES de reservar a mensagem (nada foi gravado nem enviado). */
const RECUSAS_QUE_INTERROMPEM = new Set([
  "WHATSAPP_NOT_CONFIGURED",
  "WHATSAPP_TEMPLATE_INDISPONIVEL",
  "THROTTLED",
  "TOO_MANY_REQUESTS",
  "SESSAO_ENCERRADA",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

export function classificarFalhaEnvio(erro: unknown): FalhaEnvio {
  if (!(erro instanceof ApiError)) {
    return {
      tipo: "desconhecido",
      codigo: "ERRO_INESPERADO",
      mensagem: MSG_DESCONHECIDO,
      interrompeCampanha: true,
      retryAfterSegundos: null,
    };
  }
  const base = { codigo: erro.code, retryAfterSegundos: erro.retryAfterSegundos };
  if (erro.code === "WHATSAPP_IDEMPOTENCIA_CONFLITO") {
    return { ...base, tipo: "conflito_chave", mensagem: erro.message, interrompeCampanha: false };
  }
  // Recusas explícitas, com o código de negócio do backend: a requisição foi decidida, nada foi enviado.
  if (erro.code === "WHATSAPP_NOT_CONFIGURED") {
    return { ...base, tipo: "recusada", mensagem: erro.message, interrompeCampanha: true };
  }
  if (erro.statusCode === 429) {
    const espera = erro.retryAfterSegundos ? ` Aguarde ${erro.retryAfterSegundos} s.` : "";
    return {
      ...base,
      tipo: "recusada",
      mensagem: `Limite de envios atingido; nada foi enviado nesta tentativa.${espera}`,
      interrompeCampanha: true,
    };
  }
  if (erro.statusCode === 401 || erro.statusCode === 403) {
    return { ...base, tipo: "recusada", mensagem: erro.message, interrompeCampanha: true };
  }
  if (erro.statusCode >= 400 && erro.statusCode < 500 && erro.statusCode !== 408) {
    return {
      ...base,
      tipo: "recusada",
      mensagem: erro.message,
      interrompeCampanha: RECUSAS_QUE_INTERROMPEM.has(erro.code),
    };
  }
  // Timeout do cliente (408), rede (0), 5xx (inclusive 502/504 do proxy) e qualquer outra coisa: desconhecido.
  return { ...base, tipo: "desconhecido", mensagem: MSG_DESCONHECIDO, interrompeCampanha: true };
}

// ─── 2. Registro local de envios sem confirmação ─────────────────────────────────────────────────────────────────────

export const PREFIXO_ENVIO_PENDENTE = "mariela.backoffice.whatsapp-envio-pendente.v1.";
const TAMANHO_MAXIMO_REGISTRO = 1024;
/** Fase 22.8.9.10.7.4 — o registro de texto livre carrega o texto (até 4096 caracteres, escapados em JSON). */
const TAMANHO_MAXIMO_REGISTRO_TEXTO = 32 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CHAVE_TEMPLATE = /^[A-Za-z0-9_.-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA = /^[0-9A-Za-z\-:.+]{1,40}$/;

/**
 * Só o necessário para repetir EXATAMENTE a mesma solicitação: cliente, template, campanha, chave e data. Nunca
 * telefone, nome, texto, token ou resposta do servidor.
 */
export interface EnvioPendente {
  versao: 1;
  clienteId: string;
  template: string;
  campanha: TipoCampanhaWhatsapp | null;
  idempotencyKey: string;
  criadoEm: string;
}

/**
 * Fase 22.8.9.10.7.4 — texto livre sem resposta conclusiva. Guarda o TEXTO exato: repetir a mesma chave com outro
 * texto seria recusado (409), e é só com o mesmo pedido que o backend devolve o registro sem reenviar. Fica só neste
 * computador e é apagado com a resposta conclusiva.
 */
export interface EnvioTextoPendente {
  versao: 1;
  tipo: "TEXTO";
  clienteId: string;
  texto: string;
  idempotencyKey: string;
  criadoEm: string;
}

/** Um único envio sem confirmação por cliente, de qualquer tipo: enquanto existir, nenhum envio novo é oferecido. */
export type IntencaoPendente = EnvioPendente | EnvioTextoPendente;

export function ehTextoPendente(p: IntencaoPendente): p is EnvioTextoPendente {
  return (p as { tipo?: unknown }).tipo === "TEXTO";
}

export type AcessoStorage = () => Storage | null;

export const storageDoNavegador: AcessoStorage = () => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function lerEnvioPendente(
  clienteId: string,
  storage: AcessoStorage = storageDoNavegador,
): IntencaoPendente | null {
  let bruto: string | null = null;
  try {
    bruto = storage()?.getItem(PREFIXO_ENVIO_PENDENTE + clienteId) ?? null;
  } catch {
    return null;
  }
  if (bruto === null || bruto.length > TAMANHO_MAXIMO_REGISTRO_TEXTO) return null;
  let d: unknown;
  try {
    d = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
  const r = d as Record<string, unknown>;
  const comum =
    r["versao"] === 1 &&
    r["clienteId"] === clienteId &&
    typeof r["idempotencyKey"] === "string" &&
    UUID.test(r["idempotencyKey"]) &&
    typeof r["criadoEm"] === "string" &&
    DATA.test(r["criadoEm"]);
  if (r["tipo"] === "TEXTO") {
    const texto = r["texto"];
    const okTexto =
      comum &&
      typeof texto === "string" &&
      texto.trim() !== "" &&
      texto.length <= LIMITE_TEXTO_LIVRE_WHATSAPP &&
      Object.keys(r).length === 6;
    return okTexto ? (r as unknown as EnvioTextoPendente) : null;
  }
  if (bruto.length > TAMANHO_MAXIMO_REGISTRO) return null;
  const ok =
    r["versao"] === 1 &&
    r["clienteId"] === clienteId &&
    typeof r["template"] === "string" &&
    CHAVE_TEMPLATE.test(r["template"]) &&
    (r["campanha"] === null || r["campanha"] === "ANIVERSARIO") &&
    typeof r["idempotencyKey"] === "string" &&
    UUID.test(r["idempotencyKey"]) &&
    typeof r["criadoEm"] === "string" &&
    DATA.test(r["criadoEm"]);
  return ok ? (r as unknown as EnvioPendente) : null;
}

/** `false` = não foi possível gravar (armazenamento indisponível). O envio pode seguir: o histórico do backend é a fonte. */
export function gravarEnvioPendente(
  p: IntencaoPendente,
  storage: AcessoStorage = storageDoNavegador,
): boolean {
  if (!ID.test(p.clienteId)) return false;
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(PREFIXO_ENVIO_PENDENTE + p.clienteId, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function removerEnvioPendente(
  clienteId: string,
  storage: AcessoStorage = storageDoNavegador,
): void {
  try {
    storage()?.removeItem(PREFIXO_ENVIO_PENDENTE + clienteId);
  } catch {
    // indisponível: nada a remover
  }
}

export function payloadDoPendente(p: EnvioPendente): EnviarTemplatePayload {
  return {
    idempotencyKey: p.idempotencyKey,
    destinatario: { tipo: "CLIENTE", id: p.clienteId },
    template: p.template,
    ...(p.campanha ? { campanha: { tipo: p.campanha } } : {}),
  };
}

export function novoEnvioPendente(
  clienteId: string,
  template: string,
  campanha: TipoCampanhaWhatsapp | null,
  gerarChave: () => string = () => crypto.randomUUID(),
  agora: () => Date = () => new Date(),
): EnvioPendente {
  return {
    versao: 1,
    clienteId,
    template,
    campanha,
    idempotencyKey: gerarChave(),
    criadoEm: agora().toISOString(),
  };
}

/** Fase 22.8.9.10.7.4 — intenção de texto livre: chave nova, texto exatamente como será enviado (já aparado). */
export function novoEnvioTextoPendente(
  clienteId: string,
  texto: string,
  gerarChave: () => string = () => crypto.randomUUID(),
  agora: () => Date = () => new Date(),
): EnvioTextoPendente {
  return {
    versao: 1,
    tipo: "TEXTO",
    clienteId,
    texto: texto.trim(),
    idempotencyKey: gerarChave(),
    criadoEm: agora().toISOString(),
  };
}

export function payloadDoTextoPendente(p: EnvioTextoPendente): EnviarTextoPayload {
  return {
    idempotencyKey: p.idempotencyKey,
    destinatario: { tipo: "CLIENTE", id: p.clienteId },
    texto: p.texto,
  };
}

/** O que a interface valida ANTES de pedir (o backend valida de novo e é a autoridade). */
export function problemaNoTextoLivre(texto: string): string | null {
  const limpo = texto.trim();
  if (limpo === "") return "Escreva a mensagem.";
  if (limpo.length > LIMITE_TEXTO_LIVRE_WHATSAPP)
    return `A mensagem pode ter no máximo ${LIMITE_TEXTO_LIVRE_WHATSAPP} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(limpo))
    return "A mensagem contém caracteres inválidos.";
  return null;
}

// ─── Envio de UMA intenção (com registro) e verificação de pendência ─────────────────────────────────────────────────

export interface ApiEnvioOficial {
  enviar: (payload: EnviarTemplatePayload) => Promise<ResultadoEnvioTemplate>;
  /** Fase 22.8.9.10.7.4 — obrigatório para verificar um texto livre pendente. */
  enviarTexto?: (payload: EnviarTextoPayload) => Promise<ResultadoEnvioTemplate>;
  listarMensagens: (filtros: {
    clienteId: string;
    page: number;
    limit: number;
  }) => Promise<{ data: MensagemWhatsapp[] }>;
}

export type DesfechoEnvio =
  | { tipo: "registrada"; mensagem: MensagemWhatsapp; repetida: boolean | null }
  | { tipo: "falha"; falha: FalhaEnvio };

/**
 * Envia a intenção `pendente` (chave já definida). O registro local é gravado ANTES da requisição e só é removido
 * diante de uma resposta CONCLUSIVA: mensagem registrada (201/200) ou recusa explícita (nada foi gravado). Resultado
 * desconhecido mantém o registro — a próxima tentativa usa a MESMA chave.
 */
export async function enviarIntencao(
  api: Pick<ApiEnvioOficial, "enviar">,
  pendente: EnvioPendente,
  storage: AcessoStorage = storageDoNavegador,
): Promise<DesfechoEnvio> {
  return enviarRegistrando(pendente, storage, () => api.enviar(payloadDoPendente(pendente)));
}

/** Fase 22.8.9.10.7.4 — mesmo protocolo de `enviarIntencao`, para texto livre (`POST /envios/texto`). */
export async function enviarIntencaoTexto(
  api: Required<Pick<ApiEnvioOficial, "enviarTexto">>,
  pendente: EnvioTextoPendente,
  storage: AcessoStorage = storageDoNavegador,
): Promise<DesfechoEnvio> {
  return enviarRegistrando(pendente, storage, () =>
    api.enviarTexto(payloadDoTextoPendente(pendente)),
  );
}

async function enviarRegistrando(
  pendente: IntencaoPendente,
  storage: AcessoStorage,
  chamar: () => Promise<ResultadoEnvioTemplate>,
): Promise<DesfechoEnvio> {
  gravarEnvioPendente(pendente, storage);
  try {
    const { mensagem, repetida } = await chamar();
    removerEnvioPendente(pendente.clienteId, storage);
    return { tipo: "registrada", mensagem, repetida };
  } catch (erro) {
    const falha = classificarFalhaEnvio(erro);
    if (falha.tipo !== "desconhecido") removerEnvioPendente(pendente.clienteId, storage);
    return { tipo: "falha", falha };
  }
}

export type DesfechoVerificacao =
  | { tipo: "encontrada"; mensagem: MensagemWhatsapp }
  | { tipo: "nao_enviada"; falha: FalhaEnvio }
  | DesfechoEnvio;

/**
 * Verificação de um envio sem confirmação: (1) procura a chave no histórico do cliente (leitura); (2) se não estiver
 * lá, repete a MESMA solicitação com a MESMA chave — o backend devolve o registro, se já existir, ou processa o pedido
 * uma única vez. Uma recusa explícita nesse ponto, sem registro no histórico, prova que nada foi enviado.
 */
export async function verificarEnvioPendente(
  api: ApiEnvioOficial,
  pendente: IntencaoPendente,
  storage: AcessoStorage = storageDoNavegador,
): Promise<DesfechoVerificacao> {
  try {
    const { data } = await api.listarMensagens({
      clienteId: pendente.clienteId,
      page: 1,
      limit: 100,
    });
    const existente = data.find((m) => m.idempotencyKey === pendente.idempotencyKey);
    if (existente) {
      removerEnvioPendente(pendente.clienteId, storage);
      return { tipo: "encontrada", mensagem: existente };
    }
  } catch (erro) {
    // Sem a leitura, não há conclusão: segue para a repetição idempotente (mesma chave), que é segura.
    void erro;
  }
  let desfecho: DesfechoEnvio;
  if (ehTextoPendente(pendente)) {
    const enviarTexto = api.enviarTexto;
    if (!enviarTexto)
      throw new Error("API sem envio de texto: a verificação não pode repetir o pedido.");
    desfecho = await enviarIntencaoTexto({ enviarTexto }, pendente, storage);
  } else {
    desfecho = await enviarIntencao(api, pendente, storage);
  }
  if (desfecho.tipo === "falha" && desfecho.falha.tipo === "recusada") {
    return { tipo: "nao_enviada", falha: desfecho.falha };
  }
  return desfecho;
}

// ─── 3. Campanha de aniversário ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Espaço mínimo entre dois envios da campanha: o backend limita os envios (10 a cada 10 s por usuário). Ficar abaixo
 * do limite evita recusas 429 no meio da campanha — que, mesmo assim, são tratadas (a campanha para, sem repetir).
 */
export const INTERVALO_MINIMO_CAMPANHA_MS = 1_100;

export interface ItemCampanha {
  clienteId: string;
  nome: string;
}

export type SituacaoItemCampanha =
  | { tipo: "aguardando" }
  | { tipo: "enviando" }
  | { tipo: "registrada"; mensagem: MensagemWhatsapp; repetida: boolean | null }
  | { tipo: "falha"; falha: FalhaEnvio }
  /** Havia um envio anterior sem confirmação para este cliente: nada é enviado com chave nova. */
  | { tipo: "pendencia_anterior"; pendente: IntencaoPendente }
  | { tipo: "nao_executado" };

export type MotivoFimCampanha = "concluida" | "interrompida" | "pausada";

export interface ResultadoCampanha {
  motivo: MotivoFimCampanha;
  /** Falha que pausou a campanha, quando houver. */
  falha: FalhaEnvio | null;
  situacoes: Record<string, SituacaoItemCampanha>;
}

export interface OpcoesCampanha {
  api: Pick<ApiEnvioOficial, "enviar">;
  itens: ItemCampanha[];
  template: string;
  /** Situações já conhecidas (para continuar uma campanha pausada sem repetir quem já tem desfecho). */
  situacoesIniciais?: Record<string, SituacaoItemCampanha>;
  /** Consultado ANTES de cada envio: `true` interrompe (o envio em andamento, se houver, termina normalmente). */
  deveParar: () => boolean;
  aoAtualizar: (clienteId: string, situacao: SituacaoItemCampanha) => void;
  esperar?: (ms: number) => Promise<void>;
  storage?: AcessoStorage;
  gerarChave?: () => string;
  agora?: () => Date;
}

const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Itens com desfecho conhecido — nunca enviados de novo ao continuar uma campanha pausada. Só a recusa que PAUSOU a
 * campanha (ex.: limite de envios, integração não configurada) volta para a fila: o backend recusou antes de
 * reservar, então nada existe com aquela chave e um novo pedido não duplica nada.
 */
export function jaDecidido(s: SituacaoItemCampanha | undefined): boolean {
  if (!s) return false;
  switch (s.tipo) {
    case "registrada":
    case "pendencia_anterior":
      return true;
    case "falha":
      return !(s.falha.tipo === "recusada" && s.falha.interrompeCampanha);
    default:
      return false;
  }
}

export async function executarCampanha(o: OpcoesCampanha): Promise<ResultadoCampanha> {
  const esperar = o.esperar ?? esperarPadrao;
  const storage = o.storage ?? storageDoNavegador;
  const situacoes: Record<string, SituacaoItemCampanha> = { ...(o.situacoesIniciais ?? {}) };
  const atualizar = (id: string, s: SituacaoItemCampanha) => {
    situacoes[id] = s;
    o.aoAtualizar(id, s);
  };
  let enviouAlgum = false;

  for (const item of o.itens) {
    if (jaDecidido(situacoes[item.clienteId])) continue;
    if (o.deveParar()) {
      for (const resto of o.itens) {
        if (!jaDecidido(situacoes[resto.clienteId]))
          atualizar(resto.clienteId, { tipo: "nao_executado" });
      }
      return { motivo: "interrompida", falha: null, situacoes };
    }

    const anterior = lerEnvioPendente(item.clienteId, storage);
    if (anterior) {
      atualizar(item.clienteId, { tipo: "pendencia_anterior", pendente: anterior });
      continue;
    }

    if (enviouAlgum) await esperar(INTERVALO_MINIMO_CAMPANHA_MS);
    atualizar(item.clienteId, { tipo: "enviando" });
    const pendente = novoEnvioPendente(
      item.clienteId,
      o.template,
      "ANIVERSARIO",
      o.gerarChave,
      o.agora,
    );
    enviouAlgum = true;
    const desfecho = await enviarIntencao(o.api, pendente, storage);
    if (desfecho.tipo === "registrada") {
      atualizar(item.clienteId, desfecho);
      continue;
    }
    atualizar(item.clienteId, { tipo: "falha", falha: desfecho.falha });
    if (desfecho.falha.interrompeCampanha) {
      for (const resto of o.itens) {
        if (!situacoes[resto.clienteId] || situacoes[resto.clienteId]?.tipo === "aguardando") {
          atualizar(resto.clienteId, { tipo: "nao_executado" });
        }
      }
      return { motivo: "pausada", falha: desfecho.falha, situacoes };
    }
  }
  return { motivo: "concluida", falha: null, situacoes };
}
