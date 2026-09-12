import { db } from "./db";
import { registerMock } from "./mock-transport";
import { ApiError, type ApiFieldError } from "@/types/api";
import type { Integracao } from "@/types/integracao";

let sequenciaMensagem = 0;

/**
 * Etapa Pré-22 — simulação do ciclo de vida da conexão WhatsApp (Evolution
 * API/Baileys), só para permitir desenvolver/demonstrar a tela de Integrações
 * sem uma Evolution API rodando. NÃO deve mascarar o contrato real: os
 * mesmos campos/estados (`CONNECTED`/`CONNECTING`/`QRCODE`/`DISCONNECTED`/
 * `NOT_CONFIGURED`/`ERROR`) e o mesmo formato de payload de envio
 * (`{ tipo, id, mensagem? }`, sem telefone/API key) do backend real.
 */
type StatusConexaoWhatsappMock = "CONNECTED" | "CONNECTING" | "QRCODE" | "DISCONNECTED" | "NOT_CONFIGURED" | "ERROR";

let estadoConexao: StatusConexaoWhatsappMock = "DISCONNECTED";
let consultasEmQrCode = 0;

function numeroLojaMock(): string {
  return db.configuracoes.loja.whatsapp?.trim() || "+5583986567915";
}

function statusWhatsappMock(): {
  provider: "evolution-api";
  transporte: "baileys";
  instance: string;
  status: StatusConexaoWhatsappMock;
  numero: string | null;
  qrCode: string | null;
} {
  if (estadoConexao === "QRCODE") {
    consultasEmQrCode += 1;
    // Simula o "scan" do QR Code pelo administrador após duas consultas —
    // permite demonstrar o fluxo completo (Conectar → QR → Conectado) sem
    // uma Evolution API real.
    if (consultasEmQrCode >= 2) estadoConexao = "CONNECTED";
  }
  return {
    provider: "evolution-api",
    transporte: "baileys",
    instance: "mariela-whatsapp",
    status: estadoConexao,
    numero: estadoConexao === "DISCONNECTED" ? null : numeroLojaMock(),
    qrCode:
      estadoConexao === "QRCODE"
        ? "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2ZmZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjE0Ij5RUiBDb2RlIChtb2NrKTwvdGV4dD48L3N2Zz4="
        : null,
  };
}

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

  registerMock("GET", "/integracoes/whatsapp/status", () => ({ data: statusWhatsappMock() }));

  registerMock("POST", "/integracoes/whatsapp/conectar", () => {
    if (estadoConexao === "DISCONNECTED" || estadoConexao === "NOT_CONFIGURED" || estadoConexao === "ERROR") {
      estadoConexao = "QRCODE";
      consultasEmQrCode = 0;
    }
    return { data: statusWhatsappMock() };
  });

  registerMock("POST", "/integracoes/whatsapp/desconectar", () => {
    estadoConexao = "DISCONNECTED";
    consultasEmQrCode = 0;
    return { data: statusWhatsappMock() };
  });

  /**
   * Simula o envio (nenhuma mensagem real sai do ambiente de desenvolvimento),
   * mas resolve o destinatário do MESMO jeito que o backend real: `tipo`+`id`
   * → telefone do cadastro — nunca aceita telefone informado pelo chamador
   * (o mock não declara esse campo, então o contrato já barra por design).
   * Contrato: POST /integracoes/whatsapp/mensagens — Body: { tipo, id, mensagem? }
   */
  registerMock("POST", "/integracoes/whatsapp/mensagens", ({ body }) => {
    const payload = (body ?? {}) as Partial<{
      tipo: "CLIENTE" | "FORNECEDOR" | "VENDEDOR";
      id: string;
      mensagem: string;
    }>;
    const errors: ApiFieldError[] = [];
    if (!payload.tipo || !["CLIENTE", "FORNECEDOR", "VENDEDOR"].includes(payload.tipo)) {
      errors.push({ field: "tipo", message: "tipo deve ser CLIENTE, FORNECEDOR ou VENDEDOR." });
    }
    if (!payload.id?.trim()) errors.push({ field: "id", message: "id é obrigatório." });
    if (errors.length > 0) throw ApiError.validation("Dados inválidos.", errors);

    const entidade =
      payload.tipo === "CLIENTE"
        ? db.clientes.find((item) => item.id === payload.id)
        : payload.tipo === "FORNECEDOR"
          ? db.fornecedores.find((item) => item.id === payload.id)
          : db.vendedores.find((item) => item.id === payload.id);

    if (!entidade) {
      throw ApiError.notFound(
        `${payload.tipo === "CLIENTE" ? "Cliente" : payload.tipo === "FORNECEDOR" ? "Fornecedor" : "Vendedor"} não encontrado.`,
      );
    }
    const digitos = entidade.telefone.replace(/\D/g, "");
    if (![10, 11].includes(digitos.length)) {
      throw ApiError.validation("Telefone inválido para envio de WhatsApp.", [
        { field: "telefone", message: "Cadastro sem telefone válido para WhatsApp." },
      ]);
    }

    sequenciaMensagem += 1;
    return {
      data: {
        id: `wam_${sequenciaMensagem}`,
        status: "enviada" as const,
        tipo: payload.tipo,
        destinatario: `+55${digitos}`,
      },
    };
  });
}
