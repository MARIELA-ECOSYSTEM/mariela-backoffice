import { apiClient } from "./client";
import type {
  ConfirmacaoUpload,
  ConfirmarUploadPayload,
  GaleriaProduto,
  SolicitarUploadGaleriaPayload,
  UploadGaleriaAutorizado,
} from "@/types/media";

/**
 * Fase 22.8.9.9.2 (M2) — cliente HTTP da galeria do produto (`mariela-backend`, `galeria.controller.ts`, commit M1).
 * Todas as rotas exigem sessão ADMIN (o `apiClient` envia o token; 401/403 seguem o tratamento normal).
 *
 * Só JSON: o arquivo NUNCA passa por aqui. O binário vai direto ao R2, pela URL assinada, em
 * `services/midia/envio-midia.ts`. Recusas chegam como `ApiError` do `apiClient` (classificadas por
 * `classificarErroMidia`).
 */
const base = (produtoId: string) => `/produtos/${encodeURIComponent(produtoId)}/midias`;

export const galeriaApi = {
  /** `POST /produtos/:id/midias/uploads` — limitada a 30/60 s por ADMIN (429 com `Retry-After`). */
  async solicitarUpload(
    produtoId: string,
    payload: SolicitarUploadGaleriaPayload,
  ): Promise<UploadGaleriaAutorizado> {
    const { data } = await apiClient.post<UploadGaleriaAutorizado>(
      `${base(produtoId)}/uploads`,
      payload,
    );
    return data;
  },

  /**
   * `POST /produtos/:id/midias/uploads/:uploadId/confirmacao` — idempotente: repetir com o mesmo `uploadId` nunca
   * duplica a mídia (é assim que uma confirmação de resultado incerto é concluída). Limitada a 30/60 s por ADMIN.
   */
  async confirmarUpload(
    produtoId: string,
    uploadId: string,
    payload: ConfirmarUploadPayload = {},
  ): Promise<ConfirmacaoUpload> {
    const { data } = await apiClient.post<ConfirmacaoUpload>(
      `${base(produtoId)}/uploads/${encodeURIComponent(uploadId)}/confirmacao`,
      payload,
    );
    return data;
  },

  async listar(produtoId: string): Promise<GaleriaProduto> {
    const { data } = await apiClient.get<GaleriaProduto>(base(produtoId));
    return data;
  },

  async definirPrincipal(produtoId: string, midiaId: string): Promise<GaleriaProduto> {
    const { data } = await apiClient.put<GaleriaProduto>(`${base(produtoId)}/principal`, {
      midiaId,
    });
    return data;
  },

  /** `midiaIds` precisa ser EXATAMENTE o conjunto atual da galeria, na nova ordem. */
  async reordenar(produtoId: string, midiaIds: string[]): Promise<GaleriaProduto> {
    const { data } = await apiClient.put<GaleriaProduto>(`${base(produtoId)}/ordem`, { midiaIds });
    return data;
  },

  /** Associa uma IMAGEM a uma variante (ou desassocia com `null`). */
  async associarVariante(
    produtoId: string,
    midiaId: string,
    varianteId: string | null,
  ): Promise<GaleriaProduto> {
    const { data } = await apiClient.patch<GaleriaProduto>(
      `${base(produtoId)}/${encodeURIComponent(midiaId)}`,
      { varianteId },
    );
    return data;
  },

  /** Tira a mídia da galeria (o arquivo no storage não é apagado pelo backend). */
  async remover(produtoId: string, midiaId: string): Promise<GaleriaProduto> {
    const { data } = await apiClient.delete<GaleriaProduto>(
      `${base(produtoId)}/${encodeURIComponent(midiaId)}`,
    );
    return data;
  },
};
