import { apiClient } from "./client";
import type { SolicitarUploadPayload, UploadPresignado } from "@/types/media";

/**
 * Fase 42.7 — cliente do fluxo de upload presignado.
 *
 * `solicitarUpload` passa pelo `apiClient` normal (mock/real, token, refresh,
 * 401 etc. — igual a qualquer outro endpoint). `enviarArquivo`, ao contrário,
 * NUNCA deve passar pelo `apiClient`: é um `PUT` direto ao Cloudflare R2, sem
 * `Authorization` do Backoffice e sem envelope `{data}` — só os headers que o
 * backend devolveu (fazem parte da assinatura; qualquer header a mais/a menos
 * invalida o upload).
 */
export const mediaApi = {
  async solicitarUpload(payload: SolicitarUploadPayload): Promise<UploadPresignado> {
    const { data } = await apiClient.post<UploadPresignado>("/media/presigned-upload", payload);
    return data;
  },

  async enviarArquivo(presigned: UploadPresignado, arquivo: File): Promise<void> {
    const resposta = await fetch(presigned.uploadUrl, {
      method: presigned.method,
      headers: presigned.headers,
      body: arquivo,
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao enviar o arquivo para o armazenamento (HTTP ${resposta.status}).`);
    }
  },
};
