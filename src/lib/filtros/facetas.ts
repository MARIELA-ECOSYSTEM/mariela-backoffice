/**
 * Padrão oficial de filtros facetados do MARIELA BACKOFFICE.
 *
 * Regras:
 * - Todo filtro de seleção múltipla exibe a contagem de registros da opção.
 * - A contagem é sempre derivada dos dados (nunca fixa) e considera os demais
 *   filtros aplicados (comportamento clássico de faceta: exclui o próprio grupo).
 * - As contagens podem vir de `facets` da API no futuro sem alterar a UI:
 *   basta passar `facetasExternas` para o hook/utilitários.
 */

export interface OpcaoFaceta {
  valor: string;
  label: string;
}

export interface OpcaoFacetaContada extends OpcaoFaceta {
  count: number;
  selecionada: boolean;
  /** Opção sem registros no contexto atual e não selecionada. */
  desabilitada: boolean;
}

export interface GrupoFacetaDef<T> {
  id: string;
  label: string;
  opcoes: OpcaoFaceta[];
  /** Predicado local usado para filtrar e contar enquanto a API não envia facets. */
  corresponde: (item: T, valor: string) => boolean;
  /** Habilita a busca interna do grupo (padrão: automático acima de 8 opções). */
  buscavel?: boolean;
  /** Quantidade de opções visíveis antes de "Ver mais" (padrão 6). */
  limiteVisivel?: number;
  placeholderBusca?: string;
}

export interface GrupoFacetaRenderizavel extends Omit<GrupoFacetaDef<never>, "corresponde"> {
  opcoes: OpcaoFacetaContada[];
  totalSelecionado: number;
}

export type SelecaoFacetas = Record<string, string[]>;

/** Counts vindos da API (futuro contrato `facets`). */
export type FacetasExternas = Record<string, { valor: string; count: number }[]>;

export function selecaoVazia<T>(grupos: GrupoFacetaDef<T>[]): SelecaoFacetas {
  return Object.fromEntries(grupos.map((grupo) => [grupo.id, [] as string[]]));
}

export function temSelecaoAtiva(selecao: SelecaoFacetas): boolean {
  return Object.values(selecao).some((valores) => valores.length > 0);
}

export function contarSelecionados(selecao: SelecaoFacetas): number {
  return Object.values(selecao).reduce((total, valores) => total + valores.length, 0);
}

function grupoCasa<T>(grupo: GrupoFacetaDef<T>, item: T, valores: string[]): boolean {
  if (valores.length === 0) return true;
  return valores.some((valor) => grupo.corresponde(item, valor));
}

/** Aplica a seleção: OR dentro do grupo, AND entre grupos. */
export function aplicarFacetas<T>(
  itens: T[],
  grupos: GrupoFacetaDef<T>[],
  selecao: SelecaoFacetas,
  ignorarGrupoId?: string,
): T[] {
  const ativos = grupos.filter(
    (grupo) => grupo.id !== ignorarGrupoId && (selecao[grupo.id]?.length ?? 0) > 0,
  );
  if (ativos.length === 0) return itens;
  return itens.filter((item) =>
    ativos.every((grupo) => grupoCasa(grupo, item, selecao[grupo.id] ?? [])),
  );
}

/** Calcula as contagens de cada opção considerando os outros filtros ativos. */
export function calcularFacetas<T>(
  itens: T[],
  grupos: GrupoFacetaDef<T>[],
  selecao: SelecaoFacetas,
  facetasExternas?: FacetasExternas,
): GrupoFacetaRenderizavel[] {
  return grupos.map((grupo) => {
    const selecionados = selecao[grupo.id] ?? [];
    const externas = facetasExternas?.[grupo.id];
    const base = externas ? [] : aplicarFacetas(itens, grupos, selecao, grupo.id);

    const opcoes: OpcaoFacetaContada[] = grupo.opcoes.map((opcao) => {
      const count = externas
        ? (externas.find((item) => item.valor === opcao.valor)?.count ?? 0)
        : base.reduce((total, item) => total + (grupo.corresponde(item, opcao.valor) ? 1 : 0), 0);
      const selecionada = selecionados.includes(opcao.valor);
      return { ...opcao, count, selecionada, desabilitada: count === 0 && !selecionada };
    });

    return {
      id: grupo.id,
      label: grupo.label,
      opcoes,
      totalSelecionado: selecionados.length,
      ...(grupo.buscavel === undefined ? {} : { buscavel: grupo.buscavel }),
      ...(grupo.limiteVisivel === undefined ? {} : { limiteVisivel: grupo.limiteVisivel }),
      ...(grupo.placeholderBusca === undefined ? {} : { placeholderBusca: grupo.placeholderBusca }),
    };
  });
}

export function alternarValor(
  selecao: SelecaoFacetas,
  grupoId: string,
  valor: string,
): SelecaoFacetas {
  const atuais = selecao[grupoId] ?? [];
  const proximos = atuais.includes(valor)
    ? atuais.filter((item) => item !== valor)
    : [...atuais, valor];
  return { ...selecao, [grupoId]: proximos };
}

/** Constrói opções a partir de uma lista de entidades com id/nome. */
export function opcoesDe<T extends { id: string; nome: string }>(
  lista: T[] | undefined,
): OpcaoFaceta[] {
  return (lista ?? []).map((item) => ({ valor: item.id, label: item.nome }));
}

/** Constrói opções a partir de valores simples (categorias, tamanhos…). */
export function opcoesDeValores(valores: string[] | undefined): OpcaoFaceta[] {
  return (valores ?? []).map((valor) => ({ valor, label: valor }));
}

export const OPCOES_STATUS: OpcaoFaceta[] = [
  { valor: "ativos", label: "Ativos" },
  { valor: "inativos", label: "Inativos" },
];
