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
import { LIMITES_GALERIA, type MidiaProduto } from "@/types/media";

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

export function vagasRestantes(imagensNaGaleria: number, fila: readonly ItemFila[]): number {
  const naFila = fila.filter((i) => !i.substituiMidiaId && OCUPAM_VAGA.includes(i.estado)).length;
  return Math.max(0, LIMITE_IMAGENS - imagensNaGaleria - naFila);
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
  { substituicao = false }: { substituicao?: boolean } = {},
): { aceitos: File[]; recusados: Recusa[] } {
  const aceitos: File[] = [];
  const recusados: Recusa[] = [];
  let livres = vagas;
  for (const arquivo of arquivos) {
    const invalido = validarArquivoLocal(arquivo, "image");
    if (invalido) {
      recusados.push({ nome: arquivo.name, motivo: invalido.mensagem });
      continue;
    }
    if (!substituicao) {
      if (livres <= 0) {
        recusados.push({
          nome: arquivo.name,
          motivo: `Limite de ${LIMITE_IMAGENS} fotos por produto (contando as fotos da galeria e os envios em andamento).`,
        });
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
  };
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
