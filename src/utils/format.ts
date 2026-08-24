export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Data + hora curta (usada em históricos de venda). */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function iniciais(texto: string): string {
  return texto
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/** Escolhe singular/plural de acordo com a quantidade informada. */
export function pluralizar(quantidade: number, singular: string, plural: string): string {
  return Math.abs(quantidade) === 1 ? singular : plural;
}
