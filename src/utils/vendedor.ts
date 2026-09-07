import type { OrdenarVendedorPor, Ordem, Vendedor } from "@/types/vendedor";

/** Regras de apresentação/ordenação de vendedores (fora dos componentes). */

export type FaixaVendas = "sem" | "1-5" | "6-20" | "21+";

export const OPCOES_FAIXA_VENDAS: { valor: FaixaVendas; label: string }[] = [
  { valor: "sem", label: "Sem vendas" },
  { valor: "1-5", label: "1 a 5 vendas" },
  { valor: "6-20", label: "6 a 20 vendas" },
  { valor: "21+", label: "21 ou mais" },
];

export function naFaixaDeVendas(quantidade: number, faixa: string): boolean {
  switch (faixa) {
    case "sem":
      return quantidade === 0;
    case "1-5":
      return quantidade >= 1 && quantidade <= 5;
    case "6-20":
      return quantidade >= 6 && quantidade <= 20;
    case "21+":
      return quantidade >= 21;
    default:
      return true;
  }
}

export type FaixaValor = "ate-500" | "500-2000" | "2000-10000" | "10000+";

export const OPCOES_FAIXA_VALOR: { valor: FaixaValor; label: string }[] = [
  { valor: "ate-500", label: "Até R$ 500" },
  { valor: "500-2000", label: "R$ 500 a R$ 2.000" },
  { valor: "2000-10000", label: "R$ 2.000 a R$ 10.000" },
  { valor: "10000+", label: "Acima de R$ 10.000" },
];

export function naFaixaDeValor(total: number, faixa: string): boolean {
  switch (faixa) {
    case "ate-500":
      return total <= 500;
    case "500-2000":
      return total > 500 && total <= 2000;
    case "2000-10000":
      return total > 2000 && total <= 10_000;
    case "10000+":
      return total > 10_000;
    default:
      return true;
  }
}

export type PeriodoUltimaVenda = "7" | "30" | "90" | "nunca";

export const OPCOES_ULTIMA_VENDA: { valor: PeriodoUltimaVenda; label: string }[] = [
  { valor: "7", label: "Últimos 7 dias" },
  { valor: "30", label: "Últimos 30 dias" },
  { valor: "90", label: "Últimos 90 dias" },
  { valor: "nunca", label: "Nunca vendeu" },
];

export function ultimaVendaNoPeriodo(vendedor: Vendedor, periodo: string): boolean {
  if (periodo === "nunca") return !vendedor.ultimaVenda;
  if (!vendedor.ultimaVenda) return false;
  const dias = Number(periodo);
  if (!Number.isFinite(dias)) return true;
  return new Date(vendedor.ultimaVenda).getTime() >= Date.now() - dias * 86_400_000;
}

/** Aniversário do vendedor no mês corrente. */
export function nascimentoNoMes(dataNascimento: string | null, hoje = new Date()): boolean {
  if (!dataNascimento) return false;
  const mes = Number(dataNascimento.slice(5, 7));
  return mes === hoje.getMonth() + 1;
}

export type OrdenacaoVendedor =
  "nome-asc" | "nome-desc" | "vendas-desc" | "valor-desc" | "venda-recente" | "nascimento";

export const OPCOES_ORDENACAO_VENDEDOR: { valor: OrdenacaoVendedor; label: string }[] = [
  { valor: "nome-asc", label: "Nome: A → Z" },
  { valor: "nome-desc", label: "Nome: Z → A" },
  { valor: "vendas-desc", label: "Mais vendas" },
  { valor: "valor-desc", label: "Maior valor vendido" },
  { valor: "venda-recente", label: "Última venda" },
  { valor: "nascimento", label: "Data de nascimento" },
];

/**
 * Converte a opção combinada do seletor (`OPCOES_ORDENACAO_VENDEDOR`) em
 * `ordenarPor`/`ordem` — o par que a API (`ListarVendedoresQueryDto`)
 * realmente espera. A ordenação passou a acontecer no servidor; este mapa
 * existe só para preservar o rótulo único já exposto na tela.
 */
export function paraOrdenarPorEOrdem(valor: OrdenacaoVendedor): {
  ordenarPor: OrdenarVendedorPor;
  ordem: Ordem;
} {
  switch (valor) {
    case "nome-desc":
      return { ordenarPor: "nome", ordem: "desc" };
    case "vendas-desc":
      return { ordenarPor: "vendas", ordem: "desc" };
    case "valor-desc":
      return { ordenarPor: "totalVendido", ordem: "desc" };
    case "venda-recente":
      return { ordenarPor: "ultimaVenda", ordem: "desc" };
    case "nascimento":
      return { ordenarPor: "dataNascimento", ordem: "asc" };
    case "nome-asc":
    default:
      return { ordenarPor: "nome", ordem: "asc" };
  }
}

function tempo(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

/** @deprecated A ordenação agora é feita pelo backend (ver `paraOrdenarPorEOrdem`); mantida para compatibilidade de testes/consumidores que ainda ordenam localmente. */
export function ordenarVendedores(lista: Vendedor[], ordem: OrdenacaoVendedor): Vendedor[] {
  const copia = [...lista];
  const porNome = (a: Vendedor, b: Vendedor) => a.nome.localeCompare(b.nome, "pt-BR");
  switch (ordem) {
    case "nome-desc":
      return copia.sort((a, b) => porNome(b, a));
    case "vendas-desc":
      return copia.sort((a, b) => b.vendas - a.vendas || porNome(a, b));
    case "valor-desc":
      return copia.sort((a, b) => b.totalVendido - a.totalVendido || porNome(a, b));
    case "venda-recente":
      return copia.sort((a, b) => tempo(b.ultimaVenda) - tempo(a.ultimaVenda) || porNome(a, b));
    case "nascimento":
      return copia.sort((a, b) => {
        const chave = (vendedor: Vendedor) => vendedor.dataNascimento?.slice(5, 10) ?? "99-99";
        return chave(a).localeCompare(chave(b)) || porNome(a, b);
      });
    case "nome-asc":
    default:
      return copia.sort(porNome);
  }
}
