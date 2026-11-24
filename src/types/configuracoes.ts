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

/**
 * Fase 22.8.9.10.7.3 — mensagem padrão de WhatsApp: texto de APOIO, salvo nas configurações, que o operador escolhe e
 * edita no dialog de envio. Não é template da Meta e não é enviada por si.
 */
export interface MensagemPadraoWhatsapp {
  id: string;
  titulo: string;
  conteudo: string;
  atualizadoEm: string;
}

export interface SalvarMensagemPadraoWhatsapp {
  titulo: string;
  conteudo: string;
}

/** Mesmos limites do backend (`LIMITES_MENSAGEM_WHATSAPP`). */
export const LIMITES_MENSAGEM_PADRAO_WHATSAPP = {
  titulo: 60,
  conteudo: 1000,
  quantidade: 30,
} as const;

export interface Configuracoes {
  loja: DadosLoja;
  categorias: string[];
  tamanhos: string[];
  cores: string[];
  formasPagamento: string[];
  /** Fase 22.8.9.10.7.3. Ausente numa resposta antiga = tratado como lista vazia. */
  mensagensWhatsapp?: MensagemPadraoWhatsapp[];
  atualizadoEm: string;
}

export type ListaConfiguravel = "categorias" | "tamanhos" | "cores" | "formasPagamento";
