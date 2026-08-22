export type StatusIntegracao = "conectada" | "disponivel" | "planejada";

export interface Integracao {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  status: StatusIntegracao;
  /** Documentação/nota interna sobre a integração. */
  observacao: string;
}
