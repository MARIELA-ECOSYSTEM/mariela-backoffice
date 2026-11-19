import { registerMock } from "./mock-transport";
import { db, gerarId } from "./db";
import {
  agoraMidiaMock,
  assinarEnvioMock,
  consumirFalha,
  objetoMock,
  type FalhaSimuladaMidia,
} from "./armazenamento-midia.mock";
import { ApiError, type ApiFieldError } from "@/types/api";
import {
  LIMITES_GALERIA,
  type ConfirmarUploadPayload,
  type GaleriaProduto,
  type MidiaProduto,
  type SolicitarUploadGaleriaPayload,
  type TipoMidia,
} from "@/types/media";
import type { Produto } from "@/types/produto";

/**
 * Fase 22.8.9.9.2 (M2) — galeria do produto na Mock API, com as MESMAS regras do backend no commit M1
 * (`galeria.service.ts`): solicitação registra um upload pendente que reserva vaga por 10 min; o PUT vai ao
 * armazenamento simulado (`armazenamento-midia.mock.ts`); a confirmação confere o objeto (existência, tamanho, tipo),
 * é idempotente (o id da mídia é o `uploadId`) e respeita o limite (10 imagens, 1 vídeo). Determinística: ids por
 * sequência, sem rede. A validação de CONTEÚDO real (decodificação) é só do backend.
 */

const EXPIRACAO_URL_S = 600;
const PRAZO_REGISTRO_MS = 24 * 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const BASE_URL_MOCK = "https://midia.mock.invalid";
/** O backend também aceita GIF em imagem; mantido aqui para o mock recusar exatamente o mesmo que o backend. */
const MIME_BACKEND: Record<TipoMidia, Record<string, readonly string[]>> = {
  image: { ...LIMITES_GALERIA.image.tipos, "image/gif": ["gif"] },
  video: { ...LIMITES_GALERIA.video.tipos },
};

type EstadoUpload = "pendente" | "confirmado" | "removido";
interface UploadMock {
  uploadId: string;
  produtoId: string;
  chave: string;
  tipo: TipoMidia;
  contentType: string;
  tamanho: number;
  nomeOriginal: string;
  substituiMidiaId: string | null;
  estado: EstadoUpload;
  urlExpiraEm: number;
  limpezaApos: number;
}
const uploads = new Map<string, UploadMock>();

/** Só testes: esquece os uploads registrados. */
export function reiniciarGaleriaMock(): void {
  uploads.clear();
}

const MSG_MIDIA_NAO_ENCONTRADA = "Mídia não encontrada neste produto.";
const rotulo = (tipo: TipoMidia, n: number) =>
  tipo === "image" ? (n === 1 ? "imagem" : "imagens") : n === 1 ? "vídeo" : "vídeos";
const erroCampo = (field: string, message: string) =>
  ApiError.validation(message, [{ field, message }]);

function produtoOuFalhar(id: string): Produto {
  const produto = db.produtos.find((p) => p.id === id);
  if (!produto) throw ApiError.notFound("Produto não encontrado.");
  produto.midias ??= [];
  produto.midiaPrincipalId ??= null;
  return produto;
}

function galeria(produto: Produto): GaleriaProduto {
  const midias = [...(produto.midias ?? [])].sort((a, b) => a.ordem - b.ordem);
  const imagens = midias.filter((m) => m.tipo === "image");
  const marcada = imagens.find((m) => m.id === produto.midiaPrincipalId);
  return { midias: structuredClone(midias), midiaPrincipalId: (marcada ?? imagens[0])?.id ?? null };
}

function falhaSimulada(etapa: "solicitacao" | "confirmacao"): void {
  const f = consumirFalha(etapa);
  if (f) lancarFalhaSimulada(f);
}

/** Lança o erro HTTP correspondente à falha simulada (mesma forma dos erros do backend). */
function lancarFalhaSimulada(f: FalhaSimuladaMidia): void {
  if (f.endsWith("-403"))
    throw new ApiError({ statusCode: 403, code: "FORBIDDEN", message: "Acesso não permitido." });
  if (f.endsWith("-409"))
    throw ApiError.conflict("Conflito simulado com o estado atual da galeria.");
  if (f.endsWith("-429")) {
    throw new ApiError({
      statusCode: 429,
      code: "TOO_MANY_REQUESTS",
      message:
        "Muitas solicitações de envio de mídia em pouco tempo. Aguarde um instante e tente novamente.",
      retryAfterSegundos: 42,
    });
  }
  if (f === "confirmacao-rede")
    throw new ApiError({
      statusCode: 0,
      code: "NETWORK_ERROR",
      message: "Falha de conexão com o servidor.",
    });
  if (f.endsWith("-503") && f !== "confirmacao-gravar-e-503") {
    throw new ApiError({
      statusCode: 503,
      code: "STORAGE_UNAVAILABLE",
      message: "Armazenamento de mídia indisponível no momento. Tente novamente.",
    });
  }
}

function contarAtivas(produto: Produto, tipo: TipoMidia, ignorar: string | null): number {
  return (produto.midias ?? []).filter((m) => m.tipo === tipo && m.id !== ignorar).length;
}

function garantirLimite(produto: Produto, tipo: TipoMidia, substituida: string | null): void {
  const limite = LIMITES_GALERIA[tipo].maximoPorProduto;
  if (contarAtivas(produto, tipo, substituida) >= limite) {
    throw ApiError.conflict(`Limite de ${limite} ${rotulo(tipo, limite)} por produto atingido.`);
  }
}

export function registerGaleriaMocks(): void {
  registerMock("POST", "/produtos/:id/midias/uploads", ({ params, body }) => {
    falhaSimulada("solicitacao");
    const produto = produtoOuFalhar(params["id"]!);
    const dto = (body ?? {}) as Partial<SolicitarUploadGaleriaPayload>;
    const erros: ApiFieldError[] = [];
    const kind = dto.kind;
    if (kind !== "image" && kind !== "video")
      erros.push({ field: "kind", message: "Tipo de mídia inválido. Use 'image' ou 'video'." });
    if (!dto.fileName?.trim())
      erros.push({ field: "fileName", message: "Nome do arquivo é obrigatório." });
    if (!Number.isInteger(dto.size) || (dto.size ?? 0) < 1)
      erros.push({ field: "size", message: "Tamanho deve ser maior que zero." });
    let extensao = "";
    if (kind === "image" || kind === "video") {
      const extensoes = dto.contentType ? MIME_BACKEND[kind][dto.contentType] : undefined;
      const nome = (dto.fileName ?? "").trim();
      const informada = nome.includes(".")
        ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase()
        : "";
      if (!extensoes)
        erros.push({ field: "contentType", message: "Tipo de arquivo não permitido." });
      else if (!extensoes.includes(informada))
        erros.push({
          field: "fileName",
          message: "A extensão do arquivo não corresponde ao tipo.",
        });
      else extensao = extensoes[0]!;
      if ((dto.size ?? 0) > LIMITES_GALERIA[kind].tamanhoMaximoBytes) {
        erros.push({
          field: "size",
          message: `O arquivo excede ${LIMITES_GALERIA[kind].rotuloTamanho}.`,
        });
      }
    }
    if (erros.length) throw ApiError.validation("Dados inválidos.", erros);
    const tipo = kind as TipoMidia;

    const substituiMidiaId = dto.substituiMidiaId ?? null;
    if (substituiMidiaId) {
      const antiga = produto.midias!.find((m) => m.id === substituiMidiaId);
      if (!antiga) throw ApiError.notFound("Mídia a substituir não encontrada neste produto.");
      if (antiga.tipo !== tipo)
        throw erroCampo("substituiMidiaId", "A mídia substituída precisa ser do mesmo tipo.");
    } else {
      garantirLimite(produto, tipo, null);
      const agora = agoraMidiaMock();
      const reservas = [...uploads.values()].filter(
        (u) =>
          u.produtoId === produto.id &&
          u.tipo === tipo &&
          u.estado === "pendente" &&
          !u.substituiMidiaId &&
          u.urlExpiraEm > agora,
      ).length;
      const limite = LIMITES_GALERIA[tipo].maximoPorProduto;
      if (contarAtivas(produto, tipo, null) + reservas >= limite) {
        throw ApiError.conflict(
          `Limite de ${limite} ${rotulo(tipo, limite)} por produto atingido, contando ${reservas} envio(s) ainda não confirmado(s). ` +
            "Conclua esses envios ou aguarde até 10 minutos para que expirem.",
        );
      }
    }

    const agora = agoraMidiaMock();
    const uploadId = gerarId("upl");
    const chave = `products/${produto.id}/${uploadId}.${extensao}`;
    uploads.set(uploadId, {
      uploadId,
      produtoId: produto.id,
      chave,
      tipo,
      contentType: dto.contentType!,
      tamanho: dto.size!,
      nomeOriginal: dto.fileName!.trim(),
      substituiMidiaId,
      estado: "pendente",
      urlExpiraEm: agora + EXPIRACAO_URL_S * 1000,
      limpezaApos: agora + PRAZO_REGISTRO_MS,
    });
    const headers = { "Content-Type": dto.contentType!, "Cache-Control": CACHE_CONTROL };
    const uploadUrl = assinarEnvioMock(uploadId, {
      chave,
      method: "PUT",
      headers,
      tamanho: dto.size!,
      venceEm: agora + EXPIRACAO_URL_S * 1000,
    });
    return { data: { uploadId, uploadUrl, method: "PUT", headers, expiresIn: EXPIRACAO_URL_S } };
  });

  registerMock("POST", "/produtos/:id/midias/uploads/:uploadId/confirmacao", ({ params, body }) => {
    const registro = uploads.get(params["uploadId"]!);
    if (!registro || registro.produtoId !== params["id"])
      throw ApiError.notFound("Upload não encontrado para este produto.");
    const simulada = consumirFalha("confirmacao");
    if (simulada && simulada !== "confirmacao-gravar-e-503") lancarFalhaSimulada(simulada);
    const dto = (body ?? {}) as ConfirmarUploadPayload;
    const alvo = registro.substituiMidiaId;
    if (dto.substituiMidiaId !== undefined && dto.substituiMidiaId !== alvo) {
      throw ApiError.conflict(
        "O substituiMidiaId informado é diferente do registrado na solicitação deste upload.",
      );
    }
    const produto = produtoOuFalhar(registro.produtoId);
    const jaNaGaleria = produto.midias!.find((m) => m.id === registro.uploadId);
    if (jaNaGaleria) {
      registro.estado = "confirmado";
      return { data: { ...galeria(produto), midia: structuredClone(jaNaGaleria) } };
    }
    if (registro.estado !== "pendente")
      throw ApiError.conflict("Este upload não pode ser confirmado: ele está encerrado.");
    if (agoraMidiaMock() > registro.limpezaApos)
      throw ApiError.conflict("Upload expirado. Solicite um novo upload.");
    if (registro.tipo === "video" && dto.varianteId)
      throw erroCampo("varianteId", "Vídeos não podem ser associados a uma variante.");
    if (registro.tipo === "video" && dto.principal)
      throw erroCampo("principal", "Somente imagens podem ser a imagem principal.");

    const objeto = objetoMock(registro.chave);
    if (!objeto)
      throw erroCampo(
        "uploadId",
        "O arquivo não foi encontrado no armazenamento. Envie o arquivo antes de confirmar.",
      );
    if (objeto.tamanho !== registro.tamanho)
      throw erroCampo(
        "size",
        "O tamanho do arquivo enviado é diferente do declarado na solicitação.",
      );
    if (objeto.contentType !== registro.contentType)
      throw erroCampo(
        "contentType",
        "O tipo do arquivo enviado é diferente do declarado na solicitação.",
      );

    let ordem = produto.midias!.reduce((maior, m) => Math.max(maior, m.ordem + 1), 0);
    let varianteId = dto.varianteId ?? null;
    let principal = dto.principal === true;
    let antiga: MidiaProduto | null = null;
    if (alvo) {
      antiga = produto.midias!.find((m) => m.id === alvo) ?? null;
      if (!antiga)
        throw ApiError.conflict(
          "A mídia a ser substituída não está mais na galeria. Solicite um novo upload.",
        );
      ordem = antiga.ordem;
      if (dto.varianteId === undefined) varianteId = antiga.varianteId;
      if (produto.midiaPrincipalId === antiga.id && registro.tipo === "image") principal = true;
    }
    if (varianteId && !produto.variantes.some((v) => v.id === varianteId)) {
      throw erroCampo("varianteId", "Variante não encontrada neste produto.");
    }
    garantirLimite(produto, registro.tipo, antiga?.id ?? null);
    if (antiga) {
      if (produto.midiaPrincipalId === antiga.id) produto.midiaPrincipalId = null;
      produto.midias = produto.midias!.filter((m) => m.id !== antiga!.id);
      const registroAntigo = uploads.get(antiga.id);
      if (registroAntigo) registroAntigo.estado = "removido";
    }
    const midia: MidiaProduto = {
      id: registro.uploadId,
      tipo: registro.tipo,
      chave: registro.chave,
      url: `${BASE_URL_MOCK}/${registro.chave}`,
      contentType: registro.contentType,
      tamanho: registro.tamanho,
      nomeOriginal: registro.nomeOriginal,
      origem: "upload",
      varianteId,
      ordem,
      criadoEm: new Date(agoraMidiaMock()).toISOString(),
      criadoPor: "usr-mock",
    };
    produto.midias = [...produto.midias!, midia];
    if (principal) produto.midiaPrincipalId = midia.id;
    registro.estado = "confirmado";
    if (simulada === "confirmacao-gravar-e-503") {
      // Gravou, mas a resposta "se perde": o cliente precisa reconciliar.
      throw new ApiError({
        statusCode: 503,
        code: "STORAGE_UNAVAILABLE",
        message: "Armazenamento de mídia indisponível no momento. Tente novamente.",
      });
    }
    return { data: { ...galeria(produto), midia: structuredClone(midia) } };
  });

  registerMock("GET", "/produtos/:id/midias", ({ params }) => ({
    data: galeria(produtoOuFalhar(params["id"]!)),
  }));

  registerMock("PUT", "/produtos/:id/midias/principal", ({ params, body }) => {
    const produto = produtoOuFalhar(params["id"]!);
    const midiaId = (body as { midiaId?: string } | null)?.midiaId ?? "";
    const midia = produto.midias!.find((m) => m.id === midiaId);
    if (!midia) throw ApiError.notFound(MSG_MIDIA_NAO_ENCONTRADA);
    if (midia.tipo !== "image")
      throw erroCampo("midiaId", "Somente imagens podem ser a imagem principal.");
    produto.midiaPrincipalId = midia.id;
    return { data: galeria(produto) };
  });

  registerMock("PUT", "/produtos/:id/midias/ordem", ({ params, body }) => {
    const produto = produtoOuFalhar(params["id"]!);
    const ids = (body as { midiaIds?: unknown } | null)?.midiaIds;
    if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string"))
      throw erroCampo("midiaIds", "Informe a lista de mídias.");
    if (new Set(ids).size !== ids.length)
      throw erroCampo("midiaIds", "A lista de mídias contém ids repetidos.");
    const atuais = new Set(produto.midias!.map((m) => m.id));
    if (ids.length !== atuais.size || ids.some((i) => !atuais.has(i as string))) {
      throw erroCampo("midiaIds", "A lista precisa conter exatamente as mídias atuais da galeria.");
    }
    produto.midias = produto.midias!.map((m) => ({ ...m, ordem: ids.indexOf(m.id) }));
    return { data: galeria(produto) };
  });

  registerMock("PATCH", "/produtos/:id/midias/:midiaId", ({ params, body }) => {
    const produto = produtoOuFalhar(params["id"]!);
    const midia = produto.midias!.find((m) => m.id === params["midiaId"]);
    if (!midia) throw ApiError.notFound(MSG_MIDIA_NAO_ENCONTRADA);
    const varianteId = (body as { varianteId?: string | null } | null)?.varianteId ?? null;
    if (midia.tipo !== "image")
      throw erroCampo("varianteId", "Somente imagens podem ser associadas a uma variante.");
    if (varianteId && !produto.variantes.some((v) => v.id === varianteId))
      throw erroCampo("varianteId", "Variante não encontrada neste produto.");
    midia.varianteId = varianteId;
    return { data: galeria(produto) };
  });

  registerMock("DELETE", "/produtos/:id/midias/:midiaId", ({ params }) => {
    const produto = produtoOuFalhar(params["id"]!);
    const midia = produto.midias!.find((m) => m.id === params["midiaId"]);
    if (!midia) throw ApiError.notFound(MSG_MIDIA_NAO_ENCONTRADA);
    produto.midias = produto.midias!.filter((m) => m.id !== midia.id);
    if (produto.midiaPrincipalId === midia.id) produto.midiaPrincipalId = null;
    const registro = uploads.get(midia.id);
    if (registro) registro.estado = "removido";
    return { data: galeria(produto) };
  });
}
