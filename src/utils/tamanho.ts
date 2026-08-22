import type { Variante } from "@/types/variante";

/** Tamanho único ("U"): peça sem grade de tamanhos. */
export const TAMANHO_UNICO = "U";

/** "u" → "U"; demais tamanhos apenas normalizados em maiúsculas sem espaços. */
export function normalizarTamanho(tamanho: string): string {
  return tamanho.trim().toUpperCase();
}

export function ehTamanhoUnico(tamanho: string): boolean {
  return normalizarTamanho(tamanho) === TAMANHO_UNICO;
}

/**
 * Regra: "U" não coexiste com nenhum outro tamanho na mesma variante.
 * Devolve a mensagem de erro ou `null` quando a inclusão é válida.
 */
export function conflitoTamanhoUnico(
  tamanhosExistentes: readonly string[],
  novoTamanho: string,
): string | null {
  const novo = normalizarTamanho(novoTamanho);
  const existentes = tamanhosExistentes.map(normalizarTamanho);
  const jaTemU = existentes.includes(TAMANHO_UNICO);

  if (novo === TAMANHO_UNICO && existentes.length > 0) {
    return "Esta variante já possui tamanhos: o tamanho único (U) não pode coexistir com outros.";
  }
  if (novo !== TAMANHO_UNICO && jaTemU) {
    return "Esta variante usa tamanho único (U): não é possível adicionar outros tamanhos.";
  }
  return null;
}

export function tamanhosDaVariante(variante: Pick<Variante, "tamanhos">): string[] {
  return variante.tamanhos.map((t) => t.tamanho);
}
