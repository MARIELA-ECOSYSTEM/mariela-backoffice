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

/** Máscara igual à do backend (`mascararTelefone`): nunca o número completo. */
function mascararTelefoneMock(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  const numero = d.length === 10 || d.length === 11 ? d.slice(2) : null;
  if (!numero) return d.length >= 4 ? `****${d.slice(-4)}` : "****";
  const ddd = d.slice(0, 2);
  return numero.length === 9
    ? `+55 ${ddd} ${numero[0]}****-${numero.slice(-4)}`
    : `+55 ${ddd} ****-${numero.slice(-4)}`;
}

const PREVIA_ANIVERSARIO_MOCK =
  "Olá, {{1}}! A equipe MARIELA deseja a você um feliz aniversário! Que seu novo ciclo seja cheio de coisas boas. " +
  "Esperamos você na MARIELA! Para não receber mais mensagens, responda SAIR.";

interface BloqueioMock {
  id: string;
  numeroMascarado: string;
  tipoChave: "E164";
  ativo: boolean;
  clienteId: string;
  origem: "ADMIN";
  motivo: string | null;
  criadoEm: string;
  desbloqueadoEm: string | null;
  motivoDesbloqueio: string | null;
}
const bloqueiosMock: BloqueioMock[] = [];
let sequenciaBloqueio = 0;

/**
 * Fase 22.8.9.10.6 — WhatsApp OFICIAL (Meta, envio por modelo) na Mock API. Deliberadamente HONESTO: sem provedor
 * real, os modelos ficam "não confirmados" (`DESCONHECIDO`) e todo envio é recusado com `WHATSAPP_NOT_CONFIGURED`,
 * exatamente como o backend sem configuração da Meta. Nenhum sucesso de envio é simulado. A prévia (só texto) e os
 * bloqueios (registro local) funcionam para permitir navegar pela interface.
 */
function registerWhatsappOficialMocks(): void {
  const cliente = (id: string) => {
    const c = db.clientes.find((item) => item.id === id);
    if (!c) throw ApiError.notFound("Cliente não encontrado.");
    return c;
  };
  const statusCliente = (id: string) => {
    const c = cliente(id);
    const valido = [10, 11].includes(c.telefone.replace(/\D/g, "").length);
    const mascarado = valido ? mascararTelefoneMock(c.telefone) : null;
    const ativos = bloqueiosMock.filter((b) => b.ativo && b.clienteId === id);
    return {
      bloqueado: ativos.length > 0,
      telefoneMascarado: mascarado,
      bloqueios: ativos.map((b) => ({ ...b })),
    };
  };
  const naoConfigurado = () =>
    new ApiError({
      statusCode: 503,
      code: "WHATSAPP_NOT_CONFIGURED",
      message: "Integração de WhatsApp não configurada neste ambiente.",
    });

  registerMock("GET", "/integracoes/whatsapp/templates", () => ({
    data: [
      {
        chave: "aniversario_v1",
        categoria: "MARKETING",
        idioma: "pt_BR",
        usoPermitido: ["INDIVIDUAL", "CAMPANHA_ANIVERSARIO"],
        previa: PREVIA_ANIVERSARIO_MOCK,
        estadoAprovacao: "DESCONHECIDO",
      },
    ],
  }));
  registerMock("POST", "/integracoes/whatsapp/templates/:chave/previa", ({ params, body }) => {
    if (params["chave"] !== "aniversario_v1") {
      throw new ApiError({
        statusCode: 422,
        code: "WHATSAPP_TEMPLATE_INDISPONIVEL",
        message: "Modelo de mensagem inexistente.",
      });
    }
    const c = cliente(String((body as { clienteId?: unknown } | null)?.clienteId ?? ""));
    const primeiro = c.nome.trim().split(/\s+/)[0] ?? c.nome;
    return { data: { texto: PREVIA_ANIVERSARIO_MOCK.replace("{{1}}", primeiro) } };
  });
  registerMock("POST", "/integracoes/whatsapp/envios", () => {
    throw naoConfigurado();
  });
  registerMock("GET", "/integracoes/whatsapp/mensagens", ({ query }) => {
    const limit = Number(query["limit"] ?? 20);
    const page = Number(query["page"] ?? 1);
    return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
  });
  registerMock("GET", "/integracoes/whatsapp/mensagens/:id", () => {
    throw ApiError.notFound("Mensagem não encontrada.");
  });
  registerMock("POST", "/integracoes/whatsapp/mensagens/:id/liberar-reenvio", () => {
    throw ApiError.notFound("Mensagem não encontrada.");
  });
  registerMock("GET", "/integracoes/whatsapp/clientes/:id/bloqueio", ({ params }) => ({
    data: statusCliente(params["id"] ?? ""),
  }));
  registerMock("POST", "/integracoes/whatsapp/clientes/:id/bloqueio", ({ params, body }) => {
    const id = params["id"] ?? "";
    const status = statusCliente(id);
    if (!status.telefoneMascarado)
      throw ApiError.validation("Telefone inválido para envio de WhatsApp.");
    const existente = bloqueiosMock.find((b) => b.ativo && b.clienteId === id);
    if (existente) return { data: { ...existente } };
    const motivo = (body as { motivo?: unknown } | null)?.motivo;
    sequenciaBloqueio += 1;
    const novo: BloqueioMock = {
      id: `blq_${sequenciaBloqueio}`,
      numeroMascarado: status.telefoneMascarado,
      tipoChave: "E164",
      ativo: true,
      clienteId: id,
      origem: "ADMIN",
      motivo: typeof motivo === "string" && motivo.trim() ? motivo.trim() : null,
      criadoEm: new Date().toISOString(),
      desbloqueadoEm: null,
      motivoDesbloqueio: null,
    };
    bloqueiosMock.push(novo);
    return { data: { ...novo } };
  });
  const desbloquear = (b: BloqueioMock, body: unknown) => {
    const motivo = (body as { motivo?: unknown } | null)?.motivo;
    if (typeof motivo !== "string" || motivo.trim().length < 3) {
      throw ApiError.validation("Informe o motivo do desbloqueio.", [
        { field: "motivo", message: "Informe o motivo do desbloqueio." },
      ]);
    }
    b.ativo = false;
    b.desbloqueadoEm = new Date().toISOString();
    b.motivoDesbloqueio = motivo.trim();
  };
  registerMock("DELETE", "/integracoes/whatsapp/clientes/:id/bloqueio", ({ params, body }) => {
    const id = params["id"] ?? "";
    const ativos = bloqueiosMock.filter((b) => b.ativo && b.clienteId === id);
    if (ativos.length === 0) throw ApiError.notFound("Nenhum bloqueio ativo para este cliente.");
    for (const b of ativos) desbloquear(b, body);
    return { data: statusCliente(id) };
  });
  registerMock("GET", "/integracoes/whatsapp/bloqueios", ({ query }) => {
    const somenteAtivos = query["somenteAtivos"] !== "false";
    const limit = Number(query["limit"] ?? 20);
    const page = Number(query["page"] ?? 1);
    const lista = bloqueiosMock.filter((b) => !somenteAtivos || b.ativo);
    return {
      data: lista.slice((page - 1) * limit, page * limit).map((b) => ({ ...b })),
      meta: { total: lista.length, page, limit, totalPages: Math.ceil(lista.length / limit) },
    };
  });
  registerMock("DELETE", "/integracoes/whatsapp/bloqueios/:id", ({ params, body }) => {
    const b = bloqueiosMock.find((item) => item.id === params["id"]);
    if (!b) throw ApiError.notFound("Bloqueio não encontrado.");
    if (!b.ativo) throw ApiError.conflict("Este bloqueio já foi removido.");
    desbloquear(b, body);
    return { data: { ...b } };
  });
}

/** Catálogo de integrações (contrato: GET /integracoes). Nenhuma integração real é executada. */
export function registerIntegracoesMocks(): void {
  registerWhatsappOficialMocks();
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
