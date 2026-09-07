/**
 * Contrato de facetas da tela de Campanhas — fonte única de verdade para a UI
 * (labels/opções) e para o mock (filtro + counts). Quando a API NestJS
 * assume a listagem, apenas o mock para de usar os predicados: as chaves e
 * os valores enviados/recebidos continuam os mesmos (mesmo padrão de
 * `produtos-facetas.ts`/.../`colecoes-facetas.ts`).
 */

import type { Campanha } from "@/types/campanha";
import { statusVigencia } from "@/utils/vitrine";
import type { FacetaServidor } from "./facetas-servidor";

export const FACETAS_CAMPANHA = {
  situacao: "situacao",
  destaque: "destaque",
  banner: "banner",
  produtos: "produtos",
} as const;

export const facetasCampanha: FacetaServidor<Campanha>[] = [
  {
    id: FACETAS_CAMPANHA.situacao,
    valores: () => ["ativa", "agendada", "encerrada", "inativa"],
    corresponde: (campanha, valor) => statusVigencia(campanha) === valor,
  },
  {
    id: FACETAS_CAMPANHA.destaque,
    valores: () => ["sim", "nao"],
    corresponde: (campanha, valor) => (valor === "sim" ? campanha.destaque : !campanha.destaque),
  },
  {
    id: FACETAS_CAMPANHA.banner,
    valores: () => ["sim", "nao"],
    corresponde: (campanha, valor) => (valor === "sim" ? campanha.banner : !campanha.banner),
  },
  {
    id: FACETAS_CAMPANHA.produtos,
    valores: () => ["com", "sem"],
    corresponde: (campanha, valor) =>
      valor === "com" ? campanha.produtosVinculados > 0 : campanha.produtosVinculados === 0,
  },
];
