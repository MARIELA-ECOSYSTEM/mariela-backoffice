export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

/**
 * Reconhece uma data-somente (`YYYY-MM-DD`) ou seu equivalente serializado
 * pelo Mongoose como `Date` (sempre meia-noite UTC, ex.: `2026-01-01T00:00:00.000Z`).
 * Datas/horas reais (`criadoEm`, `dataVenda` etc.) nunca batem nesta meia-noite
 * exata, então continuam pelo caminho de baixo — mesma técnica de extração por
 * string já usada em `utils/cliente.ts` (`diaMesNascimento`), aplicada só aqui
 * porque `formatarData` também recebe datas com hora real.
 */
const DATA_SOMENTE_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/;

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dataSomente = DATA_SOMENTE_REGEX.exec(iso);
  if (dataSomente) {
    const [, ano, mes, dia] = dataSomente;
    return `${dia}/${mes}/${ano}`;
  }
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
