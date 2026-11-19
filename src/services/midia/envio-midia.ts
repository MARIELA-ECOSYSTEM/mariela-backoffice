/**
 * Fase 22.8.9.9.2 (M2) — fluxo de envio de uma mídia para a galeria do produto, em TRÊS etapas separadas:
 *
 *   1. SOLICITAÇÃO (`galeriaApi.solicitarUpload`) — JSON ao backend; ele registra o upload e devolve a URL assinada.
 *      O arquivo NUNCA vai para o backend.
 *   2. ENVIO — `PUT` direto ao R2 na URL assinada, com EXATAMENTE o método e os cabeçalhos devolvidos (assinados).
 *      Nenhum cabeçalho é acrescentado, trocado ou removido; sem `Authorization` do Backoffice. Nunca repetido sozinho.
 *   3. CONFIRMAÇÃO (`galeriaApi.confirmarUpload`) — o backend confere o objeto e inclui a mídia na galeria. Só aqui o
 *      envio é "concluído". A confirmação é idempotente (o `id` da mídia é o próprio `uploadId`).
 *
 * Regras:
 *   - Nada é apresentado como concluído antes da confirmação; falha temporária nunca vira sucesso.
 *   - URL assinada vencida (ou prestes a vencer): o `PUT` não é feito, e nunca é repetido com a mesma URL.
 *   - Confirmação sem resposta conclusiva (rede, tempo esgotado, 502/503/504, 429): a operação fica PENDENTE, por
 *     `uploadId`, e precisa ser RECONCILIADA (`reconciliarEnvio`: lê a galeria e, se preciso, repete a confirmação
 *     com o MESMO `uploadId`) antes de qualquer nova solicitação para o mesmo produto.
 *   - Fase 22.8.9.9.3 — a pendência é DURÁVEL (`registro-confirmacoes.ts`) e gravada ANTES do POST de confirmação:
 *     sem registro comprovado, a confirmação não é enviada (fail-closed). Na abertura do app, `verificarPendencias`
 *     só LÊ a galeria (nenhum POST); repetir a confirmação é sempre uma ação explícita.
 *   - Um envio por produto de cada vez (evita duplicar a mesma operação por duplo clique).
 *   - A URL assinada vive só na memória durante o envio: nunca é persistida nem registrada em log; nenhuma mensagem de
 *     erro a contém.
 */
import { ApiError, type ApiFieldError } from "@/types/api";
import {
  JANELA_LIMITE_UPLOAD_SEGUNDOS,
  LIMITES_GALERIA,
  type ConfirmacaoUpload,
  type ConfirmarUploadPayload,
  type GaleriaProduto,
  type MidiaProduto,
  type SolicitarUploadGaleriaPayload,
  type TipoMidia,
  type UploadGaleriaAutorizado,
} from "@/types/media";
import {
  criarArmazenamentoConfirmacoesSobreStorage,
  criarStorageMemoria,
  lerRegistroConfirmacao,
  serializarRegistroConfirmacao,
  type ArmazenamentoConfirmacoes,
  type EstadoConfirmacao,
} from "./registro-confirmacoes";

// ─── Classificação de erros ─────────────────────────────────────────────────────────────────────────────────────────

export type EtapaEnvio = "validacao" | "solicitacao" | "envio" | "confirmacao" | "reconciliacao";

export type TipoFalhaMidia =
  /** 400 — arquivo ou solicitação inválida (tipo, extensão, tamanho, conteúdo recusado, arquivo ausente no storage). */
  | "arquivo_invalido"
  /** 401 — sessão inválida/expirada (o `apiClient` já trata a sessão). */
  | "sessao"
  /** 403 — sem permissão (só ADMIN usa a galeria). */
  | "sem_permissao"
  /** 404 — produto, upload ou mídia inexistente. */
  | "nao_encontrado"
  /** 409 — limite da galeria, upload expirado/encerrado, mídia substituída que sumiu, arquivo alterado. */
  | "conflito"
  /** 413 — arquivo acima do permitido (quando o servidor/proxy responder assim). */
  | "muito_grande"
  /** 429 — limite de requisições de upload; ver `retryAfterSegundos`. */
  | "limite_requisicoes"
  /** 503 `STORAGE_NOT_CONFIGURED` — armazenamento não configurado no ambiente (não é temporário). */
  | "nao_configurado"
  /** 408/502/503/504 — indisponibilidade temporária (inclui `STORAGE_UNAVAILABLE` e `MEDIA_VALIDATION_UNAVAILABLE`). */
  | "indisponivel"
  /** Sem resposta (rede, CORS, conexão interrompida). */
  | "rede"
  /** URL assinada vencida (ou prestes a vencer) — o arquivo não foi enviado. */
  | "url_expirada"
  /** O armazenamento recusou o `PUT` (assinatura, cabeçalhos ou tamanho divergentes). */
  | "armazenamento_recusou"
  /** Há uma confirmação pendente/incerta neste produto: reconcilie antes de enviar outro arquivo. */
  | "reconciliacao_pendente"
  /** Já existe um envio em andamento neste produto. */
  | "envio_em_andamento"
  /**
   * Fase 22.8.9.9.3 — o registro durável da confirmação não pôde ser gravado/conferido (ou lido): fail-closed, a
   * confirmação NÃO é enviada e nada é apresentado como concluído.
   */
  | "persistencia_indisponivel"
  | "desconhecido";

export interface FalhaMidia {
  tipo: TipoFalhaMidia;
  etapa: EtapaEnvio;
  /** Mensagem para o operador (do backend quando houver; nunca contém URL assinada). */
  mensagem: string;
  /** `true` quando NÃO se sabe se a operação produziu efeito (só faz sentido na confirmação). */
  incerta: boolean;
  /** Segundos de espera antes de tentar de novo (só em `limite_requisicoes`). */
  retryAfterSegundos: number | null;
  /** Erros por campo do backend (400). */
  campos: ApiFieldError[];
}

const MENSAGENS_PADRAO: Record<TipoFalhaMidia, string> = {
  arquivo_invalido: "O arquivo ou a solicitação é inválido.",
  sessao: "Sua sessão expirou. Entre novamente.",
  sem_permissao: "Você não tem permissão para alterar a galeria de produtos.",
  nao_encontrado: "Produto ou mídia não encontrado.",
  conflito: "A galeria mudou ou o envio não pode mais ser concluído.",
  muito_grande: "O arquivo é maior que o permitido.",
  limite_requisicoes: "Muitos envios em pouco tempo. Aguarde um instante e tente novamente.",
  nao_configurado: "O armazenamento de mídia não está configurado neste ambiente.",
  indisponivel: "O serviço está temporariamente indisponível. Tente novamente em instantes.",
  rede: "Não foi possível falar com o servidor. Verifique a conexão.",
  url_expirada: "A autorização de envio venceu antes do envio. Envie o arquivo novamente.",
  armazenamento_recusou: "O armazenamento recusou o arquivo. Envie o arquivo novamente.",
  reconciliacao_pendente:
    "Há um envio deste produto aguardando confirmação. Confira-o antes de enviar outro arquivo.",
  envio_em_andamento: "Já há um envio em andamento para este produto.",
  persistencia_indisponivel:
    "Não foi possível guardar o registro desta confirmação neste computador. Por segurança, ela NÃO foi enviada. Tente novamente.",
  desconhecido: "Não foi possível concluir a operação.",
};

function falha(
  tipo: TipoFalhaMidia,
  etapa: EtapaEnvio,
  extra: Partial<Omit<FalhaMidia, "tipo" | "etapa">> = {},
): FalhaMidia {
  return {
    tipo,
    etapa,
    mensagem: extra.mensagem ?? MENSAGENS_PADRAO[tipo],
    incerta: extra.incerta ?? false,
    retryAfterSegundos: extra.retryAfterSegundos ?? null,
    campos: extra.campos ?? [],
  };
}

/** Classifica um erro de uma chamada ao BACKEND (solicitação, confirmação, galeria). */
export function classificarErroMidia(erro: unknown, etapa: EtapaEnvio): FalhaMidia {
  if (!(erro instanceof ApiError))
    return falha("desconhecido", etapa, { incerta: etapa === "confirmacao" });
  const comMensagem = { ...(erro.message ? { mensagem: erro.message } : {}), campos: erro.errors };
  const s = erro.statusCode;
  if (s === 400) return falha("arquivo_invalido", etapa, comMensagem);
  if (s === 401) return falha("sessao", etapa, comMensagem);
  if (s === 403) return falha("sem_permissao", etapa, comMensagem);
  if (s === 404) return falha("nao_encontrado", etapa, comMensagem);
  if (s === 409) return falha("conflito", etapa, comMensagem);
  if (s === 413) return falha("muito_grande", etapa, comMensagem);
  if (s === 429) {
    return falha("limite_requisicoes", etapa, {
      ...comMensagem,
      retryAfterSegundos: erro.retryAfterSegundos ?? JANELA_LIMITE_UPLOAD_SEGUNDOS,
    });
  }
  if (s === 503 && erro.code === "STORAGE_NOT_CONFIGURED")
    return falha("nao_configurado", etapa, comMensagem);
  // Na confirmação, "sem resposta conclusiva" = incerto: o backend pode ter gravado a mídia.
  const incerta = etapa === "confirmacao";
  if (erro.code === "TIMEOUT" || s === 408 || s === 502 || s === 503 || s === 504) {
    return falha("indisponivel", etapa, { ...comMensagem, incerta });
  }
  if (erro.code === "NETWORK_ERROR" || s === 0) return falha("rede", etapa, { incerta });
  return falha("desconhecido", etapa, { ...comMensagem, incerta: incerta && s >= 500 });
}

// ─── Transporte do PUT direto ao armazenamento ──────────────────────────────────────────────────────────────────────

export interface RequisicaoArmazenamento {
  url: string;
  method: string;
  /** Exatamente os cabeçalhos devolvidos pelo backend. */
  headers: Record<string, string>;
  corpo: Blob;
  onProgresso?: (enviados: number, total: number) => void;
  /** Prazo total do envio, em ms (a URL assinada vence depois disso). */
  prazoMs: number;
}

/** `status` HTTP do armazenamento; `0` = sem resposta (rede, CORS, prazo esgotado, cancelado). */
export type TransporteArmazenamento = (
  requisicao: RequisicaoArmazenamento,
) => Promise<{ status: number }>;

/** Construtor mínimo de `XMLHttpRequest` (injetável nos testes). */
export interface XhrMinimo {
  open(method: string, url: string): void;
  setRequestHeader(nome: string, valor: string): void;
  send(corpo: Blob): void;
  timeout: number;
  readonly status: number;
  readonly upload: { onprogress: ((evento: { loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
}

/**
 * `XMLHttpRequest` (e não `fetch`) só pelo progresso do envio. Define SOMENTE os cabeçalhos recebidos; o navegador
 * calcula o `Content-Length` a partir do corpo (é o `size` declarado e assinado). Sem credenciais nem cookies.
 */
export function transporteXhr(
  // O `XMLHttpRequest` real é compatível com `XhrMinimo` em tudo o que é usado (o evento de progresso tem
  // `loaded`/`total`); a conversão só estreita a tipagem de `upload.onprogress`.
  criar: () => XhrMinimo = () => new XMLHttpRequest() as unknown as XhrMinimo,
): TransporteArmazenamento {
  return ({ url, method, headers, corpo, onProgresso, prazoMs }) =>
    new Promise((resolver) => {
      const xhr = criar();
      xhr.open(method, url);
      for (const [nome, valor] of Object.entries(headers)) xhr.setRequestHeader(nome, valor);
      xhr.timeout = Math.max(1, prazoMs);
      xhr.upload.onprogress = onProgresso ? (e) => onProgresso(e.loaded, e.total) : null;
      xhr.onload = () => resolver({ status: xhr.status });
      xhr.onerror = () => resolver({ status: 0 });
      xhr.ontimeout = () => resolver({ status: 0 });
      xhr.onabort = () => resolver({ status: 0 });
      xhr.send(corpo);
    });
}

// ─── Pendências (confirmações sem resultado conclusivo) — DURÁVEIS (Fase 22.8.9.9.3) ────────────────────────────────

export interface EnvioPendente {
  produtoId: string;
  uploadId: string;
  kind: TipoMidia;
  /** O corpo EXATO da confirmação original (repetido na reconciliação). */
  confirmacao: ConfirmarUploadPayload;
  /** `confirmando` = gravado antes do POST; `pendente` = o POST terminou sem resultado conclusivo. */
  estado: EstadoConfirmacao;
  criadoEm: string;
}

export interface PendenciasListadas {
  pendentes: EnvioPendente[];
  /** `uploadId`s com registro ilegível: nunca reaproveitados; só saem por descarte explícito. */
  corrompidos: string[];
}

/**
 * Pendências de confirmação gravadas no armazenamento DURÁVEL (`registro-confirmacoes.ts`): sobrevivem a fechar o
 * app, queda do processo e reinício do Windows. Toda gravação é conferida por uma nova leitura; um registro de OUTRA
 * operação ou ilegível nunca é sobrescrito. Só `uploadId`, produto, tipo, corpo da confirmação, estado e data.
 */
export class RegistroEnviosPendentes {
  constructor(
    private readonly armazenamento: ArmazenamentoConfirmacoes = criarArmazenamentoConfirmacoesSobreStorage(
      criarStorageMemoriaUnica(),
      "memoria",
    ),
  ) {}

  /** `null` = armazenamento inacessível (não se sabe se há pendências). */
  async listarTodas(): Promise<PendenciasListadas | null> {
    const r = await this.armazenamento.listar();
    if (!r.ok) return null;
    const pendentes: EnvioPendente[] = [];
    const corrompidos: string[] = [];
    for (const { uploadId, conteudo } of r.valor) {
      const registro = lerRegistroConfirmacao(uploadId, conteudo);
      if (!registro) corrompidos.push(uploadId);
      else {
        const { versao: _versao, ...pendente } = registro;
        pendentes.push(pendente);
      }
    }
    return { pendentes, corrompidos };
  }

  /** Pendências válidas do produto; `null` = armazenamento inacessível. */
  async listar(produtoId: string): Promise<EnvioPendente[] | null> {
    const todas = await this.listarTodas();
    return todas ? todas.pendentes.filter((p) => p.produtoId === produtoId) : null;
  }

  /** Grava e CONFERE (relendo). `false` = não ficou gravado de forma comprovada. */
  async registrar(pendente: EnvioPendente): Promise<boolean> {
    const conteudo = serializarRegistroConfirmacao(pendente);
    const gravado = await this.armazenamento.gravar(pendente.uploadId, conteudo);
    if (!gravado.ok) return false;
    const lido = await this.armazenamento.listar();
    return (
      lido.ok && lido.valor.some((r) => r.uploadId === pendente.uploadId && r.conteudo === conteudo)
    );
  }

  /** Remove só o registro deste `uploadId` (inclusive corrompido, no descarte explícito). */
  async remover(uploadId: string): Promise<boolean> {
    return (await this.armazenamento.remover(uploadId)).ok;
  }
}

/** Um `Storage` em memória por instância (padrão dos testes). */
function criarStorageMemoriaUnica(): () => Storage {
  const s = criarStorageMemoria();
  return () => s;
}

// ─── Fluxo ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ApiGaleriaEnvio {
  solicitarUpload(
    produtoId: string,
    payload: SolicitarUploadGaleriaPayload,
  ): Promise<UploadGaleriaAutorizado>;
  confirmarUpload(
    produtoId: string,
    uploadId: string,
    payload?: ConfirmarUploadPayload,
  ): Promise<ConfirmacaoUpload>;
  listar(produtoId: string): Promise<GaleriaProduto>;
}

/** Sessão ADMIN: nada é enviado por uma sessão encerrada (mesma regra dos cancelamentos, Fase 22.8.9.5). */
export interface SessaoEnvio {
  geracao(): number;
  /** Há sessão autenticada agora (token presente)? */
  ativa(): boolean;
}

export interface DependenciasEnvio {
  api: ApiGaleriaEnvio;
  transporte: TransporteArmazenamento;
  pendencias: RegistroEnviosPendentes;
  sessao: SessaoEnvio;
  agora: () => number;
}

/** O `PUT` só é feito com pelo menos esta folga antes de a URL vencer (o envio em si leva tempo). */
export const FOLGA_MINIMA_URL_MS = 15_000;

export interface ArquivoParaEnvio {
  /** Nome original (só para conferir a extensão no backend). */
  name: string;
  type: string;
  size: number;
}

export interface ParametrosEnvio {
  produtoId: string;
  arquivo: Blob & ArquivoParaEnvio;
  kind: TipoMidia;
  /** Só imagem. */
  principal?: boolean;
  /** Só imagem. */
  varianteId?: string;
  /** Mídia ATIVA do mesmo tipo a substituir. */
  substituiMidiaId?: string;
  onProgresso?: (enviados: number, total: number) => void;
  /** Fase 22.8.9.9.4 (M3) — avisa a interface da etapa em curso (nada é concluído antes da confirmação). */
  onEtapa?: (etapa: "solicitando" | "enviando" | "confirmando") => void;
}

/** O necessário para (re)tentar a confirmação de um arquivo JÁ enviado — sem novo upload nem nova URL. */
export interface ConfirmacaoARetomar {
  produtoId: string;
  uploadId: string;
  kind: TipoMidia;
  confirmacao: ConfirmarUploadPayload;
  criadoEm: string;
}

export type ResultadoEnvio =
  | { estado: "confirmado"; uploadId: string; midia: MidiaProduto; galeria: GaleriaProduto }
  /** Confirmação sem resultado conclusivo (registro durável mantido): `reconciliarEnvio` antes de outro envio. */
  | { estado: "confirmacao_pendente"; uploadId: string; falha: FalhaMidia }
  /**
   * Fail-closed: o registro durável NÃO pôde ser gravado e conferido, então a confirmação NÃO foi enviada. O arquivo
   * já está no armazenamento: `retomarConfirmacao(retomar)` tenta de novo com o MESMO `uploadId` (sem novo envio).
   */
  | {
      estado: "confirmacao_nao_enviada";
      uploadId: string;
      falha: FalhaMidia;
      retomar: ConfirmacaoARetomar;
    }
  | { estado: "falhou"; uploadId: string | null; falha: FalhaMidia };

/** Recusa local, antes de gastar a cota de requisições (o backend revalida tudo). */
export function validarArquivoLocal(arquivo: ArquivoParaEnvio, kind: TipoMidia): FalhaMidia | null {
  const limites = LIMITES_GALERIA[kind];
  const extensoes = (limites.tipos as Record<string, readonly string[]>)[arquivo.type];
  const permitidos = Object.keys(limites.tipos).join(", ");
  if (!extensoes) {
    return falha("arquivo_invalido", "validacao", {
      mensagem: `Tipo de arquivo não permitido. Use: ${permitidos}.`,
      campos: [{ field: "contentType", message: `Use: ${permitidos}.` }],
    });
  }
  const nome = arquivo.name.trim();
  const extensao = nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!extensoes.includes(extensao)) {
    return falha("arquivo_invalido", "validacao", {
      mensagem: `A extensão do arquivo não corresponde ao tipo (esperado: .${extensoes.join(", .")}).`,
      campos: [{ field: "fileName", message: "Extensão incompatível com o tipo do arquivo." }],
    });
  }
  if (!Number.isInteger(arquivo.size) || arquivo.size < 1) {
    return falha("arquivo_invalido", "validacao", { mensagem: "O arquivo está vazio." });
  }
  if (arquivo.size > limites.tamanhoMaximoBytes) {
    return falha("muito_grande", "validacao", {
      mensagem: `O arquivo excede ${limites.rotuloTamanho}.`,
    });
  }
  return null;
}

function corpoDaConfirmacao(p: ParametrosEnvio): ConfirmarUploadPayload {
  return {
    ...(p.varianteId ? { varianteId: p.varianteId } : {}),
    ...(p.principal ? { principal: true } : {}),
    ...(p.substituiMidiaId ? { substituiMidiaId: p.substituiMidiaId } : {}),
  };
}

const enviosEmAndamento = new WeakMap<RegistroEnviosPendentes, Set<string>>();

function emAndamento(deps: DependenciasEnvio): Set<string> {
  let conjunto = enviosEmAndamento.get(deps.pendencias);
  if (!conjunto) {
    conjunto = new Set();
    enviosEmAndamento.set(deps.pendencias, conjunto);
  }
  return conjunto;
}

/** Envia UM arquivo: solicitação → `PUT` direto → confirmação. Nunca lança: o resultado diz em que etapa parou. */
export async function enviarMidia(
  p: ParametrosEnvio,
  deps: DependenciasEnvio,
): Promise<ResultadoEnvio> {
  const ativos = emAndamento(deps);
  if (ativos.has(p.produtoId)) {
    return { estado: "falhou", uploadId: null, falha: falha("envio_em_andamento", "validacao") };
  }
  const invalido = validarArquivoLocal(p.arquivo, p.kind);
  if (invalido) return { estado: "falhou", uploadId: null, falha: invalido };

  ativos.add(p.produtoId);
  try {
    // Pendência de confirmação deste produto (inclusive de uma abertura anterior do app): reconciliar antes.
    const pendentes = await deps.pendencias.listar(p.produtoId);
    if (pendentes === null) {
      return {
        estado: "falhou",
        uploadId: null,
        falha: falha("persistencia_indisponivel", "validacao"),
      };
    }
    if (pendentes.length > 0) {
      return {
        estado: "falhou",
        uploadId: null,
        falha: falha("reconciliacao_pendente", "validacao"),
      };
    }
    const sessao = { geracao: deps.sessao.geracao() };

    // 1. Solicitação.
    p.onEtapa?.("solicitando");
    let autorizacao: UploadGaleriaAutorizado;
    try {
      autorizacao = await deps.api.solicitarUpload(p.produtoId, {
        fileName: p.arquivo.name,
        contentType: p.arquivo.type,
        kind: p.kind,
        size: p.arquivo.size,
        ...(p.substituiMidiaId ? { substituiMidiaId: p.substituiMidiaId } : {}),
      });
    } catch (erro) {
      return { estado: "falhou", uploadId: null, falha: classificarErroMidia(erro, "solicitacao") };
    }
    const venceEm = deps.agora() + autorizacao.expiresIn * 1000;
    const uploadId = autorizacao.uploadId;

    // 2. Envio direto ao armazenamento — uma única tentativa, nunca com URL vencida.
    const prazoMs = venceEm - deps.agora();
    if (prazoMs < FOLGA_MINIMA_URL_MS) {
      return { estado: "falhou", uploadId, falha: falha("url_expirada", "envio") };
    }
    p.onEtapa?.("enviando");
    const { status } = await deps.transporte({
      url: autorizacao.uploadUrl,
      method: autorizacao.method,
      headers: autorizacao.headers,
      corpo: p.arquivo,
      prazoMs,
      ...(p.onProgresso ? { onProgresso: p.onProgresso } : {}),
    });
    if (status < 200 || status >= 300) {
      const vencida = deps.agora() >= venceEm;
      const tipo: TipoFalhaMidia =
        status === 0
          ? vencida
            ? "url_expirada"
            : "rede"
          : status === 403 && vencida
            ? "url_expirada"
            : status === 413
              ? "muito_grande"
              : status >= 500
                ? "indisponivel"
                : "armazenamento_recusou";
      return { estado: "falhou", uploadId, falha: falha(tipo, "envio") };
    }

    // 3. Confirmação — com registro durável ANTES do POST.
    p.onEtapa?.("confirmando");
    return await confirmarComRegistro(
      {
        produtoId: p.produtoId,
        uploadId,
        kind: p.kind,
        confirmacao: corpoDaConfirmacao(p),
        criadoEm: new Date(deps.agora()).toISOString(),
      },
      sessao.geracao,
      deps,
    );
  } finally {
    ativos.delete(p.produtoId);
  }
}

/**
 * Grava o registro durável (`confirmando`), CONFERE, e só então envia a confirmação. Sem registro comprovado: nada é
 * enviado (fail-closed). Sessão encerrada desde `geracao`: nada é enviado (o registro fica para depois do login).
 * Sucesso → remove o registro; resultado inconclusivo → registro `pendente`; recusa definitiva → remove.
 */
async function confirmarComRegistro(
  alvo: ConfirmacaoARetomar,
  geracao: number,
  deps: DependenciasEnvio,
): Promise<ResultadoEnvio> {
  const { produtoId, uploadId, kind, confirmacao, criadoEm } = alvo;
  const registrado = await deps.pendencias.registrar({
    produtoId,
    uploadId,
    kind,
    confirmacao,
    estado: "confirmando",
    criadoEm,
  });
  if (!registrado) {
    return {
      estado: "confirmacao_nao_enviada",
      uploadId,
      falha: falha("persistencia_indisponivel", "confirmacao"),
      retomar: alvo,
    };
  }
  if (deps.sessao.geracao() !== geracao || !deps.sessao.ativa()) {
    return { estado: "confirmacao_pendente", uploadId, falha: falha("sessao", "confirmacao") };
  }
  try {
    const resposta = await deps.api.confirmarUpload(produtoId, uploadId, confirmacao);
    // O backend já tem a mídia; se a remoção falhar, a próxima verificação a encontra na galeria e remove.
    await deps.pendencias.remover(uploadId);
    const { midia, ...galeria } = resposta;
    return { estado: "confirmado", uploadId, midia, galeria };
  } catch (erro) {
    const f = classificarErroMidia(erro, "confirmacao");
    // Resolvível com o MESMO uploadId (sem novo envio): sem resposta conclusiva, indisponível ou limite de requisições.
    if (f.incerta || f.tipo === "indisponivel" || f.tipo === "limite_requisicoes") {
      await deps.pendencias.registrar({
        produtoId,
        uploadId,
        kind,
        confirmacao,
        estado: "pendente",
        criadoEm,
      });
      return { estado: "confirmacao_pendente", uploadId, falha: f };
    }
    await deps.pendencias.remover(uploadId);
    return { estado: "falhou", uploadId, falha: f };
  }
}

/** Nova tentativa depois de `confirmacao_nao_enviada` (falha de persistência): mesmo `uploadId`, sem novo envio. */
export async function retomarConfirmacao(
  retomar: ConfirmacaoARetomar,
  deps: DependenciasEnvio,
): Promise<ResultadoEnvio> {
  return confirmarComRegistro(retomar, deps.sessao.geracao(), deps);
}

/**
 * Reconcilia UMA pendência por ação do operador: 1) lê a galeria — se a mídia `uploadId` já estiver lá, foi
 * confirmada (o registro é removido); 2) senão repete a confirmação com o MESMO `uploadId` e o MESMO corpo gravados
 * (idempotente). Nunca pede nova URL nem reenvia o arquivo. Falha temporária mantém o registro.
 */
export async function reconciliarEnvio(
  produtoId: string,
  uploadId: string,
  deps: DependenciasEnvio,
): Promise<ResultadoEnvio> {
  const geracao = deps.sessao.geracao();
  const pendentes = await deps.pendencias.listar(produtoId);
  const pendente = pendentes?.find((p) => p.uploadId === uploadId);
  if (!pendente) {
    return {
      estado: "falhou",
      uploadId,
      falha:
        pendentes === null
          ? falha("persistencia_indisponivel", "reconciliacao")
          : falha("nao_encontrado", "reconciliacao", {
              mensagem: "Não há confirmação pendente com este identificador.",
            }),
    };
  }
  let galeria: GaleriaProduto;
  try {
    galeria = await deps.api.listar(produtoId);
  } catch (erro) {
    return {
      estado: "confirmacao_pendente",
      uploadId,
      falha: { ...classificarErroMidia(erro, "reconciliacao"), incerta: true },
    };
  }
  const midia = galeria.midias.find((m) => m.id === uploadId);
  if (midia) {
    await deps.pendencias.remover(uploadId);
    return { estado: "confirmado", uploadId, midia, galeria };
  }
  return confirmarComRegistro(pendente, geracao, deps);
}

export type SituacaoVerificada =
  | { uploadId: string; produtoId: string; situacao: "confirmada" }
  /** A mídia não está na galeria: a confirmação pode ser repetida pelo operador (`reconciliarEnvio`). */
  | {
      uploadId: string;
      produtoId: string;
      situacao: "aguardando_confirmacao";
      pendente: EnvioPendente;
    }
  /** A galeria não pôde ser consultada agora: o registro é mantido. */
  | { uploadId: string; produtoId: string; situacao: "nao_verificada"; falha: FalhaMidia }
  | { uploadId: string; produtoId: null; situacao: "corrompida" };

/**
 * Verificação na abertura do app (ou ao entrar): SÓ LEITURA da galeria — nenhum POST, nenhum upload. Com a sessão
 * ativa, para cada pendência: mídia já na galeria → confirmada (registro removido); senão → aguardando o operador.
 * Sem sessão ou com o armazenamento inacessível: `null`, nada é consultado.
 */
export async function verificarPendencias(
  deps: DependenciasEnvio,
): Promise<SituacaoVerificada[] | null> {
  if (!deps.sessao.ativa()) return null;
  const todas = await deps.pendencias.listarTodas();
  if (!todas) return null;
  const resultado: SituacaoVerificada[] = todas.corrompidos.map((uploadId) => ({
    uploadId,
    produtoId: null,
    situacao: "corrompida" as const,
  }));
  const galerias = new Map<string, Promise<GaleriaProduto>>();
  for (const pendente of todas.pendentes) {
    const { produtoId, uploadId } = pendente;
    if (!galerias.has(produtoId)) galerias.set(produtoId, deps.api.listar(produtoId));
    try {
      const galeria = await galerias.get(produtoId)!;
      if (galeria.midias.some((m) => m.id === uploadId)) {
        await deps.pendencias.remover(uploadId);
        resultado.push({ uploadId, produtoId, situacao: "confirmada" });
      } else {
        resultado.push({ uploadId, produtoId, situacao: "aguardando_confirmacao", pendente });
      }
    } catch (erro) {
      resultado.push({
        uploadId,
        produtoId,
        situacao: "nao_verificada",
        falha: classificarErroMidia(erro, "reconciliacao"),
      });
    }
  }
  return resultado;
}

/** Desiste EXPLICITAMENTE de uma pendência (ou registro corrompido). O registro do backend expira sozinho. */
export async function descartarPendencia(
  uploadId: string,
  deps: DependenciasEnvio,
): Promise<boolean> {
  return deps.pendencias.remover(uploadId);
}
