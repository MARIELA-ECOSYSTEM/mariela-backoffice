/**
 * Fase 22.8.9.9.4 (M3) — regras PURAS da fila de fotos da galeria (sem React, sem rede): validação local da seleção,
 * cálculo de vagas e transições de estado de cada item. A validação usa a MESMA função do fluxo de envio
 * (`validarArquivoLocal`, limites de `LIMITES_GALERIA` — os do backend); o backend continua sendo a autoridade.
 *
 * A fila guarda o `File` e a URL `blob:` da pré-visualização só em MEMÓRIA, enquanto a tela está aberta: nada disso
 * vai para o registro durável das confirmações (que só tem `uploadId`, produto, tipo, corpo, estado e data).
 */
import {
  validarArquivoLocal,
  type ConfirmacaoARetomar,
  type FalhaMidia,
} from "@/services/midia/envio-midia";
import { LIMITES_GALERIA, type MidiaProduto, type TipoMidia } from "@/types/media";

export const LIMITE_IMAGENS = LIMITES_GALERIA.image.maximoPorProduto;

/**
 * Envios simultâneos: 1 (sequencial). O fluxo M2 já admite um envio por produto de cada vez, o backend valida uma
 * confirmação por vez (instância de 512 MiB) e limita 30 solicitações/confirmações por minuto — paralelizar só
 * criaria fila no servidor e risco de 429.
 */
export const ENVIOS_SIMULTANEOS = 1;

export type EstadoItem =
  | "aguardando"
  | "solicitando"
  | "enviando"
  | "confirmando"
  | "concluida"
  | "falhou"
  | "confirmacao_pendente"
  | "confirmacao_nao_enviada";

export const ROTULO_ESTADO: Record<EstadoItem, string> = {
  aguardando: "Aguardando envio",
  solicitando: "Solicitando autorização",
  enviando: "Enviando",
  confirmando: "Confirmando",
  concluida: "Concluída",
  falhou: "Falhou",
  confirmacao_pendente: "Confirmação pendente",
  confirmacao_nao_enviada: "Confirmação não enviada",
};

export interface ItemFila {
  id: string;
  arquivo: File;
  nome: string;
  tipo: string;
  tamanho: number;
  /** URL `blob:` da pré-visualização (liberada ao remover o item ou desmontar a tela). */
  previewUrl: string;
  estado: EstadoItem;
  /** 0–100 durante o envio; `null` quando não se aplica ou não é conhecido. */
  progresso: number | null;
  falha: FalhaMidia | null;
  uploadId: string | null;
  /** Para `confirmacao_nao_enviada`: o necessário para tentar a confirmação de novo, SEM novo envio do arquivo. */
  retomar: ConfirmacaoARetomar | null;
  /** Substituição: `id` da mídia que este arquivo vai substituir (não consome vaga). */
  substituiMidiaId: string | null;
  /** Fase 22.8.9.9.6 (M4) — duração lida localmente (vídeo), em segundos; `null` se não lida/desconhecida. */
  duracaoSegundos: number | null;
}

export interface Recusa {
  nome: string;
  motivo: string;
}

/** Estados em que o item ainda pode ocupar uma vaga (ainda não é foto da galeria nem falhou de vez). */
const OCUPAM_VAGA: readonly EstadoItem[] = [
  "aguardando",
  "solicitando",
  "enviando",
  "confirmando",
  "confirmacao_pendente",
  "confirmacao_nao_enviada",
];

/** Itens que podem ser tirados da fila (não estão no meio de uma requisição). */
export const PODE_REMOVER: readonly EstadoItem[] = ["aguardando", "falhou", "concluida"];

/** Vagas do tipo (`image`: 10; `video`: 1 — `LIMITES_GALERIA`), descontando a galeria e a fila. */
export function vagasRestantes(
  naGaleria: number,
  fila: readonly ItemFila[],
  kind: TipoMidia = "image",
): number {
  const naFila = fila.filter((i) => !i.substituiMidiaId && OCUPAM_VAGA.includes(i.estado)).length;
  return Math.max(0, LIMITES_GALERIA[kind].maximoPorProduto - naGaleria - naFila);
}

/** Texto da recusa por falta de vaga. */
export function motivoSemVaga(kind: TipoMidia): string {
  return kind === "video"
    ? 'Limite de 1 vídeo por produto (contando o vídeo da galeria e os envios em andamento). Use "Substituir vídeo".'
    : `Limite de ${LIMITE_IMAGENS} fotos por produto (contando as fotos da galeria e os envios em andamento).`;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Rótulo curto do formato (`image/jpeg` → `JPEG`). */
export function rotuloFormato(tipo: string): string {
  const sub = tipo.split("/")[1] ?? tipo;
  return (sub === "jpg" ? "jpeg" : sub).toUpperCase() || "?";
}

/**
 * Separa a seleção em aceitos e recusados, ANTES de qualquer requisição: tipo/extensão, vazio, tamanho (mesma regra
 * do fluxo de envio) e vagas (galeria + fila). Substituições (`substituicao: true`) não consomem vaga.
 */
export function validarSelecao(
  arquivos: readonly File[],
  vagas: number,
  { substituicao = false, kind = "image" }: { substituicao?: boolean; kind?: TipoMidia } = {},
): { aceitos: File[]; recusados: Recusa[] } {
  const aceitos: File[] = [];
  const recusados: Recusa[] = [];
  let livres = vagas;
  for (const arquivo of arquivos) {
    const invalido = validarArquivoLocal(arquivo, kind);
    if (invalido) {
      recusados.push({ nome: arquivo.name, motivo: invalido.mensagem });
      continue;
    }
    if (!substituicao) {
      if (livres <= 0) {
        recusados.push({ nome: arquivo.name, motivo: motivoSemVaga(kind) });
        continue;
      }
      livres -= 1;
    }
    aceitos.push(arquivo);
  }
  return { aceitos, recusados };
}

export function novoItem(
  arquivo: File,
  id: string,
  previewUrl: string,
  substituiMidiaId: string | null = null,
  duracaoSegundos: number | null = null,
): ItemFila {
  return {
    id,
    arquivo,
    nome: arquivo.name,
    tipo: arquivo.type,
    tamanho: arquivo.size,
    previewUrl,
    estado: "aguardando",
    progresso: null,
    falha: null,
    uploadId: null,
    retomar: null,
    substituiMidiaId,
    duracaoSegundos,
  };
}

// ─── Fase 22.8.9.9.6 (M4) — vídeo ──────────────────────────────────────────────────────────────────────────────────

export const DURACAO_MAXIMA_VIDEO_S = LIMITES_GALERIA.video.duracaoMaximaSegundos;

/** Elemento mínimo para ler a duração (injetável nos testes). */
export interface VideoParaMetadados {
  preload: string;
  muted: boolean;
  src: string;
  readonly duration: number;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute(nome: string): void;
  load(): void;
}

/**
 * Duração do vídeo LOCAL (antes de qualquer requisição), lendo só os METADADOS (`preload="metadata"`): o arquivo não
 * é reproduzido nem decodificado por inteiro. `null` se não der para ler (formato que o navegador não abre, prazo
 * esgotado) — nesse caso quem decide é o backend (30 s, conferidos na confirmação). A URL `blob:` é sempre liberada.
 */
export function lerDuracaoVideo(
  arquivo: Blob,
  {
    criarElemento = () => document.createElement("video") as unknown as VideoParaMetadados,
    criarUrl = (a: Blob) => URL.createObjectURL(a),
    liberarUrl = (u: string) => URL.revokeObjectURL(u),
    prazoMs = 10_000,
  }: {
    criarElemento?: () => VideoParaMetadados;
    criarUrl?: (a: Blob) => string;
    liberarUrl?: (u: string) => void;
    prazoMs?: number;
  } = {},
): Promise<number | null> {
  return new Promise((resolver) => {
    const url = criarUrl(arquivo);
    const video = criarElemento();
    let encerrado = false;
    const fim = (valor: number | null) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(prazo);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      liberarUrl(url);
      resolver(valor);
    };
    const prazo = setTimeout(() => fim(null), prazoMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      fim(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => fim(null);
    video.src = url;
  });
}

/** Recusa por duração (só quando a duração foi lida e passa do limite do backend). */
export function motivoDuracao(duracaoSegundos: number | null): string | null {
  if (duracaoSegundos === null || duracaoSegundos <= DURACAO_MAXIMA_VIDEO_S) return null;
  return `O vídeo tem ${formatarDuracao(duracaoSegundos)}; o máximo é ${DURACAO_MAXIMA_VIDEO_S} s.`;
}

export function formatarDuracao(segundos: number): string {
  const s = Math.round(segundos);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** Percentual inteiro (0–100) a partir de bytes enviados; `null` se o total é desconhecido. */
export function percentual(enviados: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((enviados / total) * 100)));
}

/** O próximo item a enviar (ordem de seleção), respeitando `ENVIOS_SIMULTANEOS`. */
export function proximoParaEnviar(fila: readonly ItemFila[]): ItemFila | null {
  const ativos = fila.filter((i) =>
    ["solicitando", "enviando", "confirmando"].includes(i.estado),
  ).length;
  if (ativos >= ENVIOS_SIMULTANEOS) return null;
  return fila.find((i) => i.estado === "aguardando") ?? null;
}

/** Nova ordem COMPLETA (todas as mídias), trocando de lugar duas imagens vizinhas — o resto (inclusive vídeo) não se move. */
export function ordemComTroca(midias: readonly MidiaProduto[], idA: string, idB: string): string[] {
  const ids = [...midias].sort((a, b) => a.ordem - b.ordem).map((m) => m.id);
  const i = ids.indexOf(idA);
  const j = ids.indexOf(idB);
  if (i < 0 || j < 0) return ids;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}
