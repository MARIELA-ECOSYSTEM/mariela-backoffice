/**
 * Fase 22.8.9.10.6 — WhatsApp OFICIAL (Meta, envio por modelo) no Backoffice: cliente de API, classificação das falhas
 * de envio, registro local da chave de idempotência, verificação de envio sem confirmação, campanha de aniversário e
 * Mock API honesta. Executar com: `bun test tests/unit`
 *
 * Sem backend e sem rede: `fetch` é substituído por um falso que responde na hora (ou simula rede/timeout). Nada sai
 * da máquina, nada fala com a Meta. Ids, nomes e telefones são fictícios.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

process.env.VITE_USE_MOCK_API = "false";
process.env.VITE_API_URL = "http://api.ficticia.invalid/api/v1";
const BASE_API = "http://api.ficticia.invalid/api/v1";

const { apiClient } = await import("@/services/api/client");
const { limparSessao } = await import("@/services/auth/token-storage");
const { criarWhatsappOficialApi } = await import("@/services/api/whatsapp-oficial.api");
const { whatsappApi } = await import("@/services/api/whatsapp.api");
const envio = await import("@/services/whatsapp/envio-oficial");
const { ApiError } = await import("@/types/api");
const { handleMockRequest } = await import("@/services/mock/mock-transport");
const { registrarMocks } = await import("@/services/mock/register");
const { db } = await import("@/services/mock/db");
type MensagemWhatsapp = import("@/types/whatsapp-oficial").MensagemWhatsapp;
type EnviarTemplatePayload = import("@/types/whatsapp-oficial").EnviarTemplatePayload;
type TemplateWhatsapp = import("@/types/whatsapp-oficial").TemplateWhatsapp;
type ApiErrorT = InstanceType<typeof ApiError>;

// ─── fetch falso ────────────────────────────────────────────────────────────────────────────────────────────────────

interface Requisicao {
  metodo: string;
  caminho: string;
  query: Record<string, string>;
  corpo: unknown;
}
type Resposta = { status: number; corpo?: unknown } | "rede" | "timeout";

const requisicoes: Requisicao[] = [];
let respostas: Resposta[] = [];

/**
 * Requisições fora das rotas deste arquivo (ex.: `/auth/refresh` disparado por uma sessão que outro arquivo de teste
 * deixou no processo compartilhado): falham como rede e nunca consomem a fila de respostas deste arquivo.
 */
const alheias: string[] = [];

function fetchFalso(url: string | URL, init?: RequestInit): Promise<Response> {
  const u = new URL(String(url));
  const caminho = u.pathname.slice(new URL(BASE_API).pathname.length);
  if (!caminho.startsWith("/integracoes/") && caminho !== "/qualquer") {
    alheias.push(`${init?.method ?? "GET"} ${caminho}`);
    return Promise.reject(new TypeError("Failed to fetch"));
  }
  requisicoes.push({
    metodo: init?.method ?? "GET",
    caminho,
    query: Object.fromEntries(u.searchParams.entries()),
    corpo: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  });
  const r = respostas.shift() ?? { status: 200, corpo: { data: null } };
  if (r === "rede") return Promise.reject(new TypeError("Failed to fetch"));
  if (r === "timeout")
    return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  return Promise.resolve({
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: new Headers(),
    json: async () => r.corpo ?? null,
  } as Response);
}

const fetchOriginal = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = fetchFalso as typeof fetch;
  // Sem sessão: nenhuma renovação de token antes das requisições (o token não interessa a estes testes).
  limparSessao();
});
afterAll(() => {
  globalThis.fetch = fetchOriginal;
  if (alheias.length > 0)
    console.info(`[whatsapp-oficial] requisições alheias recusadas: ${alheias.join(", ")}`);
});
beforeEach(() => {
  requisicoes.length = 0;
  respostas = [];
});

// ─── dados fictícios ────────────────────────────────────────────────────────────────────────────────────────────────

const CLIENTE = "65f1a2b3c4d5e6f7a8b9c0d1";
const CLIENTE_2 = "65f1a2b3c4d5e6f7a8b9c0d2";
const CLIENTE_3 = "65f1a2b3c4d5e6f7a8b9c0d3";
const CHAVE = "3f2b8c1e-9a4d-4b6f-8e2a-1c5d7f9b0a13";

function mensagem(extra: Partial<MensagemWhatsapp> = {}): MensagemWhatsapp {
  return {
    id: "6600000000000000000000a1",
    idempotencyKey: CHAVE,
    destinatario: { tipo: "CLIENTE", id: CLIENTE, telefoneMascarado: "+55 83 9****-0000" },
    template: { chave: "aniversario_v1", categoria: "MARKETING" },
    estado: "aceita",
    erro: null,
    origem: "INDIVIDUAL",
    campanha: null,
    liberacao: null,
    criadoEm: "2026-11-24T12:00:00.000Z",
    atualizadoEm: "2026-11-24T12:00:01.000Z",
    aceitaEm: "2026-11-24T12:00:01.000Z",
    entregueEm: null,
    lidaEm: null,
    falhaEm: null,
    ...extra,
  };
}

const erroApi = (
  statusCode: number,
  code: string,
  message = "fictício",
  retryAfterSegundos: number | null = null,
) => new ApiError({ statusCode, code, message, retryAfterSegundos });

class StorageMemoria implements Storage {
  dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  key(i: number) {
    return [...this.dados.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.dados.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.dados.set(k, v);
  }
  removeItem(k: string) {
    this.dados.delete(k);
  }
  clear() {
    this.dados.clear();
  }
}

// ─── 1. Cliente de API (rotas e contratos REAIS do backend) ──────────────────────────────────────────────────────────

describe("cliente de API do WhatsApp oficial", () => {
  const api = criarWhatsappOficialApi(apiClient);

  test("modelos e prévia: rotas exatas; a prévia leva SÓ o clienteId", async () => {
    respostas = [
      { status: 200, corpo: { data: [] } },
      { status: 200, corpo: { data: { texto: "Olá, Ana!" } } },
    ];
    await api.listarTemplates();
    const previa = await api.previa("aniversario_v1", CLIENTE);
    expect(previa.texto).toBe("Olá, Ana!");
    expect(requisicoes.map((r) => `${r.metodo} ${r.caminho}`)).toEqual([
      "GET /integracoes/whatsapp/templates",
      "POST /integracoes/whatsapp/templates/aniversario_v1/previa",
    ]);
    expect(requisicoes[1]?.corpo).toEqual({ clienteId: CLIENTE });
  });

  test("envio: corpo SEM telefone e SEM texto; 201 = nova, 200 = repetição da mesma chave", async () => {
    const payload: EnviarTemplatePayload = {
      idempotencyKey: CHAVE,
      destinatario: { tipo: "CLIENTE", id: CLIENTE },
      template: "aniversario_v1",
    };
    respostas = [
      { status: 201, corpo: { data: mensagem() } },
      { status: 200, corpo: { data: mensagem() } },
    ];
    const nova = await api.enviar(payload);
    const repetida = await api.enviar(payload);
    expect(nova.repetida).toBe(false);
    expect(repetida.repetida).toBe(true);
    expect(requisicoes[0]?.caminho).toBe("/integracoes/whatsapp/envios");
    expect(requisicoes[0]?.corpo).toEqual(payload);
    const corpo = JSON.stringify(requisicoes[0]?.corpo);
    for (const proibido of ["telefone", "mensagem", "texto", "numero", "parametros"]) {
      expect(corpo).not.toContain(proibido);
    }
  });

  test("status HTTP exposto SEM alterar o objeto da resposta (não enumerável)", async () => {
    respostas = [{ status: 201, corpo: { data: { id: "x" } } }];
    const resposta = await apiClient.post<{ id: string }>("/qualquer", {});
    expect(resposta.httpStatus).toBe(201);
    expect(Object.keys(resposta)).toEqual(["data"]);
    expect(JSON.stringify(resposta)).toBe('{"data":{"id":"x"}}');
  });

  test("histórico: filtros do backend na query; ausentes não são enviados; meta preservada", async () => {
    respostas = [
      {
        status: 200,
        corpo: { data: [mensagem()], meta: { total: 41, page: 3, limit: 20, totalPages: 3 } },
      },
      { status: 200, corpo: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } } },
    ];
    const r = await api.listarMensagens({
      clienteId: CLIENTE,
      estado: "falha",
      campanhaAno: 2026,
      page: 3,
      limit: 20,
    });
    await api.listarMensagens({ page: 1, limit: 20 });
    expect(r.meta.total).toBe(41);
    expect(requisicoes[0]?.query).toEqual({
      clienteId: CLIENTE,
      estado: "falha",
      campanhaAno: "2026",
      page: "3",
      limit: "20",
    });
    expect(requisicoes[1]?.query).toEqual({ page: "1", limit: "20" });
  });

  test("detalhe e liberação de reenvio: rotas e corpo do contrato", async () => {
    respostas = [
      { status: 200, corpo: { data: mensagem() } },
      { status: 200, corpo: { data: mensagem({ estado: "indeterminada" }) } },
    ];
    await api.obterMensagem("6600000000000000000000a1");
    await api.liberarReenvio("6600000000000000000000a1", {
      motivo: "Cliente pediu de novo",
      confirmoRiscoDeDuplicidade: true,
    });
    expect(requisicoes.map((r) => `${r.metodo} ${r.caminho}`)).toEqual([
      "GET /integracoes/whatsapp/mensagens/6600000000000000000000a1",
      "POST /integracoes/whatsapp/mensagens/6600000000000000000000a1/liberar-reenvio",
    ]);
    expect(requisicoes[1]?.corpo).toEqual({
      motivo: "Cliente pediu de novo",
      confirmoRiscoDeDuplicidade: true,
    });
  });

  test("bloqueios: situação, bloquear (201/200), desbloquear com motivo no corpo do DELETE, lista e remoção por id", async () => {
    const bloqueio = {
      id: "b1",
      numeroMascarado: "+55 83 9****-0000",
      tipoChave: "E164",
      ativo: true,
      clienteId: CLIENTE,
      origem: "ADMIN",
      motivo: null,
      criadoEm: "2026-11-24T12:00:00.000Z",
      desbloqueadoEm: null,
      motivoDesbloqueio: null,
    };
    respostas = [
      {
        status: 200,
        corpo: {
          data: { bloqueado: false, telefoneMascarado: "+55 83 9****-0000", bloqueios: [] },
        },
      },
      { status: 201, corpo: { data: bloqueio } },
      { status: 200, corpo: { data: bloqueio } },
      {
        status: 200,
        corpo: {
          data: { bloqueado: false, telefoneMascarado: "+55 83 9****-0000", bloqueios: [] },
        },
      },
      { status: 200, corpo: { data: [bloqueio], meta: { total: 1 } } },
      { status: 200, corpo: { data: { ...bloqueio, ativo: false } } },
    ];
    await api.statusBloqueioCliente(CLIENTE);
    expect((await api.bloquearCliente(CLIENTE, null)).jaExistia).toBe(false);
    expect((await api.bloquearCliente(CLIENTE, "pediu")).jaExistia).toBe(true);
    await api.desbloquearCliente(CLIENTE, "autorizado pela cliente");
    await api.listarBloqueios({ somenteAtivos: false, page: 2, limit: 20 });
    await api.desbloquearPorId("b1", "autorizado");
    expect(requisicoes.map((r) => `${r.metodo} ${r.caminho}`)).toEqual([
      `GET /integracoes/whatsapp/clientes/${CLIENTE}/bloqueio`,
      `POST /integracoes/whatsapp/clientes/${CLIENTE}/bloqueio`,
      `POST /integracoes/whatsapp/clientes/${CLIENTE}/bloqueio`,
      `DELETE /integracoes/whatsapp/clientes/${CLIENTE}/bloqueio`,
      "GET /integracoes/whatsapp/bloqueios",
      "DELETE /integracoes/whatsapp/bloqueios/b1",
    ]);
    expect(requisicoes[1]?.corpo).toEqual({});
    expect(requisicoes[2]?.corpo).toEqual({ motivo: "pediu" });
    expect(requisicoes[3]?.corpo).toEqual({ motivo: "autorizado pela cliente" });
    expect(requisicoes[4]?.query).toEqual({ somenteAtivos: "false", page: "2", limit: "20" });
    expect(requisicoes[5]?.corpo).toEqual({ motivo: "autorizado" });
  });

  test("timeout e queda de rede viram resultado DESCONHECIDO (nunca recusa)", async () => {
    respostas = ["timeout", "rede"];
    const payload: EnviarTemplatePayload = {
      idempotencyKey: CHAVE,
      destinatario: { tipo: "CLIENTE", id: CLIENTE },
      template: "aniversario_v1",
    };
    const e1 = await api.enviar(payload).catch((e: unknown) => e);
    const e2 = await api.enviar(payload).catch((e: unknown) => e);
    expect(envio.classificarFalhaEnvio(e1).tipo).toBe("desconhecido");
    expect(envio.classificarFalhaEnvio(e2).tipo).toBe("desconhecido");
  });

  test("regressão: o fluxo da Evolution continua com a MESMA rota e o mesmo corpo", async () => {
    respostas = [
      {
        status: 200,
        corpo: { data: { id: "w1", status: "enviada", tipo: "CLIENTE", destinatario: "+55" } },
      },
    ];
    await whatsappApi.enviarMensagem({ tipo: "FORNECEDOR", id: "f1", mensagem: "Olá" });
    expect(requisicoes[0]).toMatchObject({
      metodo: "POST",
      caminho: "/integracoes/whatsapp/mensagens",
      corpo: { tipo: "FORNECEDOR", id: "f1", mensagem: "Olá" },
    });
  });
});

// ─── 2. Classificação das falhas de envio ────────────────────────────────────────────────────────────────────────────

describe("classificação das falhas de envio", () => {
  const casos: [
    string,
    ApiErrorT | Error,
    "recusada" | "desconhecido" | "conflito_chave",
    boolean,
  ][] = [
    ["503 integração não configurada", erroApi(503, "WHATSAPP_NOT_CONFIGURED"), "recusada", true],
    ["422 contato bloqueado", erroApi(422, "WHATSAPP_CONTATO_BLOQUEADO"), "recusada", false],
    ["422 modelo indisponível", erroApi(422, "WHATSAPP_TEMPLATE_INDISPONIVEL"), "recusada", true],
    [
      "409 já recebeu a campanha no ano",
      erroApi(409, "WHATSAPP_JA_ENVIADA_CAMPANHA"),
      "recusada",
      false,
    ],
    [
      "409 chave usada para outro pedido",
      erroApi(409, "WHATSAPP_IDEMPOTENCIA_CONFLITO"),
      "conflito_chave",
      false,
    ],
    ["400 telefone inválido", erroApi(400, "WHATSAPP_INVALID_NUMBER"), "recusada", false],
    ["404 cliente não encontrado", erroApi(404, "NOT_FOUND"), "recusada", false],
    ["429 limite de envios", erroApi(429, "TOO_MANY_REQUESTS", "x", 7), "recusada", true],
    ["401 sessão", erroApi(401, "UNAUTHORIZED"), "recusada", true],
    ["sessão encerrada localmente", erroApi(401, "SESSAO_ENCERRADA"), "recusada", true],
    ["408 timeout do cliente", erroApi(408, "TIMEOUT"), "desconhecido", true],
    ["falha de rede", erroApi(0, "NETWORK_ERROR"), "desconhecido", true],
    ["500", erroApi(500, "INTERNAL_ERROR"), "desconhecido", true],
    ["502 do proxy", erroApi(502, "HTTP_ERROR"), "desconhecido", true],
    ["503 sem código de negócio", erroApi(503, "HTTP_ERROR"), "desconhecido", true],
    ["504 do provedor", erroApi(504, "WHATSAPP_TIMEOUT"), "desconhecido", true],
    ["erro que não é da API", new Error("inesperado"), "desconhecido", true],
  ];
  for (const [nome, erro, tipo, interrompe] of casos) {
    test(`${nome} → ${tipo}${interrompe ? " (pausa a campanha)" : ""}`, () => {
      const f = envio.classificarFalhaEnvio(erro);
      expect(f.tipo).toBe(tipo);
      expect(f.interrompeCampanha).toBe(interrompe);
    });
  }

  test("429 informa a espera do Retry-After; desconhecido nunca sugere nova chave", () => {
    expect(
      envio.classificarFalhaEnvio(erroApi(429, "TOO_MANY_REQUESTS", "x", 7)).mensagem,
    ).toContain("7 s");
    const d = envio.classificarFalhaEnvio(erroApi(408, "TIMEOUT"));
    expect(d.mensagem).toContain("NÃO será reenviada automaticamente");
    expect(d.mensagem).toContain("MESMA solicitação");
  });
});

// ─── 3. Registro local da chave (envio sem confirmação) ──────────────────────────────────────────────────────────────

describe("registro local do envio sem confirmação", () => {
  test("grava e lê o MESMO pedido; só o necessário (sem telefone, nome ou texto)", () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(
      CLIENTE,
      "aniversario_v1",
      null,
      () => CHAVE,
      () => new Date("2026-11-24T12:00:00Z"),
    );
    expect(envio.gravarEnvioPendente(p, () => s)).toBe(true);
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toEqual(p);
    expect(
      Object.keys(JSON.parse(s.getItem(envio.PREFIXO_ENVIO_PENDENTE + CLIENTE) ?? "{}")).sort(),
    ).toEqual(["campanha", "clienteId", "criadoEm", "idempotencyKey", "template", "versao"]);
    expect(envio.payloadDoPendente(p)).toEqual({
      idempotencyKey: CHAVE,
      destinatario: { tipo: "CLIENTE", id: CLIENTE },
      template: "aniversario_v1",
    });
    expect(envio.payloadDoPendente({ ...p, campanha: "ANIVERSARIO" }).campanha).toEqual({
      tipo: "ANIVERSARIO",
    });
  });

  test("registro corrompido, de outro cliente ou com chave inválida é ignorado; armazenamento indisponível não quebra", () => {
    const s = new StorageMemoria();
    const k = envio.PREFIXO_ENVIO_PENDENTE + CLIENTE;
    const valido = {
      versao: 1,
      clienteId: CLIENTE,
      template: "aniversario_v1",
      campanha: null,
      idempotencyKey: CHAVE,
      criadoEm: "2026-11-24T12:00:00.000Z",
    };
    for (const ruim of [
      "{",
      JSON.stringify({ ...valido, clienteId: CLIENTE_2 }),
      JSON.stringify({ ...valido, idempotencyKey: "nao-e-uuid" }),
      JSON.stringify({ ...valido, versao: 2 }),
      JSON.stringify({ ...valido, campanha: "NATAL" }),
      "x".repeat(2000),
    ]) {
      s.setItem(k, ruim);
      expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
    }
    const quebrado = () => {
      throw new Error("bloqueado");
    };
    expect(envio.lerEnvioPendente(CLIENTE, quebrado)).toBeNull();
    expect(envio.gravarEnvioPendente({ ...valido, versao: 1 } as never, quebrado)).toBe(false);
    expect(() => envio.removerEnvioPendente(CLIENTE, quebrado)).not.toThrow();
  });
});

// ─── 4. Envio de uma intenção e verificação ──────────────────────────────────────────────────────────────────────────

function apiFalsa(o: {
  enviar?: ((
    p: EnviarTemplatePayload,
  ) => Promise<{ mensagem: MensagemWhatsapp; repetida: boolean | null }>)[];
  historico?: MensagemWhatsapp[] | Error;
}) {
  const enviados: EnviarTemplatePayload[] = [];
  const leituras: string[] = [];
  const filaEnviar = [...(o.enviar ?? [])];
  return {
    enviados,
    leituras,
    enviar: (p: EnviarTemplatePayload) => {
      enviados.push(p);
      const f = filaEnviar.shift();
      if (!f) throw new Error("envio não esperado");
      return f(p);
    },
    listarMensagens: async (f: { clienteId: string }) => {
      leituras.push(f.clienteId);
      if (o.historico instanceof Error) throw o.historico;
      return { data: o.historico ?? [] };
    },
  };
}

describe("envio de uma intenção (chave de idempotência)", () => {
  test("o registro é gravado ANTES da requisição e removido com a resposta conclusiva", async () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(CLIENTE, "aniversario_v1", null, () => CHAVE);
    let registroNaHoraDoEnvio: unknown = null;
    const api = apiFalsa({
      enviar: [
        async () => {
          registroNaHoraDoEnvio = envio.lerEnvioPendente(CLIENTE, () => s);
          return { mensagem: mensagem(), repetida: false };
        },
      ],
    });
    const d = await envio.enviarIntencao(api, p, () => s);
    expect(registroNaHoraDoEnvio).toEqual(p);
    expect(d).toMatchObject({ tipo: "registrada", repetida: false });
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
  });

  test("resultado desconhecido MANTÉM o registro; a verificação repete a MESMA chave e o backend devolve 200", async () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(CLIENTE, "aniversario_v1", null, () => CHAVE);
    const api = apiFalsa({
      enviar: [
        async () => {
          throw erroApi(408, "TIMEOUT");
        },
        async () => ({ mensagem: mensagem(), repetida: true }),
      ],
      historico: [],
    });
    const d1 = await envio.enviarIntencao(api, p, () => s);
    expect(d1.tipo === "falha" && d1.falha.tipo).toBe("desconhecido");
    const guardado = envio.lerEnvioPendente(CLIENTE, () => s);
    expect(guardado?.idempotencyKey).toBe(CHAVE);

    const d2 = await envio.verificarEnvioPendente(api, guardado!, () => s);
    expect(d2).toMatchObject({ tipo: "registrada", repetida: true });
    expect(api.enviados.map((e) => e.idempotencyKey)).toEqual([CHAVE, CHAVE]);
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
  });

  test("recusa explícita remove o registro (nada foi gravado no backend)", async () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(CLIENTE, "aniversario_v1", null, () => CHAVE);
    const api = apiFalsa({
      enviar: [async () => Promise.reject(erroApi(422, "WHATSAPP_CONTATO_BLOQUEADO"))],
    });
    const d = await envio.enviarIntencao(api, p, () => s);
    expect(d.tipo === "falha" && d.falha.tipo).toBe("recusada");
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
  });

  test("verificação: a chave já está no histórico → NENHUM novo POST", async () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(CLIENTE, "aniversario_v1", null, () => CHAVE);
    envio.gravarEnvioPendente(p, () => s);
    const api = apiFalsa({
      historico: [mensagem({ idempotencyKey: "outra" }), mensagem({ estado: "entregue" })],
    });
    const d = await envio.verificarEnvioPendente(api, p, () => s);
    expect(d).toMatchObject({ tipo: "encontrada", mensagem: { estado: "entregue" } });
    expect(api.enviados).toEqual([]);
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
  });

  test("verificação: fora do histórico e backend recusa (não configurado) → comprovadamente NÃO enviada", async () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(CLIENTE, "aniversario_v1", null, () => CHAVE);
    envio.gravarEnvioPendente(p, () => s);
    const api = apiFalsa({
      enviar: [async () => Promise.reject(erroApi(503, "WHATSAPP_NOT_CONFIGURED"))],
      historico: [],
    });
    const d = await envio.verificarEnvioPendente(api, p, () => s);
    expect(d.tipo).toBe("nao_enviada");
    expect(api.enviados.map((e) => e.idempotencyKey)).toEqual([CHAVE]);
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
  });

  test("verificação: leitura do histórico falhou → repete a MESMA chave (seguro); continua desconhecido se falhar de novo", async () => {
    const s = new StorageMemoria();
    const p = envio.novoEnvioPendente(CLIENTE, "aniversario_v1", null, () => CHAVE);
    envio.gravarEnvioPendente(p, () => s);
    const api = apiFalsa({
      enviar: [async () => Promise.reject(erroApi(0, "NETWORK_ERROR"))],
      historico: new Error("503"),
    });
    const d = await envio.verificarEnvioPendente(api, p, () => s);
    expect(d.tipo === "falha" && d.falha.tipo).toBe("desconhecido");
    expect(api.enviados.map((e) => e.idempotencyKey)).toEqual([CHAVE]);
    expect(envio.lerEnvioPendente(CLIENTE, () => s)?.idempotencyKey).toBe(CHAVE);
  });
});

// ─── 5. Campanha de aniversário ──────────────────────────────────────────────────────────────────────────────────────

describe("campanha de aniversário", () => {
  const itens = [
    { clienteId: CLIENTE, nome: "Ana" },
    { clienteId: CLIENTE_2, nome: "Bia" },
    { clienteId: CLIENTE_3, nome: "Cris" },
  ];
  let seq = 0;
  const gerarChave = () => `00000000-0000-4000-8000-${String((seq += 1)).padStart(12, "0")}`;
  const ok = async (p: EnviarTemplatePayload) => ({
    mensagem: mensagem({
      destinatario: { tipo: "CLIENTE", id: p.destinatario.id, telefoneMascarado: "****" },
      origem: "CAMPANHA_ANIVERSARIO",
    }),
    repetida: false,
  });

  test("sequencial, uma chave NOVA por cliente, campanha no corpo e intervalo entre envios", async () => {
    const s = new StorageMemoria();
    const esperas: number[] = [];
    const api = apiFalsa({ enviar: [ok, ok, ok] });
    const r = await envio.executarCampanha({
      api,
      itens,
      template: "aniversario_v1",
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async (ms) => void esperas.push(ms),
      storage: () => s,
      gerarChave,
    });
    expect(r.motivo).toBe("concluida");
    expect(api.enviados.map((e) => e.destinatario.id)).toEqual([CLIENTE, CLIENTE_2, CLIENTE_3]);
    expect(new Set(api.enviados.map((e) => e.idempotencyKey)).size).toBe(3);
    expect(
      api.enviados.every(
        (e) => e.campanha?.tipo === "ANIVERSARIO" && e.template === "aniversario_v1",
      ),
    ).toBe(true);
    expect(esperas).toEqual([
      envio.INTERVALO_MINIMO_CAMPANHA_MS,
      envio.INTERVALO_MINIMO_CAMPANHA_MS,
    ]);
    expect(s.length).toBe(0);
  });

  test("interromper: para ANTES do próximo envio; os restantes ficam sem envio", async () => {
    let parar = false;
    const api = apiFalsa({
      enviar: [
        async (p) => {
          parar = true; // o operador clica "Interromper" enquanto o 1º está no ar
          return ok(p);
        },
      ],
    });
    const r = await envio.executarCampanha({
      api,
      itens,
      template: "aniversario_v1",
      deveParar: () => parar,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => new StorageMemoria(),
      gerarChave,
    });
    expect(r.motivo).toBe("interrompida");
    expect(api.enviados).toHaveLength(1);
    expect(r.situacoes[CLIENTE]?.tipo).toBe("registrada");
    expect(r.situacoes[CLIENTE_2]?.tipo).toBe("nao_executado");
    expect(r.situacoes[CLIENTE_3]?.tipo).toBe("nao_executado");
  });

  test("resultado desconhecido PAUSA a campanha (sem repetir); 'já recebeu no ano' e 'bloqueado' seguem para o próximo", async () => {
    const s = new StorageMemoria();
    const api = apiFalsa({
      enviar: [
        async () => Promise.reject(erroApi(409, "WHATSAPP_JA_ENVIADA_CAMPANHA")),
        async () => Promise.reject(erroApi(422, "WHATSAPP_CONTATO_BLOQUEADO")),
        async () => Promise.reject(erroApi(408, "TIMEOUT")),
      ],
    });
    const r = await envio.executarCampanha({
      api,
      itens,
      template: "aniversario_v1",
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => s,
      gerarChave,
    });
    expect(r.motivo).toBe("pausada");
    expect(r.falha?.tipo).toBe("desconhecido");
    expect(api.enviados).toHaveLength(3);
    // Só o desconhecido deixa registro local (a chave dele será reutilizada na verificação).
    expect(envio.lerEnvioPendente(CLIENTE_3, () => s)?.idempotencyKey).toBe(
      api.enviados[2]?.idempotencyKey,
    );
    expect(envio.lerEnvioPendente(CLIENTE, () => s)).toBeNull();
  });

  test("continuar depois de pausa: NÃO reenvia quem já tem desfecho; o desconhecido vira pendência (nunca chave nova)", async () => {
    const s = new StorageMemoria();
    const api1 = apiFalsa({
      enviar: [ok, async () => Promise.reject(erroApi(504, "WHATSAPP_TIMEOUT"))],
    });
    const r1 = await envio.executarCampanha({
      api: api1,
      itens,
      template: "aniversario_v1",
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => s,
      gerarChave,
    });
    expect(r1.motivo).toBe("pausada");
    expect(r1.situacoes[CLIENTE_3]?.tipo).toBe("nao_executado");

    const api2 = apiFalsa({ enviar: [ok] });
    const r2 = await envio.executarCampanha({
      api: api2,
      itens,
      template: "aniversario_v1",
      situacoesIniciais: r1.situacoes,
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => s,
      gerarChave,
    });
    expect(r2.motivo).toBe("concluida");
    expect(api2.enviados.map((e) => e.destinatario.id)).toEqual([CLIENTE_3]);
  });

  test("limite de envios (429) e integração não configurada PAUSAM na hora; ao continuar, o recusado volta com chave nova", async () => {
    const s = new StorageMemoria();
    const api1 = apiFalsa({
      enviar: [async () => Promise.reject(erroApi(503, "WHATSAPP_NOT_CONFIGURED"))],
    });
    const r1 = await envio.executarCampanha({
      api: api1,
      itens,
      template: "aniversario_v1",
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => s,
      gerarChave,
    });
    expect(r1.motivo).toBe("pausada");
    expect(api1.enviados).toHaveLength(1);
    expect(s.length).toBe(0);

    const api2 = apiFalsa({ enviar: [ok, ok, ok] });
    await envio.executarCampanha({
      api: api2,
      itens,
      template: "aniversario_v1",
      situacoesIniciais: r1.situacoes,
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => s,
      gerarChave,
    });
    expect(api2.enviados.map((e) => e.destinatario.id)).toEqual([CLIENTE, CLIENTE_2, CLIENTE_3]);
    expect(api2.enviados[0]?.idempotencyKey).not.toBe(api1.enviados[0]?.idempotencyKey);
  });

  test("cliente com envio anterior sem confirmação é PULADO (nada enviado com chave nova)", async () => {
    const s = new StorageMemoria();
    envio.gravarEnvioPendente(
      envio.novoEnvioPendente(CLIENTE_2, "aniversario_v1", "ANIVERSARIO", () => CHAVE),
      () => s,
    );
    const api = apiFalsa({ enviar: [ok, ok] });
    const r = await envio.executarCampanha({
      api,
      itens,
      template: "aniversario_v1",
      deveParar: () => false,
      aoAtualizar: () => {},
      esperar: async () => {},
      storage: () => s,
      gerarChave,
    });
    expect(api.enviados.map((e) => e.destinatario.id)).toEqual([CLIENTE, CLIENTE_3]);
    expect(r.situacoes[CLIENTE_2]).toMatchObject({
      tipo: "pendencia_anterior",
      pendente: { idempotencyKey: CHAVE },
    });
  });
});

// ─── 6. Regras de apresentação ───────────────────────────────────────────────────────────────────────────────────────

describe("situação da integração, modelos e liberação", () => {
  const t = (
    estadoAprovacao: TemplateWhatsapp["estadoAprovacao"],
    uso: TemplateWhatsapp["usoPermitido"] = ["INDIVIDUAL"],
  ): TemplateWhatsapp => ({
    chave: "m",
    categoria: "MARKETING",
    idioma: "pt_BR",
    usoPermitido: uso,
    previa: "",
    estadoAprovacao,
  });

  test("nunca diz 'conectado': sem confirmação = não confirmada; aprovação confirmada = envio disponível", () => {
    expect(envio.avaliarSituacaoIntegracao([]).tipo).toBe("sem_modelos");
    expect(envio.avaliarSituacaoIntegracao([t("DESCONHECIDO"), t("DESCONHECIDO")]).tipo).toBe(
      "nao_confirmada",
    );
    expect(envio.avaliarSituacaoIntegracao([t("PENDENTE"), t("DESCONHECIDO")]).tipo).toBe(
      "sem_modelo_aprovado",
    );
    expect(envio.avaliarSituacaoIntegracao([t("REJEITADO"), t("APROVADO")]).tipo).toBe(
      "disponivel",
    );
    for (const e of ["DESCONHECIDO", "PENDENTE", "APROVADO"] as const) {
      expect(envio.avaliarSituacaoIntegracao([t(e)]).rotulo.toLowerCase()).not.toContain(
        "conectad",
      );
    }
  });

  test("modelo só disponível com aprovação CONFIRMADA e uso permitido", () => {
    expect(envio.templateDisponivel(t("APROVADO"), "INDIVIDUAL")).toBe(true);
    expect(envio.templateDisponivel(t("APROVADO"), "CAMPANHA_ANIVERSARIO")).toBe(false);
    for (const e of [
      "DESCONHECIDO",
      "PENDENTE",
      "DIVERGENTE",
      "PAUSADO",
      "NAO_ENCONTRADO",
    ] as const) {
      expect(envio.templateDisponivel(t(e), "INDIVIDUAL")).toBe(false);
    }
  });

  test("liberação oferecida só para falha/indeterminada ainda não liberada; rótulos cobrem todos os estados", () => {
    expect(envio.ofereceLiberacao(mensagem({ estado: "falha" }))).toBe(true);
    expect(envio.ofereceLiberacao(mensagem({ estado: "indeterminada" }))).toBe(true);
    expect(
      envio.ofereceLiberacao(mensagem({ estado: "falha", liberacao: { em: "x", motivo: null } })),
    ).toBe(false);
    for (const e of ["pendente", "enviando", "aceita", "entregue", "lida"] as const) {
      expect(envio.ofereceLiberacao(mensagem({ estado: e }))).toBe(false);
      expect(envio.ROTULO_ESTADO_MENSAGEM[e]).toBeTruthy();
    }
    expect(envio.ROTULO_ESTADO_MENSAGEM.indeterminada).toBe("Resultado indeterminado");
  });
});

// ─── 7. Mock API honesta (desenvolvimento sem backend) ───────────────────────────────────────────────────────────────

describe("Mock API do WhatsApp oficial não simula envio", () => {
  registrarMocks();
  const mock = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, params = {}) =>
    handleMockRequest<T>({ method, path, params, body, token: "token-ficticio" });

  test("modelos sem confirmação e envio SEMPRE recusado com WHATSAPP_NOT_CONFIGURED", async () => {
    const { data } = await mock<TemplateWhatsapp[]>("GET", "/integracoes/whatsapp/templates");
    expect(data.every((x) => x.estadoAprovacao === "DESCONHECIDO")).toBe(true);
    expect(envio.avaliarSituacaoIntegracao(data).tipo).toBe("nao_confirmada");
    const cliente = db.clientes[0]!;
    const erro = await mock("POST", "/integracoes/whatsapp/envios", {
      idempotencyKey: CHAVE,
      destinatario: { tipo: "CLIENTE", id: cliente.id },
      template: "aniversario_v1",
    }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiErrorT).code).toBe("WHATSAPP_NOT_CONFIGURED");
    const { data: lista } = await mock<unknown[]>(
      "GET",
      "/integracoes/whatsapp/mensagens",
      undefined,
      { page: 1, limit: 20 },
    );
    expect(lista).toEqual([]);
  });

  test("prévia com o primeiro nome; bloqueio com número mascarado e desbloqueio exigindo motivo", async () => {
    const cliente = db.clientes.find((c) =>
      [10, 11].includes(c.telefone.replace(/\D/g, "").length),
    )!;
    const { data: previa } = await mock<{ texto: string }>(
      "POST",
      "/integracoes/whatsapp/templates/aniversario_v1/previa",
      { clienteId: cliente.id },
    );
    expect(previa.texto).toContain(`Olá, ${cliente.nome.split(" ")[0]}!`);
    const { data: b } = await mock<{ numeroMascarado: string }>(
      "POST",
      `/integracoes/whatsapp/clientes/${cliente.id}/bloqueio`,
      {},
    );
    expect(b.numeroMascarado).toMatch(/\*\*\*\*-\d{4}$/);
    expect(b.numeroMascarado).not.toContain(cliente.telefone.replace(/\D/g, "").slice(2, 6));
    const semMotivo = await mock(
      "DELETE",
      `/integracoes/whatsapp/clientes/${cliente.id}/bloqueio`,
      { motivo: "" },
    ).catch((e: unknown) => e);
    expect((semMotivo as ApiErrorT).code).toBe("VALIDATION_ERROR");
    const { data: s } = await mock<{ bloqueado: boolean }>(
      "DELETE",
      `/integracoes/whatsapp/clientes/${cliente.id}/bloqueio`,
      { motivo: "autorizado" },
    );
    expect(s.bloqueado).toBe(false);
    const { data: historico } = await mock<{ ativo: boolean }[]>(
      "GET",
      "/integracoes/whatsapp/bloqueios",
      undefined,
      { somenteAtivos: "false" },
    );
    expect(historico.some((x) => x.ativo === false)).toBe(true); // o histórico do bloqueio é preservado
  });
});
