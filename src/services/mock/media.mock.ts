import { registerMock } from "./mock-transport";
import { ApiError } from "@/types/api";
import type { ApiFieldError } from "@/types/api";
import { db, gerarId } from "./db";
import type { SolicitarUploadPayload, TipoMidia, UploadPresignado } from "@/types/media";

/**
 * Fase 42.7 — espelha só a validação de `POST /media/presigned-upload`
 * (mesmas regras de `mariela-backend/src/modules/media/media.constants.ts`),
 * para o formulário reagir aos mesmos erros de campo em modo Mock.
 *
 * NÃO simula o `PUT` real ao R2: `mediaApi.enviarArquivo` sempre faz uma
 * requisição de rede de verdade contra `uploadUrl`, e este mock não
 * intercepta `fetch` fora do `apiClient` — só a etapa "pedir a URL
 * pré-assinada" é mockada aqui, como em todo o resto do mock.
 */
const MIME_PERMITIDOS: Record<TipoMidia, Record<string, readonly string[]>> = {
  image: {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
  },
  video: {
    "video/mp4": ["mp4"],
  },
};
const TODOS_OS_MIME = Object.values(MIME_PERMITIDOS).flatMap((porTipo) => Object.keys(porTipo));

const MEGABYTE = 1024 * 1024;
const TAMANHO_MAXIMO_BYTES: Record<TipoMidia, number> = { image: 5 * MEGABYTE, video: 15 * MEGABYTE };
const ROTULO_TAMANHO_MAXIMO: Record<TipoMidia, string> = { image: "5 MB", video: "15 MB" };

export function registerMediaMocks(): void {
  registerMock("POST", "/media/presigned-upload", ({ body }) => {
    const payload = (body ?? {}) as Partial<SolicitarUploadPayload>;
    const erros: ApiFieldError[] = [];

    if (!payload.fileName?.trim()) erros.push({ field: "fileName", message: "Nome do arquivo é obrigatório." });
    if (!payload.contentType?.trim()) erros.push({ field: "contentType", message: "Tipo do arquivo é obrigatório." });
    if (payload.kind !== "image" && payload.kind !== "video")
      erros.push({ field: "kind", message: "Tipo de mídia inválido. Use 'image' ou 'video'." });

    let extensao: string | undefined;
    if (payload.kind === "image" || payload.kind === "video") {
      const extensoesDoMime = payload.contentType ? MIME_PERMITIDOS[payload.kind][payload.contentType] : undefined;
      if (!payload.contentType || !TODOS_OS_MIME.includes(payload.contentType)) {
        erros.push({ field: "contentType", message: `Tipo de arquivo não permitido. Use: ${TODOS_OS_MIME.join(", ")}.` });
      } else if (!extensoesDoMime) {
        erros.push({ field: "kind", message: `O tipo de arquivo "${payload.contentType}" não corresponde a "${payload.kind}".` });
      } else {
        const nome = (payload.fileName ?? "").trim();
        const extensaoInformada = nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase() : "";
        if (!extensoesDoMime.includes(extensaoInformada)) {
          erros.push({
            field: "fileName",
            message: `A extensão do arquivo não corresponde a "${payload.contentType}" (esperado: .${extensoesDoMime.join(", .")}).`,
          });
        } else {
          extensao = extensoesDoMime[0];
        }
      }

      const limite = TAMANHO_MAXIMO_BYTES[payload.kind];
      if (typeof payload.size !== "number" || payload.size <= 0) {
        erros.push({ field: "size", message: "Tamanho deve ser maior que zero." });
      } else if (payload.size > limite) {
        erros.push({
          field: "size",
          message: `Arquivo excede o limite de ${ROTULO_TAMANHO_MAXIMO[payload.kind]} para ${payload.kind === "image" ? "imagens" : "vídeos"}.`,
        });
      }
    }

    if (!payload.produtoId) erros.push({ field: "produtoId", message: "Id de produto inválido." });
    else if (!db.produtos.some((produto) => produto.id === payload.produtoId))
      throw ApiError.notFound("Produto não encontrado.");

    if (erros.length > 0) throw ApiError.validation("Dados inválidos.", erros);

    const key = `products/${payload.produtoId}/${gerarId("mock-media")}.${extensao}`;
    const resposta: UploadPresignado = {
      uploadUrl: `https://mock-upload.mariela.local/${key}`,
      method: "PUT",
      headers: { "Content-Type": payload.contentType! },
      publicUrl: `https://media.mariela.app/${key}`,
      key,
      expiresIn: 600,
    };
    return { data: resposta };
  });
}
