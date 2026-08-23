import type { Cliente } from "@/types/cliente";

/**
 * Regras de apresentação/relacionamento de clientes.
 * Ficam fora dos componentes para permitir que o NestJS assuma o cálculo
 * (recência, aniversariantes) sem alterar a UI.
 */

export type JanelaSemCompra = "1m" | "3m" | "6m";

export const OPCOES_SEM_COMPRA: { valor: JanelaSemCompra; label: string; meses: number }[] = [
  { valor: "1m", label: "Mais de 1 mês sem comprar", meses: 1 },
  { valor: "3m", label: "Mais de 3 meses sem comprar", meses: 3 },
  { valor: "6m", label: "Mais de 6 meses sem comprar", meses: 6 },
];

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** Data-limite da janela: clientes com última compra anterior a ela entram no filtro. */
export function limiteSemCompra(meses: number, hoje = new Date()): Date {
  const limite = inicioDoDia(hoje);
  limite.setMonth(limite.getMonth() - meses);
  return limite;
}

/** Quem nunca comprou também é considerado "sem compra recente". */
export function semCompraDesde(cliente: Cliente, meses: number, hoje = new Date()): boolean {
  if (!cliente.ultimaCompra) return true;
  return new Date(cliente.ultimaCompra).getTime() < limiteSemCompra(meses, hoje).getTime();
}

export function janelaSemCompra(valor: string): number {
  return OPCOES_SEM_COMPRA.find((opcao) => opcao.valor === valor)?.meses ?? 0;
}

/** Texto da última compra: "Nunca comprou" quando não há histórico. */
export function rotuloUltimaCompra(iso: string | null): string {
  if (!iso) return "Nunca comprou";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Idade em anos completos, quando a data de nascimento está disponível. */
export function idade(dataNascimento: string | null, hoje = new Date()): number | null {
  if (!dataNascimento) return null;
  const nascimento = new Date(`${dataNascimento.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(nascimento.getTime())) return null;
  let anos = hoje.getFullYear() - nascimento.getFullYear();
  const mesDiff = hoje.getMonth() - nascimento.getMonth();
  if (mesDiff < 0 || (mesDiff === 0 && hoje.getDate() < nascimento.getDate())) anos -= 1;
  return anos >= 0 && anos < 130 ? anos : null;
}

/** Data de nascimento formatada como dia/mês. */
export function diaMesNascimento(dataNascimento: string | null): string {
  if (!dataNascimento) return "—";
  const [, mes, dia] = dataNascimento.slice(0, 10).split("-");
  return mes && dia ? `${dia}/${mes}` : "—";
}

export type PeriodoAniversario = "hoje" | "amanha" | "semana" | "mes";

export const PERIODOS_ANIVERSARIO: { valor: PeriodoAniversario; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "amanha", label: "Amanhã" },
  { valor: "semana", label: "Esta semana" },
  { valor: "mes", label: "Este mês" },
];

/** Aniversário cai no período informado (semana = próximos 7 dias, mês = mês corrente). */
export function aniversarioNoPeriodo(
  dataNascimento: string | null,
  periodo: PeriodoAniversario,
  hoje = new Date(),
): boolean {
  if (!dataNascimento) return false;
  const partes = dataNascimento.slice(0, 10).split("-");
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (!mes || !dia) return false;

  const base = inicioDoDia(hoje);
  if (periodo === "mes") return mes === base.getMonth() + 1;

  const dias = periodo === "hoje" ? 0 : periodo === "amanha" ? 1 : 7;
  for (let offset = 0; offset <= dias; offset += 1) {
    const alvo = new Date(base);
    alvo.setDate(base.getDate() + offset);
    if (periodo === "amanha" && offset !== 1) continue;
    if (alvo.getMonth() + 1 === mes && alvo.getDate() === dia) return true;
  }
  return false;
}

/** Dias até o próximo aniversário (0 = hoje) — usado para ordenar a lista. */
export function diasAteAniversario(dataNascimento: string | null, hoje = new Date()): number {
  if (!dataNascimento) return Number.MAX_SAFE_INTEGER;
  const partes = dataNascimento.slice(0, 10).split("-");
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (!mes || !dia) return Number.MAX_SAFE_INTEGER;
  const base = inicioDoDia(hoje);
  const proximo = new Date(base.getFullYear(), mes - 1, dia);
  if (proximo.getTime() < base.getTime()) proximo.setFullYear(base.getFullYear() + 1);
  return Math.round((proximo.getTime() - base.getTime()) / 86_400_000);
}

/** Número usado como referência visual do WhatsApp. */
export function numeroWhatsapp(cliente: Pick<Cliente, "whatsapp" | "telefone">): string {
  return cliente.whatsapp.trim() || cliente.telefone.trim();
}

export type OrdenacaoCliente =
  | "nome-asc"
  | "nome-desc"
  | "compras-desc"
  | "compras-asc"
  | "valor-desc"
  | "valor-asc"
  | "compra-recente"
  | "compra-antiga"
  | "sem-compra";

export const OPCOES_ORDENACAO: { valor: OrdenacaoCliente; label: string }[] = [
  { valor: "nome-asc", label: "Nome: A → Z" },
  { valor: "nome-desc", label: "Nome: Z → A" },
  { valor: "compras-desc", label: "Mais compras" },
  { valor: "compras-asc", label: "Menos compras" },
  { valor: "valor-desc", label: "Maior valor comprado" },
  { valor: "valor-asc", label: "Menor valor comprado" },
  { valor: "compra-recente", label: "Compra mais recente" },
  { valor: "compra-antiga", label: "Compra mais antiga" },
  { valor: "sem-compra", label: "Clientes sem compra recente" },
];

function tempoUltimaCompra(cliente: Cliente): number {
  return cliente.ultimaCompra ? new Date(cliente.ultimaCompra).getTime() : 0;
}

export function ordenarClientes(lista: Cliente[], ordem: OrdenacaoCliente): Cliente[] {
  const copia = [...lista];
  const porNome = (a: Cliente, b: Cliente) => a.nome.localeCompare(b.nome, "pt-BR");
  switch (ordem) {
    case "nome-asc":
      return copia.sort(porNome);
    case "nome-desc":
      return copia.sort((a, b) => porNome(b, a));
    case "compras-desc":
      return copia.sort((a, b) => b.compras - a.compras || porNome(a, b));
    case "compras-asc":
      return copia.sort((a, b) => a.compras - b.compras || porNome(a, b));
    case "valor-desc":
      return copia.sort((a, b) => b.totalComprado - a.totalComprado || porNome(a, b));
    case "valor-asc":
      return copia.sort((a, b) => a.totalComprado - b.totalComprado || porNome(a, b));
    case "compra-recente":
      return copia.sort((a, b) => tempoUltimaCompra(b) - tempoUltimaCompra(a) || porNome(a, b));
    case "compra-antiga":
      // Nunca comprou vem primeiro (sem histórico = maior necessidade de contato).
      return copia.sort((a, b) => tempoUltimaCompra(a) - tempoUltimaCompra(b) || porNome(a, b));
    case "sem-compra":
    default:
      return copia.sort((a, b) => tempoUltimaCompra(a) - tempoUltimaCompra(b) || porNome(a, b));
  }
}
