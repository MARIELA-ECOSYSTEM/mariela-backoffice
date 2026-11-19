/**
 * Fase 42.7 — upload de mídia do catálogo (imagem/vídeo) direto ao Cloudflare
 * R2, via URL pré-assinada emitida pelo backend (`POST /media/presigned-upload`).
 * O Backoffice nunca possui credenciais R2 — só pede a URL, faz o PUT direto
 * ao bucket, e salva `publicUrl` em `foto`/`video` pelos endpoints de
 * variante já existentes (contrato dessas rotas permanece inalterado).
 *
 * Espelha exatamente `mariela-backend/src/modules/media/dto/solicitar-upload.dto.ts`
 * e `media.types.ts` (`SolicitarUploadDto`/`UploadPresignado`).
 *
 * Fase 22.8.9.9.2 (M2) — os tipos acima são do endpoint LEGADO (mantidos sem alteração). A galeria do produto
 * (`/produtos/:id/midias/*`) está mais abaixo, espelhando o backend no commit M1 (`b622fa6`).
 */
export type TipoMidia = "image" | "video";

export interface SolicitarUploadPayload {
  fileName: string;
  contentType: string;
  kind: TipoMidia;
  size: number;
  produtoId: string;
}

export interface UploadPresignado {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

// ─── Fase 22.8.9.9.2 (M2) — galeria do produto ─────────────────────────────────────────────────────────────────────

/** `upload`: arquivo enviado ao R2 e confirmado pelo backend. `legado`: URL externa preservada (sem chave R2). */
export type OrigemMidia = "upload" | "legado";

/**
 * Item de `Produto.midias` como o backend serializa (`midia-produto.schema.ts`, `_id` → `id`). O `id` de uma mídia
 * enviada é o próprio `uploadId` — é isso que torna a confirmação idempotente e permite reconciliar pela galeria.
 */
export interface MidiaProduto {
  id: string;
  tipo: TipoMidia;
  /** Chave do objeto no R2; `null` para mídia legada externa. */
  chave: string | null;
  /** URL pública montada pelo backend (nunca enviada pelo cliente). */
  url: string;
  contentType: string | null;
  /** Bytes; `null` quando desconhecido (mídia legada). */
  tamanho: number | null;
  nomeOriginal: string | null;
  origem: OrigemMidia;
  /** Só imagens podem ser associadas a uma variante (vídeo sempre `null`). */
  varianteId: string | null;
  ordem: number;
  criadoEm: string;
  criadoPor: string | null;
}

/** `GET /produtos/:id/midias` e as respostas das edições da galeria. */
export interface GaleriaProduto {
  /** Mídias ativas pela `ordem`. */
  midias: MidiaProduto[];
  /** Imagem principal EFETIVA: a marcada ou a primeira imagem pela ordem; `null` sem imagens. */
  midiaPrincipalId: string | null;
}

/** Corpo de `POST /produtos/:id/midias/uploads` (`SolicitarUploadGaleriaDto`). */
export interface SolicitarUploadGaleriaPayload {
  /** Nome original — usado só para conferir a extensão; nunca vira parte da chave. */
  fileName: string;
  contentType: string;
  kind: TipoMidia;
  /** Bytes; também é o `Content-Length` assinado. */
  size: number;
  /** Id de uma mídia ATIVA do mesmo tipo que o novo arquivo vai substituir (não consome vaga). */
  substituiMidiaId?: string;
}

/** Resposta de `POST /produtos/:id/midias/uploads` (`UploadGaleriaAutorizado`). Sem URL pública: ela só existe após a confirmação. */
export interface UploadGaleriaAutorizado {
  uploadId: string;
  /** URL assinada do `PUT`. Temporária: nunca persistida nem registrada em log. */
  uploadUrl: string;
  method: "PUT";
  /** `Content-Type` e `Cache-Control` — assinados; enviados EXATAMENTE assim. O `Content-Length` assinado é o `size`. */
  headers: Record<string, string>;
  /** Validade da URL, em segundos (600 no backend). */
  expiresIn: number;
}

/** Corpo de `POST /produtos/:id/midias/uploads/:uploadId/confirmacao` (`ConfirmarUploadDto`). */
export interface ConfirmarUploadPayload {
  /** Só imagem. */
  varianteId?: string;
  /** Só imagem: torna a nova imagem a principal. */
  principal?: boolean;
  /** Pode REPETIR o registrado na solicitação; nunca trocá-lo nem introduzi-lo. */
  substituiMidiaId?: string;
}

/** Resposta da confirmação (`ConfirmacaoResposta`): a galeria inteira e a mídia confirmada. */
export interface ConfirmacaoUpload extends GaleriaProduto {
  midia: MidiaProduto;
}

/**
 * Limites da galeria — os MESMOS do backend no commit M1 (`media.constants.ts` e `validacao-midia.constants.ts`).
 * O backend é a autoridade (revalida tudo); aqui servem para recusar cedo, sem gastar a cota de requisições.
 * Imagem: JPEG, PNG e WebP (o backend também aceita GIF, que o Backoffice não oferece — decisão da Fase 22.8.9.8).
 */
const MEBIBYTE = 1024 * 1024;
export const LIMITES_GALERIA = {
  image: {
    maximoPorProduto: 10,
    tamanhoMaximoBytes: 5 * MEBIBYTE,
    rotuloTamanho: "5 MB",
    tipos: { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] },
  },
  video: {
    maximoPorProduto: 1,
    tamanhoMaximoBytes: 15 * MEBIBYTE,
    rotuloTamanho: "15 MB",
    duracaoMaximaSegundos: 30,
    tipos: { "video/mp4": ["mp4"] },
  },
} as const satisfies Record<
  TipoMidia,
  {
    maximoPorProduto: number;
    tamanhoMaximoBytes: number;
    rotuloTamanho: string;
    duracaoMaximaSegundos?: number;
    tipos: Record<string, readonly string[]>;
  }
>;

/** Janela do limite de requisições de upload no backend (30 por 60 s, por ADMIN). Usada quando o `Retry-After` não é legível. */
export const JANELA_LIMITE_UPLOAD_SEGUNDOS = 60;
