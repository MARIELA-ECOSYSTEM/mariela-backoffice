/**
 * Fase 42.7 — upload de mídia do catálogo (imagem/vídeo) direto ao Cloudflare
 * R2, via URL pré-assinada emitida pelo backend (`POST /media/presigned-upload`).
 * O Backoffice nunca possui credenciais R2 — só pede a URL, faz o PUT direto
 * ao bucket, e salva `publicUrl` em `foto`/`video` pelos endpoints de
 * variante já existentes (contrato dessas rotas permanece inalterado).
 *
 * Espelha exatamente `mariela-backend/src/modules/media/dto/solicitar-upload.dto.ts`
 * e `media.types.ts` (`SolicitarUploadDto`/`UploadPresignado`).
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
