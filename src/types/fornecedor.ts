export interface Fornecedor {
  id: string;
  nome: string;
  contato: string;
  telefone: string;
  criadoEm: string;
}

export interface FornecedorPayload {
  nome: string;
  contato: string;
  telefone: string;
}
