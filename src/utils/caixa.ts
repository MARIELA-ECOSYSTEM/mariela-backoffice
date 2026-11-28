import type { Caixa, CaixaStatus, ResumoCaixa, ResumoFormaPagamentoCaixa } from "@/types/caixa";

/** Badge do status do caixa — roxo (aberto) é a identidade da marca. */
export const VARIANTE_STATUS_CAIXA: Record<CaixaStatus, "default" | "outline"> = {
  aberto: "default",
  fechado: "outline",
};

export type SituacaoDiferenca = "conferido" | "sobra" | "falta";

export function situacaoDiferenca(diferenca: number): SituacaoDiferenca {
  if (Math.abs(diferenca) < 0.005) return "conferido";
  return diferenca > 0 ? "sobra" : "falta";
}

export const LABEL_DIFERENCA: Record<SituacaoDiferenca, string> = {
  conferido: "Caixa conferido",
  sobra: "Sobra de caixa",
  falta: "Falta de caixa",
};

export interface ConferenciaFechamento {
  /**
   * `true` quando o servidor informa o dinheiro físico (`dinheiroEsperado`, Fase 22.8.9.12). `false` num servidor
   * anterior, que ainda confere o saldo de TODAS as formas — a tela então mostra esse saldo com o rótulo antigo, para
   * a prévia continuar igual ao que o servidor vai gravar.
   */
  regraDinheiroFisico: boolean;
  /** Valor contra o qual o contado é conferido — o mesmo que o servidor usa no fechamento. */
  esperado: number;
  informado: number;
  informadoInvalido: boolean;
  /** `informado − esperado` (0 enquanto o valor digitado for inválido). */
  diferenca: number;
  situacao: SituacaoDiferenca;
  exigeObservacao: boolean;
  /** Formas que NÃO movimentam a gaveta (PIX, cartões, outras): só informativas. */
  outrasFormas: ResumoFormaPagamentoCaixa[];
}

/**
 * Fase 22.8.9.12 — conferência do fechamento: o dinheiro CONTADO na gaveta contra o dinheiro físico esperado. PIX e
 * cartões nunca entram na diferença; aparecem à parte, em `outrasFormas`. Mesmo cálculo do backend (`fechar`), que é a
 * autoridade: aqui é só a prévia.
 */
export function conferenciaDoFechamento(resumo: ResumoCaixa, valorDigitado: string): ConferenciaFechamento {
  const regraDinheiroFisico = typeof resumo.dinheiroEsperado === "number";
  const esperado = regraDinheiroFisico ? resumo.dinheiroEsperado! : resumo.saldoEsperado;
  const informado = Number(valorDigitado.replace(",", "."));
  // Etapa 18.6 — sem piso zero: o Caixa pode fechar negativo, então só se exige um número válido.
  const informadoInvalido = valorDigitado.trim() === "" || !Number.isFinite(informado);
  const diferenca = informadoInvalido ? 0 : Number((informado - esperado).toFixed(2));
  const situacao = situacaoDiferenca(diferenca);
  return {
    regraDinheiroFisico,
    esperado,
    informado,
    informadoInvalido,
    diferenca,
    situacao,
    exigeObservacao: !informadoInvalido && situacao !== "conferido",
    outrasFormas: (resumo.porFormaPagamento ?? []).filter((item) => !item.dinheiroFisico),
  };
}

/**
 * Fase 2 (P2-02) — o que a tela mostra como valor da GAVETA: o dinheiro físico esperado (`dinheiroEsperado`) quando o
 * servidor o informa; num servidor anterior, o saldo de todas as formas com o rótulo antigo ("Saldo esperado").
 */
export function gavetaDoResumo(resumo: ResumoCaixa): { valor: number; rotulo: string } {
  return typeof resumo.dinheiroEsperado === "number"
    ? { valor: resumo.dinheiroEsperado, rotulo: "Dinheiro esperado na gaveta" }
    : { valor: resumo.saldoEsperado, rotulo: "Saldo esperado" };
}

/** Mesma comparação do backend (`normalizarFormaPagamento`): sem acento, sem diferença de maiúsculas e espaços. */
function normalizarForma(forma: string): string {
  return forma.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Forma padrão das movimentações manuais da gaveta: "Dinheiro" (como cadastrada); sem ela, a primeira da lista. */
export function formaPadraoDaGaveta(formas: readonly string[]): string {
  return formas.find((forma) => normalizarForma(forma) === "dinheiro") ?? formas[0] ?? "Dinheiro";
}

export type OrdenacaoCaixa =
  | "data-desc"
  | "data-asc"
  | "faturamento-desc"
  | "faturamento-asc"
  | "saldo-desc"
  | "diferenca-desc"
  | "vendas-desc";

export const OPCOES_ORDENACAO_CAIXA: { valor: OrdenacaoCaixa; label: string }[] = [
  { valor: "data-desc", label: "Mais recentes" },
  { valor: "data-asc", label: "Mais antigos" },
  { valor: "faturamento-desc", label: "Maior faturamento" },
  { valor: "faturamento-asc", label: "Menor faturamento" },
  { valor: "saldo-desc", label: "Maior saldo" },
  { valor: "diferenca-desc", label: "Maior diferença" },
  { valor: "vendas-desc", label: "Maior quantidade de vendas" },
];

function faturamento(caixa: Caixa): number {
  return caixa.resumo.totalVendas + caixa.resumo.recebimentos;
}

export function ordenarCaixas(caixas: Caixa[], ordem: OrdenacaoCaixa): Caixa[] {
  const lista = [...caixas];
  switch (ordem) {
    case "data-asc":
      return lista.sort((a, b) => a.abertura.dataHora.localeCompare(b.abertura.dataHora));
    case "faturamento-desc":
      return lista.sort((a, b) => faturamento(b) - faturamento(a));
    case "faturamento-asc":
      return lista.sort((a, b) => faturamento(a) - faturamento(b));
    case "saldo-desc":
      return lista.sort((a, b) => b.resumo.saldoEsperado - a.resumo.saldoEsperado);
    case "diferenca-desc":
      return lista.sort(
        (a, b) => Math.abs(b.fechamento?.diferenca ?? 0) - Math.abs(a.fechamento?.diferenca ?? 0),
      );
    case "vendas-desc":
      return lista.sort((a, b) => b.resumo.quantidadeVendas - a.resumo.quantidadeVendas);
    default:
      return lista.sort((a, b) => b.abertura.dataHora.localeCompare(a.abertura.dataHora));
  }
}

export type PeriodoCaixa = "hoje" | "7d" | "30d" | "mes" | "mes-anterior";

export const OPCOES_PERIODO_CAIXA: { valor: PeriodoCaixa; label: string }[] = [
  { valor: "hoje", label: "Hoje" },
  { valor: "7d", label: "Últimos 7 dias" },
  { valor: "30d", label: "Últimos 30 dias" },
  { valor: "mes", label: "Mês atual" },
  { valor: "mes-anterior", label: "Mês anterior" },
];

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function mesmoDia(iso: string, referencia: Date = new Date()): boolean {
  return inicioDoDia(new Date(iso)).getTime() === inicioDoDia(referencia).getTime();
}

export function caixaNoPeriodo(caixa: Caixa, periodo: PeriodoCaixa): boolean {
  const data = new Date(caixa.abertura.dataHora);
  const hoje = inicioDoDia(new Date());

  if (periodo === "hoje") return inicioDoDia(data).getTime() === hoje.getTime();

  if (periodo === "7d" || periodo === "30d") {
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() - (periodo === "7d" ? 7 : 30));
    return data >= limite;
  }

  const referencia = new Date();
  if (periodo === "mes")
    return (
      data.getMonth() === referencia.getMonth() && data.getFullYear() === referencia.getFullYear()
    );

  const anterior = new Date(referencia.getFullYear(), referencia.getMonth() - 1, 1);
  return data.getMonth() === anterior.getMonth() && data.getFullYear() === anterior.getFullYear();
}

/** Faixas de saldo esperado — cobrem os filtros de valor mínimo e máximo. */
export const FAIXAS_SALDO_CAIXA: { valor: string; label: string; min: number; max: number }[] = [
  { valor: "ate-500", label: "Até R$ 500", min: 0, max: 500 },
  { valor: "500-1500", label: "R$ 500 a R$ 1.500", min: 500, max: 1500 },
  { valor: "1500-3000", label: "R$ 1.500 a R$ 3.000", min: 1500, max: 3000 },
  { valor: "acima-3000", label: "Acima de R$ 3.000", min: 3000, max: Number.POSITIVE_INFINITY },
];

export function caixaNaFaixa(caixa: Caixa, faixaId: string): boolean {
  const faixa = FAIXAS_SALDO_CAIXA.find((item) => item.valor === faixaId);
  if (!faixa) return true;
  const saldo = caixa.resumo.saldoEsperado;
  return saldo >= faixa.min && saldo < faixa.max;
}

export const OPCOES_DIFERENCA_CAIXA: { valor: string; label: string }[] = [
  { valor: "conferido", label: "Conferido (sem diferença)" },
  { valor: "sobra", label: "Com sobra" },
  { valor: "falta", label: "Com falta" },
];

export function caixaTemDiferenca(caixa: Caixa, valor: string): boolean {
  if (!caixa.fechamento) return false;
  return situacaoDiferenca(caixa.fechamento.diferenca) === valor;
}
