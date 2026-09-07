/**
 * Contrato de facetas da tela de Coleções — fonte única de verdade para a UI
 * (labels/opções) e para o mock (filtro + counts). Quando a API NestJS
 * assume a listagem, apenas o mock para de usar os predicados: as chaves e
 * os valores enviados/recebidos continuam os mesmos (mesmo padrão de
 * `produtos-facetas.ts`/`clientes-facetas.ts`/`fornecedores-facetas.ts`).
 */

import type { Colecao } from "@/types/colecao";
import { statusVigencia } from "@/utils/vitrine";
import type { FacetaServidor } from "./facetas-servidor";

export const FACETAS_COLECAO = {
  situacao: "situacao",
  destaque: "destaque",
  banner: "banner",
  produtos: "produtos",
} as const;

export const facetasColecao: FacetaServidor<Colecao>[] = [
  {
    id: FACETAS_COLECAO.situacao,
    valores: () => ["ativa", "agendada", "encerrada", "inativa"],
    corresponde: (colecao, valor) => statusVigencia(colecao) === valor,
  },
  {
    id: FACETAS_COLECAO.destaque,
    valores: () => ["sim", "nao"],
    corresponde: (colecao, valor) => (valor === "sim" ? colecao.destaque : !colecao.destaque),
  },
  {
    id: FACETAS_COLECAO.banner,
    valores: () => ["sim", "nao"],
    corresponde: (colecao, valor) => (valor === "sim" ? colecao.banner : !colecao.banner),
  },
  {
    id: FACETAS_COLECAO.produtos,
    valores: () => ["com", "sem"],
    corresponde: (colecao, valor) =>
      valor === "com" ? colecao.produtosVinculados > 0 : colecao.produtosVinculados === 0,
  },
];
