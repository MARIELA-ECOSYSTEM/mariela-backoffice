import type { MidiaProduto } from "@/types/media";
import type { Produto } from "@/types/produto";
import { fotosDoProduto } from "./produto";

/**
 * Fase 22.8.9.9.2 (M2) — o que exibir como galeria de um produto, com a MESMA regra do backend
 * (`mariela-backend/src/modules/produtos/utils/midias.util.ts`, usada pelo PDV): se a galeria (`midias`) tem
 * imagens, ela manda (principal = a marcada, senão a primeira imagem pela ordem); senão valem os campos LEGADOS
 * (`variante.foto` + `fotoPrincipalVarianteId`, via `fotosDoProduto`), intactos. Vídeo: o da galeria, senão o primeiro
 * `variante.video` legado. Nada aqui altera dados.
 */
export interface ImagemEfetiva {
  /** `id` da mídia da galeria, ou `legado:<varianteId>`. */
  id: string;
  url: string;
  principal: boolean;
  origem: "galeria" | "legado";
  varianteId: string | null;
}

export interface GaleriaEfetiva {
  fonte: "galeria" | "legado" | "vazia";
  /** Principal primeiro; depois a ordem da galeria (ou a ordem legada). */
  imagens: ImagemEfetiva[];
  video: { url: string; origem: "galeria" | "legado"; id: string } | null;
}

const porOrdem = (a: MidiaProduto, b: MidiaProduto) => a.ordem - b.ordem;

export function galeriaEfetiva(produto: Produto): GaleriaEfetiva {
  const midias = [...(produto.midias ?? [])].sort(porOrdem);
  const imagensGaleria = midias.filter((m) => m.tipo === "image");
  const videoGaleria = midias.find((m) => m.tipo === "video") ?? null;
  const videoLegado = produto.variantes.find((v) => Boolean(v.video)) ?? null;
  const video = videoGaleria
    ? { url: videoGaleria.url, origem: "galeria" as const, id: videoGaleria.id }
    : videoLegado
      ? {
          url: videoLegado.video as string,
          origem: "legado" as const,
          id: `legado:${videoLegado.id}`,
        }
      : null;

  if (imagensGaleria.length > 0) {
    const principalId =
      imagensGaleria.find((m) => m.id === produto.midiaPrincipalId)?.id ?? imagensGaleria[0]!.id;
    const imagens = imagensGaleria.map((m) => ({
      id: m.id,
      url: m.url,
      principal: m.id === principalId,
      origem: "galeria" as const,
      varianteId: m.varianteId,
    }));
    imagens.sort((a, b) => Number(b.principal) - Number(a.principal));
    return { fonte: "galeria", imagens, video };
  }

  const legadas = fotosDoProduto(produto).map((f) => ({
    id: `legado:${f.varianteId}`,
    url: f.url,
    principal: f.principal,
    origem: "legado" as const,
    varianteId: f.varianteId,
  }));
  const fonte = legadas.length > 0 ? "legado" : (video?.origem ?? "vazia");
  return { fonte, imagens: legadas, video };
}
