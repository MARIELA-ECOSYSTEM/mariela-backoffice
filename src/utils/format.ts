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

export function iniciais(texto: string): string {
  return texto
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}
