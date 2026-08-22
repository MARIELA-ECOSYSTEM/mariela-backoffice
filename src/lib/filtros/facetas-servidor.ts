/**
 * Camada "servidor" das facetas do MARIELA BACKOFFICE.
 *
 * Este módulo representa o comportamento que a API NestJS terá: dado o
 * conjunto COMPLETO de registros (não a página atual) e a seleção corrente de
 * filtros, devolve `facets` no formato do contrato oficial:
 *
 *   { categorias: [{ valor, count }], estoque: [{ valor, count }], ... }
 *
 * Hoje é usado pelo mock; quando o endpoint real existir, este arquivo deixa de
 * ser chamado e nada muda na UI — os componentes só consomem `ApiFacets`.
 */

import type { ApiFacets, FacetOption, QueryParams } from "@/types/api";
import type { SelecaoFacetas } from "./facetas";

export interface FacetaServidor<T> {
  /** Chave da faceta no contrato (`categorias`, `estoque`, …). */
  id: string;
  /** Valores possíveis da faceta, derivados do conjunto completo. */
  valores: (itens: T[]) => string[];
  /** Predicado de correspondência (equivalente ao match do banco). */
  corresponde: (item: T, valor: string) => boolean;
}

export function valoresUnicos(valores: (string | null | undefined)[]): string[] {
  return Array.from(new Set(valores.filter((valor): valor is string => Boolean(valor)))).sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

/** Lê a seleção enviada na query string (`?categorias=a,b`). */
export function lerSelecaoDaQuery<T>(
  query: QueryParams,
  facetas: FacetaServidor<T>[],
): SelecaoFacetas {
  return Object.fromEntries(
    facetas.map((faceta) => {
      const bruto = query[faceta.id];
      const valores =
        bruto === undefined || bruto === null || bruto === ""
          ? []
          : String(bruto)
              .split(",")
              .map((valor) => valor.trim())
              .filter(Boolean);
      return [faceta.id, valores];
    }),
  );
}

/** Aplica a seleção: OR dentro da faceta, AND entre facetas. */
export function filtrarPorSelecao<T>(
  itens: T[],
  facetas: FacetaServidor<T>[],
  selecao: SelecaoFacetas,
  ignorarId?: string,
): T[] {
  const ativas = facetas.filter(
    (faceta) => faceta.id !== ignorarId && (selecao[faceta.id]?.length ?? 0) > 0,
  );
  if (ativas.length === 0) return itens;
  return itens.filter((item) =>
    ativas.every((faceta) =>
      (selecao[faceta.id] ?? []).some((valor) => faceta.corresponde(item, valor)),
    ),
  );
}

/**
 * Calcula os counts sobre o conjunto completo (nunca sobre a página atual),
 * excluindo a própria faceta do recorte — comportamento clássico de facet.
 */
export function calcularFacetasApi<T>(
  itens: T[],
  facetas: FacetaServidor<T>[],
  selecao: SelecaoFacetas,
): ApiFacets {
  return Object.fromEntries(
    facetas.map((faceta) => {
      const base = filtrarPorSelecao(itens, facetas, selecao, faceta.id);
      const opcoes: FacetOption[] = faceta.valores(itens).map((valor) => ({
        valor,
        count: base.reduce((total, item) => total + (faceta.corresponde(item, valor) ? 1 : 0), 0),
      }));
      return [faceta.id, opcoes];
    }),
  );
}

/** Serializa a seleção para a query string enviada à API. */
export function selecaoParaQuery(selecao: SelecaoFacetas | undefined): QueryParams {
  if (!selecao) return {};
  const params: QueryParams = {};
  for (const [chave, valores] of Object.entries(selecao)) {
    if (valores.length > 0) params[chave] = valores.join(",");
  }
  return params;
}
