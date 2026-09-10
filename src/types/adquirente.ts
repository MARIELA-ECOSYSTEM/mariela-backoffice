/**
 * Contratos do módulo ADQUIRENTES do MARIELA BACKOFFICE — espelham
 * exatamente `mariela-backend/src/modules/adquirentes` (Etapa 18.37).
 *
 * Diferenças deliberadas em relação aos demais cadastros administrativos
 * (Clientes/Fornecedores/Coleções/Campanhas/Vendedores), todas confirmadas
 * no contrato real, não escolhas deste frontend:
 *   - NÃO há campo `codigo` (sequencial) — a resposta real não o inclui.
 *   - `PATCH /adquirentes/:id` é genuinamente PARCIAL (ao contrário do `PUT`
 *     de substituição completa usado pelos outros módulos): cada campo do
 *     payload de atualização é independentemente opcional.
 *   - `GET /adquirentes` é SEMPRE paginado (sem o modo "array completo sem
 *     parâmetros" que Vendas/Clientes/Campanhas/Coleções/Fornecedores têm) —
 *     não existe contrato legado aqui.
 *   - Não há faceta nenhuma na listagem (contrato deliberadamente enxuto,
 *     documentado no próprio DTO do backend).
 *   - `excluidoEm` é deliberadamente serializado na resposta (comentário no
 *     schema real: o Backoffice precisa distinguir uma adquirente excluída
 *     ao consultar por id) — diferente de Cliente/Fornecedor, que omitem
 *     esse campo no contrato do frontend.
 *   - Tarifas NÃO são um recurso à parte (sem CRUD dedicado): `tabelaTarifas`
 *     é um array embutido no próprio Adquirente, substituído por inteiro a
 *     cada `PATCH` que o envie.
 *
 * Endpoints:
 *   GET    /adquirentes?busca=&page=&limit=   → PaginatedResponse<Adquirente> (sempre)
 *   GET    /adquirentes/:id                   → ApiResponse<Adquirente>
 *   POST   /adquirentes                       → ApiResponse<Adquirente>
 *   PATCH  /adquirentes/:id                   → ApiResponse<Adquirente> (parcial)
 *   DELETE /adquirentes/:id                   → ApiResponse<{ id: string }> (soft delete)
 */

export type ModalidadeTarifa = "debito" | "credito";

export const MODALIDADES_TARIFA: ModalidadeTarifa[] = ["debito", "credito"];

export const LABEL_MODALIDADE_TARIFA: Record<ModalidadeTarifa, string> = {
  debito: "Débito",
  credito: "Crédito",
};

/** Uma entrada da tabela de tarifas — sempre lida/escrita como parte do Adquirente. */
export interface TarifaConfig {
  id: string;
  modalidade: ModalidadeTarifa;
  /** 1–24. Débito só aceita 1 (regra do backend). */
  parcelas: number;
  /** Percentual de tarifa, até 2 casas decimais. */
  percentual: number;
}

export interface Adquirente {
  id: string;
  nome: string;
  ativo: boolean;
  observacao: string | null;
  tabelaTarifas: TarifaConfig[];
  /** `null` = ativa (nunca excluída). Presente mesmo quando a adquirente foi excluída (soft delete). */
  excluidoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Uma entrada de tarifa no payload de escrita — sem `id` (gerado pelo backend). */
export interface TarifaConfigPayload {
  modalidade: ModalidadeTarifa;
  parcelas: number;
  percentual: number;
}

export interface CriarAdquirentePayload {
  nome: string;
  ativo?: boolean;
  observacao?: string | null;
  tabelaTarifas?: TarifaConfigPayload[];
}

/** Todo campo é independentemente opcional — reflete o `PATCH` parcial real. */
export interface AtualizarAdquirentePayload {
  nome?: string;
  ativo?: boolean;
  observacao?: string | null;
  tabelaTarifas?: TarifaConfigPayload[];
}

export interface AdquirentesFiltros {
  busca?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}
