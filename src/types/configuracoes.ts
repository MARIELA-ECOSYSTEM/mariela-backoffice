export interface EnderecoLoja {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface DadosLoja {
  nome: string;
  logo: string;
  telefone: string;
  whatsapp: string;
  email: string;
  endereco: EnderecoLoja;
}

export interface Configuracoes {
  loja: DadosLoja;
  categorias: string[];
  tamanhos: string[];
  cores: string[];
  formasPagamento: string[];
  atualizadoEm: string;
}

export type ListaConfiguravel = "categorias" | "tamanhos" | "cores" | "formasPagamento";
