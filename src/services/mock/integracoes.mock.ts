import { registerMock } from "./mock-transport";
import type { Integracao } from "@/types/integracao";

const INTEGRACOES: Integracao[] = [
  {
    id: "int_pdv",
    nome: "MARIELA PDV",
    categoria: "Vendas",
    descricao: "Sincronização de vendas e caixa com o PDV da loja física.",
    status: "planejada",
    observacao: "Será desenvolvido como sistema separado e consumirá a mesma API.",
  },
  {
    id: "int_whatsapp",
    nome: "WhatsApp Business",
    categoria: "Atendimento",
    descricao: "Envio de novidades e confirmação de reservas para clientes.",
    status: "disponivel",
    observacao: "Depende de número verificado e template aprovado.",
  },
  {
    id: "int_ecommerce",
    nome: "Loja online",
    categoria: "Catálogo",
    descricao: "Publicação do catálogo, preços e estoque na vitrine digital.",
    status: "disponivel",
    observacao: "Publicação apenas de produtos com estoque disponível.",
  },
  {
    id: "int_nfe",
    nome: "Emissor de NF-e",
    categoria: "Fiscal",
    descricao: "Emissão de notas fiscais a partir das vendas registradas.",
    status: "planejada",
    observacao: "Aguarda definição do certificado digital da loja.",
  },
  {
    id: "int_instagram",
    nome: "Instagram Shopping",
    categoria: "Marketing",
    descricao: "Marcação de produtos do catálogo nas publicações da loja.",
    status: "disponivel",
    observacao: "Requer conta comercial vinculada ao catálogo.",
  },
  {
    id: "int_backup",
    nome: "Backup automático",
    categoria: "Sistema",
    descricao: "Rotina de backup dos dados oficiais mantidos na API.",
    status: "conectada",
    observacao: "Rotina diária mantida pela infraestrutura da API.",
  },
];

/** Catálogo de integrações (contrato: GET /integracoes). Nenhuma integração real é executada. */
export function registerIntegracoesMocks(): void {
  registerMock("GET", "/integracoes", () => ({
    data: INTEGRACOES.map((integracao) => ({ ...integracao })),
    meta: { total: INTEGRACOES.length },
  }));
}
