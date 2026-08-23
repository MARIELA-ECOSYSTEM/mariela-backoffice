/**
 * Regras de apresentação compartilhadas por COLEÇÕES e CAMPANHAS.
 *
 * Conceito do sistema (não unificar as entidades):
 * - COLEÇÃO: agrupamento/identidade comercial dos produtos (`produto.colecaoId`).
 * - CAMPANHA: ação de comunicação/venda em um período (`produto.campanhaId`).
 *
 * O status exibido é DERIVADO de `ativo` + período — a regra de negócio
 * armazenada continua sendo apenas `inicio`, `fim` e `ativo`.
 */

export type StatusVigencia = "ativa" | "agendada" | "encerrada" | "inativa";

export interface ItemVitrine {
  inicio: string;
  fim: string;
  ativo: boolean;
  destaque: boolean;
  banner: boolean;
  fotoDestaque: string | null;
  fotoBanner: string | null;
}

export function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function statusVigencia(
  item: Pick<ItemVitrine, "inicio" | "fim" | "ativo">,
  hoje = hojeIso(),
): StatusVigencia {
  if (!item.ativo) return "inativa";
  if (item.inicio > hoje) return "agendada";
  if (item.fim < hoje) return "encerrada";
  return "ativa";
}

export const LABEL_VIGENCIA: Record<StatusVigencia, string> = {
  ativa: "Ativa",
  agendada: "Agendada",
  encerrada: "Encerrada",
  inativa: "Inativa",
};

export const OPCOES_VIGENCIA = [
  { valor: "ativa", label: "Ativa" },
  { valor: "agendada", label: "Agendada" },
  { valor: "encerrada", label: "Encerrada" },
  { valor: "inativa", label: "Inativa" },
];

export const OPCOES_DESTAQUE = [
  { valor: "sim", label: "Em destaque" },
  { valor: "nao", label: "Sem destaque" },
];

export const OPCOES_BANNER = [
  { valor: "sim", label: "No banner" },
  { valor: "nao", label: "Fora do banner" },
];
