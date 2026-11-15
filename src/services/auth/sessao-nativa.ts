/**
 * Fase 22.8.8.4 (M4) — serviço central da sessão no APP DESKTOP: Windows Credential Manager (cliente da M3,
 * `cofre-sessao.ts`) como armazenamento principal, com o armazenamento legado (localStorage, `token-storage.ts`)
 * mantido como ESPELHO de compatibilidade e recuperação durante esta fase.
 *
 * ── Modelo ───────────────────────────────────────────────────────────────────────────────────────────────────────
 *   - O código de autenticação continua lendo e gravando a sessão de forma SÍNCRONA pelo `token-storage.ts` (nada no
 *     protocolo de refresh/idempotência muda). Toda mudança grava PRIMEIRO o legado e DEPOIS é espelhada no cofre:
 *     o legado é sempre igual ou mais novo que o cofre.
 *   - Cada gravação no cofre é CONFIRMADA por releitura e comparação. Só então o MARCADOR (`mariela.sessaoNativa`,
 *     sem segredo) passa a apontar o SHA-256 do refresh token confirmado. Assim, marcador == cofre sempre que o
 *     marcador diz "migrada".
 *   - O cofre passa a ser a FONTE na abertura só depois de uma migração confirmada; a cópia legada nunca é apagada por
 *     migração nesta fase (só o logout a limpa, como antes).
 *   - Web (fora do Tauri): nada muda — nenhum comando nativo é invocado (`modo: "web"`).
 *
 * ── Abertura (`aguardarSessaoPreparada`, uma vez por processo) ────────────────────────────────────────────────────
 *   L = sessão legada, C = sessão no cofre, M = marcador.
 *   G. Erro de leitura/IPC no cofre ............ modo LEGADO (nada é tratado como "sem sessão"; nada é apagado)
 *      Cofre indisponível (inclui outros SOs) .. modo LEGADO, sinalizado
 *   M = "encerrada" (logout anterior) .......... nunca usa C; tenta apagá-lo de novo. Se L for válido (escrito depois,
 *                                                ex.: por uma versão anterior do app), segue para o caso A.
 *   A. L válido, C vazio ......................... MIGRA: grava, relê, compara; só então marca. Falha → modo LEGADO
 *   B. L válido, C válido:
 *      - mesmo refresh token .................... mesma sessão (mescla a pendência, se só um lado a tiver) → NATIVO
 *      - M aponta C ............................. L é mais novo (gravado depois do último C confirmado) → regrava C
 *      - caso contrário ......................... INDETERMINADO: preserva ambos, modo LEGADO, sinalizado
 *   C. L inválido (presente, malformado), C válido → usa C (regrava o espelho legado)
 *      L ausente, C válido: M ausente → usa C (ex.: dados do WebView apagados); M = "migrada" → a sessão foi
 *      encerrada fora deste app (ex.: logout numa versão anterior) → NÃO ressuscita; apaga C
 *   D. L válido, cofre indisponível ............. modo LEGADO, sinalizado (= G)
 *   E. ambos ausentes ............................ sem sessão, modo NATIVO
 *   F. ambos inválidos ........................... nada é reconstruído; o fluxo atual exige novo login
 *
 * ── Durante a execução ────────────────────────────────────────────────────────────────────────────────────────────
 *   `sincronizarSessaoNativa()` espelha no cofre o estado ATUAL do legado (lido na hora — nunca um estado antigo) e
 *   confirma. `registrarEncerramentoNativo()` marca "encerrada" SÍNCRONAMENTE e depois apaga o cofre. Uma
 *   sincronização que começou antes de um logout nunca reescreve o marcador (geração da sessão, Fase 22.8.4).
 *   Nenhum token, chave ou conteúdo é registrado em log ou devolvido em erro.
 */
import {
  criarCofreSessao,
  sessaoV1Valida,
  transporteTauri,
  type CofreSessao,
  type CodigoErroCofre,
  type PendenciaV1,
  type SessaoV1,
} from "./cofre-sessao";
import { lerRenovacaoPendente, vinculoDoRefreshToken } from "./refresh-idempotencia";
import { geracaoDaSessao } from "./session";
import {
  marcadorSessaoNativaStorageAtual,
  obterExpiraEm,
  refreshTokenStorage,
  restaurarSessaoPersistida,
  tokenStorage,
} from "./token-storage";

export type MotivoModoLegado =
  /** O cofre respondeu com erro ou não respondeu (inclui falha de IPC e plataformas sem Credential Manager). */
  | "cofre_indisponivel"
  /** A migração (ou a gravação depois de um login) não pôde ser confirmada; tenta de novo na próxima abertura. */
  | "migracao_nao_confirmada"
  /** Legado e cofre têm sessões diferentes e não dá para saber qual é a mais nova: ambos preservados. */
  | "sessoes_divergentes";

export type EstadoArmazenamento =
  { modo: "web" } | { modo: "nativo" } | { modo: "legado"; motivo: MotivoModoLegado };

// ─── Configuração (injetável nos testes) ─────────────────────────────────────────────────────────────────────────

interface Configuracao {
  desktop: () => boolean;
  cofre: () => CofreSessao;
}

let cofreProcesso: CofreSessao | null = null;
const configuracaoPadrao: Configuracao = {
  desktop: () => transporteTauri.disponivel(),
  // Um único cliente (fila + seq) por processo, criado só no desktop e só quando usado.
  cofre: () => (cofreProcesso ??= criarCofreSessao(transporteTauri)),
};
let configuracao: Configuracao = configuracaoPadrao;

let preparacao: Promise<EstadoArmazenamento> | null = null;
let estado: EstadoArmazenamento | null = null;
let fila: Promise<unknown> = Promise.resolve();

/** SOMENTE TESTES: troca ambiente/cofre e zera o estado do serviço. */
export function configurarSessaoNativaParaTestes(nova: Partial<Configuracao> | null): void {
  configuracao = nova ? { ...configuracaoPadrao, ...nova } : configuracaoPadrao;
  cofreProcesso = null;
  preparacao = null;
  estado = null;
  fila = Promise.resolve();
}

function enfileirar<T>(operacao: () => Promise<T>): Promise<T> {
  const resultado = fila.then(operacao, operacao);
  fila = resultado.catch(() => undefined);
  return resultado;
}

// ─── Marcador ────────────────────────────────────────────────────────────────────────────────────────────────────

type Marcador = { estado: "migrada"; vinculo: string } | { estado: "encerrada" } | null;

function lerMarcador(): Marcador {
  try {
    const bruto = marcadorSessaoNativaStorageAtual.get();
    if (!bruto) return null;
    const m = JSON.parse(bruto) as Record<string, unknown>;
    if (m["v"] !== 1) return null;
    if (m["estado"] === "encerrada") return { estado: "encerrada" };
    if (
      m["estado"] === "migrada" &&
      typeof m["vinculo"] === "string" &&
      /^[0-9a-f]{64}$/.test(m["vinculo"])
    ) {
      return { estado: "migrada", vinculo: m["vinculo"] };
    }
    return null;
  } catch {
    return null;
  }
}

function gravarMarcador(marcador: Exclude<Marcador, null>): void {
  try {
    marcadorSessaoNativaStorageAtual.set(JSON.stringify({ v: 1, ...marcador }));
  } catch {
    // Sem marcador, a próxima abertura cai num caso conservador (B indeterminado ou A) — nunca perde a sessão.
  }
}

// ─── Sessão legada ↔ formato v1 ──────────────────────────────────────────────────────────────────────────────────

type SessaoLegada =
  { tipo: "ausente" } | { tipo: "invalida" } | { tipo: "valida"; sessao: SessaoV1 };

/** Ordem fixa das chaves: a comparação de confirmação é feita sobre `JSON.stringify` deste formato. */
function normalizar(s: SessaoV1): SessaoV1 {
  return {
    v: 1,
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    expiresAt: s.expiresAt,
    pendencia: s.pendencia
      ? { vinculo: s.pendencia.vinculo, chave: s.pendencia.chave, criadaEm: s.pendencia.criadaEm }
      : null,
  };
}

const iguais = (a: SessaoV1, b: SessaoV1) =>
  JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));

/** Lê o legado ATUAL e o converte para v1 (a pendência só entra se o vínculo for o do refresh token atual). */
async function lerSessaoLegada(): Promise<SessaoLegada> {
  let accessToken: string | null;
  let refreshToken: string | null;
  try {
    accessToken = tokenStorage.get();
    refreshToken = refreshTokenStorage.get();
  } catch {
    return { tipo: "invalida" };
  }
  if (!accessToken && !refreshToken) return { tipo: "ausente" };
  if (!accessToken || !refreshToken) return { tipo: "invalida" };
  const expiresAt = obterExpiraEm() ?? 0; // sem expiração conhecida → vencido → renovação proativa (como hoje)
  const registro = lerRenovacaoPendente();
  let pendencia: PendenciaV1 | null = null;
  if (registro && registro.vinculo === (await vinculoDoRefreshToken(refreshToken))) {
    pendencia = { vinculo: registro.vinculo, chave: registro.chave, criadaEm: registro.criadaEm };
  }
  const sessao: SessaoV1 = { v: 1, accessToken, refreshToken, expiresAt, pendencia };
  return sessaoV1Valida(sessao) ? { tipo: "valida", sessao } : { tipo: "invalida" };
}

function escreverLegado(s: SessaoV1): void {
  restaurarSessaoPersistida({
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    expiresAt: s.expiresAt,
    pendenciaSerializada: s.pendencia
      ? JSON.stringify({
          versao: 1,
          vinculo: s.pendencia.vinculo,
          chave: s.pendencia.chave,
          criadaEm: s.pendencia.criadaEm,
          estado: "pendente",
        })
      : null,
  });
}

// ─── Gravação confirmada no cofre ────────────────────────────────────────────────────────────────────────────────

type ResultadoGravacao =
  { ok: true } | { ok: false; codigo: CodigoErroCofre | "CONTEUDO_DIVERGENTE" };

/** Grava, relê e compara. NÃO mexe no marcador (quem chama decide, conforme a geração). */
async function gravarConfirmando(cofre: CofreSessao, sessao: SessaoV1): Promise<ResultadoGravacao> {
  const gravacao = await cofre.gravar(sessao);
  if (!gravacao.ok) return gravacao;
  const leitura = await cofre.carregar();
  if (!leitura.ok) return leitura;
  if (!leitura.valor || !iguais(leitura.valor, sessao))
    return { ok: false, codigo: "CONTEUDO_DIVERGENTE" };
  return { ok: true };
}

async function marcarMigrada(sessao: SessaoV1): Promise<void> {
  gravarMarcador({ estado: "migrada", vinculo: await vinculoDoRefreshToken(sessao.refreshToken) });
}

// ─── Abertura ────────────────────────────────────────────────────────────────────────────────────────────────────

async function preparar(): Promise<EstadoArmazenamento> {
  if (!configuracao.desktop()) return { modo: "web" };
  const cofre = configuracao.cofre();
  return enfileirar(async () => {
    const leitura = await cofre.carregar();
    // G/D: erro NUNCA é tratado como "sem sessão" — o legado continua sendo usado e nada é apagado.
    if (!leitura.ok && leitura.codigo !== "RESPOSTA_INVALIDA") {
      return { modo: "legado", motivo: "cofre_indisponivel" } as const;
    }
    const nativa = leitura.ok ? leitura.valor : null; // conteúdo inválido no cofre = sem sessão nativa utilizável
    const cofreInvalido = !leitura.ok;
    const legada = await lerSessaoLegada();
    const marcador = lerMarcador();

    // Logout anterior: o cofre nunca ressuscita a sessão encerrada.
    if (marcador?.estado === "encerrada" && (nativa || cofreInvalido)) {
      await cofre.apagar(); // melhor esforço; o marcador continua "encerrada" até um login novo
    }
    const nativaUtilizavel = marcador?.estado === "encerrada" ? null : nativa;

    if (legada.tipo === "valida") {
      if (!nativaUtilizavel) {
        // A — migração.
        const r = await gravarConfirmando(cofre, legada.sessao);
        if (!r.ok) return { modo: "legado", motivo: "migracao_nao_confirmada" } as const;
        await marcarMigrada(legada.sessao);
        return { modo: "nativo" } as const;
      }
      // B — ambos válidos.
      if (nativaUtilizavel.refreshToken === legada.sessao.refreshToken) {
        // Mesma sessão. A pendência só vale para este refresh token; mantém a que existir (legado tem precedência,
        // por ser sempre o mais novo). Se o cofre ficou para trás, regrava.
        const mesclada: SessaoV1 = {
          ...legada.sessao,
          pendencia: legada.sessao.pendencia ?? nativaUtilizavel.pendencia,
        };
        if (!iguais(mesclada, legada.sessao)) escreverLegado(mesclada);
        if (!iguais(mesclada, nativaUtilizavel)) {
          const r = await gravarConfirmando(cofre, mesclada);
          if (!r.ok) return { modo: "legado", motivo: "migracao_nao_confirmada" } as const;
        }
        await marcarMigrada(mesclada);
        return { modo: "nativo" } as const;
      }
      const vinculoNativo = await vinculoDoRefreshToken(nativaUtilizavel.refreshToken);
      if (marcador?.estado === "migrada" && marcador.vinculo === vinculoNativo) {
        // O cofre é o último estado confirmado; o legado mudou depois — é mais novo. Regrava o cofre.
        const r = await gravarConfirmando(cofre, legada.sessao);
        if (!r.ok) return { modo: "legado", motivo: "migracao_nao_confirmada" } as const;
        await marcarMigrada(legada.sessao);
        return { modo: "nativo" } as const;
      }
      // Indeterminado: nada é sobrescrito nem apagado.
      return { modo: "legado", motivo: "sessoes_divergentes" } as const;
    }

    if (nativaUtilizavel) {
      // C — o legado não tem sessão utilizável.
      if (legada.tipo === "ausente" && marcador?.estado === "migrada") {
        // Encerrada fora deste app (ex.: logout numa versão anterior, que não conhece o cofre): não ressuscita.
        await cofre.apagar();
        gravarMarcador({ estado: "encerrada" });
        return { modo: "nativo" } as const;
      }
      escreverLegado(nativaUtilizavel);
      await marcarMigrada(nativaUtilizavel);
      return { modo: "nativo" } as const;
    }

    // E/F — sem sessão utilizável em nenhum dos dois: o fluxo atual decide (sem sessão → login).
    return { modo: "nativo" } as const;
  });
}

/**
 * Prepara (uma única vez por processo) o armazenamento da sessão. TODO acesso aos tokens no desktop aguarda isto:
 * a reconciliação pode regravar o espelho legado a partir do cofre. Na web, resolve imediatamente.
 */
export function aguardarSessaoPreparada(): Promise<EstadoArmazenamento> {
  preparacao ??= preparar()
    .catch((): EstadoArmazenamento => ({ modo: "legado", motivo: "cofre_indisponivel" }))
    .then((resultado) => (estado = resultado));
  return preparacao;
}

/** Estado atual (ou `null` antes da preparação terminar). */
export function estadoArmazenamento(): EstadoArmazenamento | null {
  return estado;
}

// ─── Durante a execução ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Espelha no cofre o estado ATUAL do legado e confirma. `true` = cofre confirmado igual ao legado (ou nada a fazer
 * fora do modo nativo). `false` = não confirmado: o legado continua íntegro e a próxima abertura reconcilia.
 */
export function sincronizarSessaoNativa(): Promise<boolean> {
  if (!configuracao.desktop()) return Promise.resolve(true);
  return aguardarSessaoPreparada().then(() => {
    // O estado VIGENTE (um login pode ter mudado o modo depois da preparação), não o resultado memorizado.
    if (estado?.modo !== "nativo") return true;
    const cofre = configuracao.cofre();
    const geracao = geracaoDaSessao();
    return enfileirar(async () => {
      const legada = await lerSessaoLegada();
      if (legada.tipo !== "valida") return legada.tipo === "ausente"; // sem sessão: o encerramento cuida do cofre
      if (geracaoDaSessao() !== geracao) return false; // a sessão mudou (logout/login): não grava estado antigo
      const r = await gravarConfirmando(cofre, legada.sessao);
      if (!r.ok || geracaoDaSessao() !== geracao) return false;
      await marcarMigrada(legada.sessao);
      return true;
    });
  });
}

/**
 * Fim da sessão (logout, rejeição definitiva). Marca "encerrada" IMEDIATAMENTE (síncrono) — mesmo que apagar o cofre
 * falhe, a próxima abertura não restaura a sessão antiga — e então apaga o cofre (alvo fixo; só esta sessão).
 */
export function registrarEncerramentoNativo(): Promise<boolean> {
  if (!configuracao.desktop()) return Promise.resolve(true);
  gravarMarcador({ estado: "encerrada" });
  return aguardarSessaoPreparada().then(() => {
    const cofre = configuracao.cofre();
    return enfileirar(async () => (await cofre.apagar()).ok);
  });
}

/**
 * Depois de um LOGIN novo: a sessão nova substitui qualquer anterior (inclusive um estado divergente), então é
 * gravada no cofre e confirmada. Falha → modo LEGADO explícito (a sessão nova continua válida pelo legado).
 */
export function persistirLoginNativo(): Promise<EstadoArmazenamento> {
  if (!configuracao.desktop()) return Promise.resolve({ modo: "web" });
  return aguardarSessaoPreparada().then(() => {
    const cofre = configuracao.cofre();
    const geracao = geracaoDaSessao();
    return enfileirar(async (): Promise<EstadoArmazenamento> => {
      const legada = await lerSessaoLegada();
      if (legada.tipo !== "valida" || geracaoDaSessao() !== geracao) {
        return (estado = { modo: "legado", motivo: "migracao_nao_confirmada" });
      }
      const r = await gravarConfirmando(cofre, legada.sessao);
      if (!r.ok || geracaoDaSessao() !== geracao) {
        return (estado = {
          modo: "legado",
          motivo: r.ok ? "migracao_nao_confirmada" : "cofre_indisponivel",
        });
      }
      await marcarMigrada(legada.sessao);
      return (estado = { modo: "nativo" });
    });
  });
}
