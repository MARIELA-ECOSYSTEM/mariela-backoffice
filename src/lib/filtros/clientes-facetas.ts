/**
 * Contrato de facetas da tela de Clientes — fonte única de verdade para a UI
 * (labels/opções) e para o mock (filtro + counts). Quando a API NestJS assume
 * a listagem, apenas o mock para de usar os predicados: as chaves e os
 * valores enviados/recebidos continuam os mesmos (mesmo padrão de
 * `produtos-facetas.ts`).
 */

import type { Cliente } from "@/types/cliente";
import { aniversarioNoPeriodo, janelaSemCompra, semCompraDesde } from "@/utils/cliente";
import type { FacetaServidor } from "./facetas-servidor";

export const FACETAS_CLIENTE = {
  recencia: "recencia",
  historico: "historico",
  aniversario: "aniversario",
  observacao: "observacao",
} as const;

export const facetasCliente: FacetaServidor<Cliente>[] = [
  {
    id: FACETAS_CLIENTE.recencia,
    valores: () => ["1m", "3m", "6m"],
    corresponde: (cliente, valor) => semCompraDesde(cliente, janelaSemCompra(valor)),
  },
  {
    id: FACETAS_CLIENTE.historico,
    valores: () => ["com", "sem", "recorrente"],
    corresponde: (cliente, valor) =>
      valor === "com"
        ? cliente.compras > 0
        : valor === "sem"
          ? cliente.compras === 0
          : cliente.compras >= 2,
  },
  {
    id: FACETAS_CLIENTE.aniversario,
    valores: () => ["mes", "semana", "com", "sem"],
    corresponde: (cliente, valor) => {
      if (valor === "com") return Boolean(cliente.dataNascimento);
      if (valor === "sem") return !cliente.dataNascimento;
      return aniversarioNoPeriodo(cliente.dataNascimento, valor === "mes" ? "mes" : "semana");
    },
  },
  {
    id: FACETAS_CLIENTE.observacao,
    valores: () => ["com", "sem"],
    corresponde: (cliente, valor) =>
      valor === "com" ? Boolean(cliente.observacao) : !cliente.observacao,
  },
];
