/**
 * Fornecedor — parceiro de produção da loja.
 *
 * REGRAS:
 * - Fornecedor NÃO possui status ativo/inativo.
 * - O código (`FOR-0001`) é gerado pela API e nunca digitado.
 * - Telefone é único e serve também como número de WhatsApp.
 * - Os agregados comerciais (`produtosVinculados`, `valorEmCusto`,
 *   `ultimaEntrada`) são calculados pela camada de dados (hoje o mock, amanhã o
 *   NestJS). O frontend apenas EXIBE — nunca soma produtos no componente.
 */
export interface EnderecoFornecedor {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface Fornecedor {
  id: string;
  /** Código sequencial gerado pela API (`FOR-0001`). Somente leitura. */
  codigo: string;
  nome: string;
  /** URL da logo/foto do fornecedor ou null. */
  foto: string | null;
  contato: string;
  /** Telefone único — usado também como WhatsApp. */
  telefone: string;
  email: string;
  cnpj: string;
  instagram: string;
  observacao: string;
  /** Endereço opcional — nenhum campo é obrigatório. */
  endereco: EnderecoFornecedor | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Quantidade de produtos atualmente vinculados (agregado da API). */
  produtosVinculados: number;
  /** Soma do valor de custo do estoque vinculado (agregado da API). */
  valorEmCusto: number;
  /** Data ISO do vínculo de produto mais recente ou null. */
  ultimaEntrada: string | null;
}

/** O código NÃO faz parte do payload: quem gera é a API. */
export interface FornecedorPayload {
  nome: string;
  foto?: string | null | undefined;
  contato: string;
  telefone: string;
  email?: string | undefined;
  cnpj?: string | undefined;
  instagram?: string | undefined;
  observacao?: string | undefined;
  endereco?: EnderecoFornecedor | null | undefined;
}

/** Situação do vínculo entre produto e fornecedor. */
export type SituacaoVinculo = "atual" | "historico";

/**
 * Item do histórico de produtos do fornecedor.
 * Contrato: GET /fornecedores/:id/historico
 */
export interface FornecedorHistoricoItem {
  id: string;
  produtoId: string;
  produtoNome: string;
  /** Código do produto (`PROD-0001`). */
  codProduto: string;
  vinculadoEm: string;
  desvinculadoEm: string | null;
  precoCusto: number;
  precoVenda: number;
  situacao: SituacaoVinculo;
}

export const LABEL_SITUACAO_VINCULO: Record<SituacaoVinculo, string> = {
  atual: "Atual",
  historico: "Histórico",
};

export interface StatusPayload {
  ativo: boolean;
}
