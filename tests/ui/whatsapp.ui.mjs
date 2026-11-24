/**
 * Fase 22.8.9.10.6 — testes de INTERFACE do WhatsApp OFICIAL (Meta, envio por modelo) no app real (React, roteador,
 * React Query, cliente HTTP) rodando no Vite local e dirigido pelo Chrome do sistema via Playwright.
 *
 * Executar:  node --test --test-concurrency=1 tests/ui/whatsapp.ui.mjs
 *
 * Isolamento — NENHUMA chamada real: o Vite sobe com `VITE_USE_MOCK_API=false` e `VITE_API_URL` num caminho FICTÍCIO
 * da própria origem; toda a API é atendida por um backend FALSO em memória que imita o contrato do backend (rotas,
 * 201/200 da idempotência, deduplicação da campanha, bloqueios, liberação de reenvio). Qualquer requisição para fora
 * de `localhost` é abortada e reprova o teste. Nada fala com a Meta, nenhuma mensagem é enviada. Dados sintéticos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORTA = Number(process.env.UI_PORT_WHATSAPP ?? 5320);
const BASE = `http://localhost:${PORTA}`;
const PREFIXO_API = "/__api_ficticia__";
const API = `${BASE}${PREFIXO_API}/api/v1`;
const PREFIXO_PENDENTE = "mariela.backoffice.whatsapp-envio-pendente.v1.";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarAte(condicao, descricao, timeout = 15_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (await condicao()) return;
    await dormir(100);
  }
  throw new Error(`Tempo esgotado esperando: ${descricao}`);
}

// ─── Dados fictícios ───────────────────────────────────────────────────────────────────────────────────────────────

const hoje = new Date();
const mmdd = `${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
const ANA = "65f1a2b3c4d5e6f7a8b9c0d1";
const BIA = "65f1a2b3c4d5e6f7a8b9c0d2";
const CRIS = "65f1a2b3c4d5e6f7a8b9c0d3";

function cliente(id, nome, telefone, ano) {
  return {
    id,
    codigo: `CLI-${id.slice(-4)}`,
    nome,
    foto: null,
    telefone,
    dataNascimento: `${ano}-${mmdd}`,
    observacao: "",
    criadoEm: "2025-01-10T12:00:00.000Z",
    atualizadoEm: "2025-01-10T12:00:00.000Z",
    compras: 1,
    totalComprado: 100,
    ultimaCompra: null,
  };
}
const CLIENTES = [
  cliente(ANA, "Ana Fictícia", "83900000001", 1990),
  cliente(BIA, "Bia Fictícia", "83900000002", 1991),
  cliente(CRIS, "Cris Fictícia", "83900000003", 1992),
];
const mascara = (tel) => `+55 ${tel.slice(0, 2)} ${tel[2]}****-${tel.slice(-4)}`;

const PREVIA =
  "Olá, {{1}}! A equipe MARIELA deseja a você um feliz aniversário! Para não receber mais mensagens, responda SAIR.";

// ─── Backend FALSO (contrato do backend, em memória) ─────────────────────────────────────────────────────────────────

function criarBackend() {
  const chamadas = []; // [método, caminho, query, corpo]
  const mensagens = []; // MensagemWhatsapp + _hash
  const bloqueios = [];
  const templates = [
    {
      chave: "aniversario_v1",
      categoria: "MARKETING",
      idioma: "pt_BR",
      usoPermitido: ["INDIVIDUAL", "CAMPANHA_ANIVERSARIO"],
      previa: PREVIA,
      estadoAprovacao: "APROVADO",
    },
    {
      chave: "lembrete_v1",
      categoria: "UTILITY",
      idioma: "pt_BR",
      usoPermitido: ["INDIVIDUAL"],
      previa: "Lembrete {{1}}",
      estadoAprovacao: "PENDENTE",
    },
  ];
  /** Comportamentos das próximas requisições de envio (FIFO): `{ tipo: "erro", status, code, message }`,
   * `{ tipo: "gravar-e-abortar" }` (processa e a resposta se perde), `{ tipo: "abortar" }`. */
  const comportamentosEnvio = [];
  const comportamentosLiberar = [];
  const travas = { envio: null };
  let seq = 0;

  const json = (route, status, corpo) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  const erro = (route, status, code, message) =>
    json(route, status, { statusCode: status, code, message, errors: [] });
  const publica = ({ _hash, ...m }) => m;

  function criarMensagem(corpo) {
    seq += 1;
    const c = CLIENTES.find((x) => x.id === corpo.destinatario.id);
    const agora = new Date().toISOString();
    const m = {
      id: `66000000000000000000${String(seq).padStart(4, "0")}`,
      idempotencyKey: corpo.idempotencyKey,
      destinatario: { tipo: "CLIENTE", id: c.id, telefoneMascarado: mascara(c.telefone) },
      template: { chave: corpo.template, categoria: "MARKETING" },
      estado: "aceita",
      erro: null,
      origem: corpo.campanha ? "CAMPANHA_ANIVERSARIO" : "INDIVIDUAL",
      campanha: corpo.campanha ? { tipo: "ANIVERSARIO", ano: hoje.getFullYear() } : null,
      liberacao: null,
      criadoEm: agora,
      atualizadoEm: agora,
      aceitaEm: agora,
      entregueEm: null,
      lidaEm: null,
      falhaEm: null,
      _hash: JSON.stringify([corpo.destinatario.id, corpo.template, corpo.campanha?.tipo ?? null]),
    };
    mensagens.push(m);
    return m;
  }

  function semearMensagem(extra) {
    const m = criarMensagem({
      idempotencyKey: crypto.randomUUID(),
      destinatario: { tipo: "CLIENTE", id: ANA },
      template: "aniversario_v1",
    });
    Object.assign(m, extra);
    return m;
  }

  async function atender(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === `${PREFIXO_API}/preparar`) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>preparar</title>ok",
      });
    }
    const caminho = url.pathname.slice(`${PREFIXO_API}/api/v1`.length);
    const metodo = req.method();
    const query = Object.fromEntries(url.searchParams.entries());
    const corpo = req.postData() ? JSON.parse(req.postData()) : null;
    chamadas.push([metodo, caminho, query, corpo]);

    if (metodo === "GET" && caminho === "/auth/me") {
      return json(route, 200, {
        data: {
          id: "usr-ficticio",
          codigo: "USR-9999",
          nome: "Admin Fictício",
          email: "admin@ficticio.test",
          tipo: "ADMIN",
          ativo: true,
        },
      });
    }
    if (metodo === "GET" && caminho === "/clientes") return json(route, 200, { data: CLIENTES });
    if (metodo === "GET" && caminho === "/integracoes/whatsapp/templates")
      return json(route, 200, { data: templates });

    let m = caminho.match(/^\/integracoes\/whatsapp\/templates\/([^/]+)\/previa$/);
    if (m && metodo === "POST") {
      const t = templates.find((x) => x.chave === m[1]);
      const c = CLIENTES.find((x) => x.id === corpo.clienteId);
      if (!t || !c) return erro(route, 404, "NOT_FOUND", "Não encontrado.");
      return json(route, 200, { data: { texto: t.previa.replace("{{1}}", c.nome.split(" ")[0]) } });
    }

    if (metodo === "POST" && caminho === "/integracoes/whatsapp/envios") {
      if (travas.envio) await travas.envio;
      const c = comportamentosEnvio.shift();
      if (c?.tipo === "erro") return erro(route, c.status, c.code, c.message ?? "Erro fictício.");
      if (c?.tipo === "abortar") return route.abort("failed");
      const hash = JSON.stringify([
        corpo.destinatario.id,
        corpo.template,
        corpo.campanha?.tipo ?? null,
      ]);
      const existente = mensagens.find((x) => x.idempotencyKey === corpo.idempotencyKey);
      if (existente) {
        if (existente._hash !== hash)
          return erro(
            route,
            409,
            "WHATSAPP_IDEMPOTENCIA_CONFLITO",
            "Chave usada para outra mensagem.",
          );
        return json(route, 200, { data: publica(existente) });
      }
      if (bloqueios.some((b) => b.ativo && b.clienteId === corpo.destinatario.id)) {
        return erro(
          route,
          422,
          "WHATSAPP_CONTATO_BLOQUEADO",
          "Este contato pediu para não receber mensagens de WhatsApp.",
        );
      }
      if (
        corpo.campanha &&
        mensagens.some(
          (x) => x.campanha && x.destinatario.id === corpo.destinatario.id && !x.liberacao,
        )
      ) {
        return erro(
          route,
          409,
          "WHATSAPP_JA_ENVIADA_CAMPANHA",
          "Este cliente já recebeu (ou está recebendo) a mensagem desta campanha neste ano.",
        );
      }
      const nova = criarMensagem(corpo);
      if (c?.tipo === "gravar-e-abortar") return route.abort("failed");
      return json(route, 201, { data: publica(nova) });
    }

    if (metodo === "GET" && caminho === "/integracoes/whatsapp/mensagens") {
      let lista = [...mensagens].reverse();
      if (query.clienteId) lista = lista.filter((x) => x.destinatario.id === query.clienteId);
      if (query.estado) lista = lista.filter((x) => x.estado === query.estado);
      if (query.campanhaAno)
        lista = lista.filter((x) => x.campanha?.ano === Number(query.campanhaAno));
      const page = Number(query.page ?? 1);
      const limit = Number(query.limit ?? 20);
      return json(route, 200, {
        data: lista.slice((page - 1) * limit, page * limit).map(publica),
        meta: { total: lista.length, page, limit, totalPages: Math.ceil(lista.length / limit) },
      });
    }
    m = caminho.match(/^\/integracoes\/whatsapp\/mensagens\/([^/]+)$/);
    if (m && metodo === "GET") {
      const x = mensagens.find((y) => y.id === m[1]);
      return x
        ? json(route, 200, { data: publica(x) })
        : erro(route, 404, "NOT_FOUND", "Mensagem não encontrada.");
    }
    m = caminho.match(/^\/integracoes\/whatsapp\/mensagens\/([^/]+)\/liberar-reenvio$/);
    if (m && metodo === "POST") {
      const c = comportamentosLiberar.shift();
      if (c?.tipo === "erro") return erro(route, c.status, c.code, c.message);
      const x = mensagens.find((y) => y.id === m[1]);
      if (x.estado === "indeterminada" && corpo.confirmoRiscoDeDuplicidade !== true) {
        return erro(route, 400, "VALIDATION_ERROR", "Confirme que entende o risco.");
      }
      x.liberacao = { em: new Date().toISOString(), motivo: corpo.motivo };
      return json(route, 200, { data: publica(x) });
    }

    m = caminho.match(/^\/integracoes\/whatsapp\/clientes\/([^/]+)\/bloqueio$/);
    if (m) {
      const c = CLIENTES.find((x) => x.id === m[1]);
      const ativos = () => bloqueios.filter((b) => b.ativo && b.clienteId === c.id);
      const status = () => ({
        bloqueado: ativos().length > 0,
        telefoneMascarado: mascara(c.telefone),
        bloqueios: ativos(),
      });
      if (metodo === "GET") return json(route, 200, { data: status() });
      if (metodo === "POST") {
        if (ativos()[0]) return json(route, 200, { data: ativos()[0] });
        const b = semearBloqueio(c.id, corpo?.motivo ?? null);
        return json(route, 201, { data: b });
      }
      if (metodo === "DELETE") {
        if (!corpo?.motivo || corpo.motivo.trim().length < 3)
          return erro(route, 400, "VALIDATION_ERROR", "Informe o motivo do desbloqueio.");
        for (const b of ativos())
          Object.assign(b, {
            ativo: false,
            desbloqueadoEm: new Date().toISOString(),
            motivoDesbloqueio: corpo.motivo,
          });
        return json(route, 200, { data: status() });
      }
    }
    if (metodo === "GET" && caminho === "/integracoes/whatsapp/bloqueios") {
      const lista = bloqueios.filter((b) => query.somenteAtivos === "false" || b.ativo);
      return json(route, 200, {
        data: lista,
        meta: { total: lista.length, page: 1, limit: 20, totalPages: 1 },
      });
    }
    m = caminho.match(/^\/integracoes\/whatsapp\/bloqueios\/([^/]+)$/);
    if (m && metodo === "DELETE") {
      const b = bloqueios.find((x) => x.id === m[1]);
      Object.assign(b, {
        ativo: false,
        desbloqueadoEm: new Date().toISOString(),
        motivoDesbloqueio: corpo.motivo,
      });
      return json(route, 200, { data: b });
    }
    return json(route, 200, { data: [] });
  }

  function semearBloqueio(clienteId, motivo = null, extra = {}) {
    const c = CLIENTES.find((x) => x.id === clienteId);
    const b = {
      id: `blq-${bloqueios.length + 1}`,
      numeroMascarado: c ? mascara(c.telefone) : "****9999",
      tipoChave: "E164",
      ativo: true,
      clienteId,
      origem: "ADMIN",
      motivo,
      criadoEm: new Date().toISOString(),
      desbloqueadoEm: null,
      motivoDesbloqueio: null,
      ...extra,
    };
    bloqueios.push(b);
    return b;
  }

  const envios = () =>
    chamadas
      .filter(([mt, c]) => mt === "POST" && c === "/integracoes/whatsapp/envios")
      .map(([, , , b]) => b);
  return {
    chamadas,
    mensagens,
    bloqueios,
    templates,
    comportamentosEnvio,
    comportamentosLiberar,
    travas,
    atender,
    semearMensagem,
    semearBloqueio,
    envios,
  };
}

// ─── Infra: Vite + navegador ───────────────────────────────────────────────────────────────────────────────────────

let servidor;
let navegador;
let saida = "";

before(async () => {
  servidor = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "dev", "--port", String(PORTA), "--strictPort", "--force"],
    {
      env: { ...process.env, VITE_USE_MOCK_API: "false", VITE_API_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  servidor.stdout.on("data", (d) => (saida += d));
  servidor.stderr.on("data", (d) => (saida += d));
  await esperarAte(
    async () => {
      try {
        return (await fetch(`${BASE}/login`)).status < 500;
      } catch {
        return false;
      }
    },
    `Vite em ${BASE}\n${saida}`,
    120_000,
  );
  navegador = await chromium.launch({ channel: "chrome", headless: true });
  // Aquecimento (pré-otimização de dependências do Vite): as duas telas renderizam em duas cargas seguidas.
  let seguidas = 0;
  const limite = Date.now() + 240_000;
  while (seguidas < 2) {
    if (Date.now() > limite) throw new Error(`O Vite não estabilizou.\n${saida}`);
    const s = await novaSessao();
    try {
      await s.abrirClientes();
      await s.pagina.goto(`${BASE}/whatsapp`);
      await s.pagina.getByTestId("situacao-integracao").waitFor({ timeout: 60_000 });
      seguidas += 1;
    } catch {
      seguidas = 0;
    } finally {
      await s.contexto.close();
    }
  }
});

after(async () => {
  await navegador?.close();
  servidor?.kill();
});

async function novaSessao({ local = {} } = {}) {
  const backend = criarBackend();
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 1000 } });
  const externas = [];
  await contexto.route(
    (u) => u.host !== `localhost:${PORTA}`,
    (route) => {
      externas.push(route.request().url());
      return route.abort("blockedbyclient");
    },
  );
  await contexto.route(
    (u) => u.host === `localhost:${PORTA}` && u.pathname.startsWith(PREFIXO_API),
    (r) => backend.atender(r),
  );
  const pagina = await contexto.newPage();
  const errosDePagina = [];
  pagina.on("pageerror", (e) => errosDePagina.push(String(e)));
  await pagina.goto(`${BASE}${PREFIXO_API}/preparar`);
  await pagina.evaluate((registros) => {
    localStorage.setItem("mariela.accessToken", "token-ficticio-de-teste");
    for (const [k, v] of Object.entries(registros)) localStorage.setItem(k, v);
  }, local);
  return {
    backend,
    contexto,
    pagina,
    async abrirClientes() {
      await pagina.goto(`${BASE}/clientes`);
      await pagina
        .getByRole("button", { name: "WhatsApp oficial para Ana Fictícia" })
        .waitFor({ timeout: 60_000 });
    },
    async abrirWhatsapp(aba) {
      await pagina.goto(`${BASE}/whatsapp`);
      await pagina.getByTestId("situacao-integracao").waitFor({ timeout: 60_000 });
      if (aba) await pagina.getByRole("tab", { name: aba }).click();
    },
    async encerrar() {
      const api = externas.filter((u) => /\/api\/|\/auth\/|graph\.facebook|whatsapp/.test(u));
      await contexto.close();
      assert.deepEqual(api, [], "requisição para fora do backend fictício");
      assert.deepEqual(errosDePagina, [], "erro não tratado na página");
    },
  };
}

const dialogo = (p) => p.getByRole("dialog");
async function escolherOpcao(p, rotulo, opcao) {
  await p.getByRole("combobox", { name: rotulo }).click();
  await p.getByRole("option", { name: opcao }).click();
}
async function abrirEnvioOficial(s, nome = "Ana Fictícia") {
  await s.pagina.getByRole("button", { name: `WhatsApp oficial para ${nome}` }).click();
  await dialogo(s.pagina).getByText("WhatsApp oficial", { exact: true }).waitFor();
}
const registroLocal = (p, id) =>
  p.evaluate((k) => localStorage.getItem(k), `${PREFIXO_PENDENTE}${id}`);

// ─── Envio individual ───────────────────────────────────────────────────────────────────────────────────────────────

describe("envio individual por modelo", () => {
  test("modelo → prévia do backend → confirmação → envio com chave UUID v4, sem telefone nem texto; resultado do backend", async () => {
    const s = await novaSessao();
    await s.abrirClientes();
    // Os dois fluxos convivem: o da Evolution continua lá, identificado como legado.
    await s.pagina
      .getByRole("button", {
        name: "Enviar mensagem de WhatsApp para Ana Fictícia (Evolution, legado)",
      })
      .waitFor();
    await abrirEnvioOficial(s);
    const d = dialogo(s.pagina);
    await d.getByRole("combobox", { name: "Modelo de mensagem" }).click();
    // Modelo sem aprovação confirmada não pode ser escolhido.
    assert.equal(
      await s.pagina.getByRole("option", { name: /lembrete_v1/ }).getAttribute("aria-disabled"),
      "true",
    );
    await s.pagina.getByRole("option", { name: /aniversario_v1/ }).click();
    await d.getByTestId("previa-template").waitFor();
    assert.match(await d.getByTestId("previa-template").innerText(), /^Olá, Ana! A equipe MARIELA/);
    const previa = s.backend.chamadas.find(([mt, c]) => mt === "POST" && c.endsWith("/previa"));
    assert.deepEqual(previa[3], { clienteId: ANA });
    assert.equal(s.backend.envios().length, 0, "nada é enviado antes da confirmação");

    // Duplo clique real: um único POST.
    await d.getByRole("button", { name: "Confirmar envio" }).dblclick();
    await d.getByTestId("resultado-envio").waitFor();
    const envios = s.backend.envios();
    assert.equal(envios.length, 1);
    assert.match(envios[0].idempotencyKey, UUID_V4);
    assert.deepEqual(Object.keys(envios[0]).sort(), ["destinatario", "idempotencyKey", "template"]);
    assert.deepEqual(envios[0].destinatario, { tipo: "CLIENTE", id: ANA });
    assert.equal(await d.getByTestId("resultado-envio").getAttribute("data-resultado"), "aceita");
    await d.getByText("Aceita pelo WhatsApp").waitFor();
    await d.getByText("Telefone: +55 83 9****-0001").waitFor();
    assert.equal(
      await registroLocal(s.pagina, ANA),
      null,
      "resposta conclusiva: nenhum registro local",
    );
    await s.encerrar();
  });

  test("resposta perdida: resultado desconhecido; nada repetido sozinho; reabrir mantém o aviso; 'Verificar resultado' usa a MESMA chave", async () => {
    const s = await novaSessao();
    s.backend.comportamentosEnvio.push({ tipo: "gravar-e-abortar" });
    await s.abrirClientes();
    await abrirEnvioOficial(s);
    const d = dialogo(s.pagina);
    await escolherOpcao(s.pagina, "Modelo de mensagem", /aniversario_v1/);
    await d.getByTestId("previa-template").waitFor();
    await d.getByRole("button", { name: "Confirmar envio" }).click();
    await d.getByText("Resultado desconhecido").waitFor();
    await d.getByTestId("aviso-envio-pendente").waitFor();
    assert.equal(
      await d.getByRole("button", { name: "Confirmar envio" }).count(),
      0,
      "sem novo envio com outra chave",
    );
    const chave = s.backend.envios()[0].idempotencyKey;
    assert.equal(JSON.parse(await registroLocal(s.pagina, ANA)).idempotencyKey, chave);
    await dormir(1500);
    assert.equal(s.backend.envios().length, 1, "nenhuma repetição automática");

    // Fecha e reabre (até recarrega a página): o aviso continua e só a verificação é oferecida.
    await d.getByRole("button", { name: "Fechar" }).click();
    await s.pagina.reload();
    await s.pagina
      .getByRole("button", { name: "WhatsApp oficial para Ana Fictícia" })
      .waitFor({ timeout: 60_000 });
    await abrirEnvioOficial(s);
    await dialogo(s.pagina).getByTestId("aviso-envio-pendente").waitFor();
    await dialogo(s.pagina).getByRole("button", { name: "Verificar resultado" }).click();
    await dialogo(s.pagina).getByTestId("resultado-envio").waitFor();
    // A mensagem estava registrada: encontrada pelo histórico, SEM novo POST.
    assert.equal(s.backend.envios().length, 1);
    const leitura = s.backend.chamadas.find(
      ([mt, c, q]) =>
        mt === "GET" && c === "/integracoes/whatsapp/mensagens" && q.clienteId === ANA,
    );
    assert.ok(leitura, "a verificação consulta o histórico do cliente");
    await dialogo(s.pagina).getByText("Esta solicitação já estava registrada").waitFor();
    assert.equal(await registroLocal(s.pagina, ANA), null);
    await s.encerrar();
  });

  test("falha de rede antes de chegar ao backend: a verificação repete com a MESMA chave e o backend cria UMA vez (201)", async () => {
    const s = await novaSessao();
    s.backend.comportamentosEnvio.push({ tipo: "abortar" });
    await s.abrirClientes();
    await abrirEnvioOficial(s);
    const d = dialogo(s.pagina);
    await escolherOpcao(s.pagina, "Modelo de mensagem", /aniversario_v1/);
    await d.getByTestId("previa-template").waitFor();
    await d.getByRole("button", { name: "Confirmar envio" }).click();
    await d.getByText("Resultado desconhecido").waitFor();
    await d.getByRole("button", { name: "Verificar resultado" }).click();
    await d.getByText("Aceita pelo WhatsApp").waitFor();
    const envios = s.backend.envios();
    assert.equal(envios.length, 2);
    assert.equal(envios[0].idempotencyKey, envios[1].idempotencyKey);
    assert.equal(s.backend.mensagens.length, 1);
    await s.encerrar();
  });

  test("recusas do backend: integração não configurada e contato bloqueado — mensagem clara, nada registrado", async () => {
    const s = await novaSessao();
    s.backend.comportamentosEnvio.push({
      tipo: "erro",
      status: 503,
      code: "WHATSAPP_NOT_CONFIGURED",
      message: "Integração de WhatsApp não configurada neste ambiente.",
    });
    await s.abrirClientes();
    await abrirEnvioOficial(s);
    const d = dialogo(s.pagina);
    await escolherOpcao(s.pagina, "Modelo de mensagem", /aniversario_v1/);
    await d.getByTestId("previa-template").waitFor();
    await d.getByRole("button", { name: "Confirmar envio" }).click();
    await d.getByText("Envio recusado — nada foi enviado").waitFor();
    await d.getByText("Integração de WhatsApp não configurada neste ambiente.").waitFor();
    assert.equal(await registroLocal(s.pagina, ANA), null);
    assert.equal(await d.getByRole("button", { name: "Verificar resultado" }).count(), 0);
    await s.encerrar();
  });

  test("contato bloqueado: envio desabilitado; desbloqueio exige motivo e vai pelo contrato (DELETE com motivo)", async () => {
    const s = await novaSessao();
    s.backend.semearBloqueio(BIA, "pediu SAIR");
    await s.abrirClientes();
    await abrirEnvioOficial(s, "Bia Fictícia");
    const d = dialogo(s.pagina);
    await d.getByText("Número +55 83 9****-0002 bloqueado").waitFor();
    await escolherOpcao(s.pagina, "Modelo de mensagem", /aniversario_v1/);
    await d.getByTestId("previa-template").waitFor();
    await d.getByText("Contato bloqueado").waitFor();
    assert.equal(await d.getByRole("button", { name: "Confirmar envio" }).isDisabled(), true);

    await d.getByRole("button", { name: "Desbloquear" }).click();
    const confirmar = d.getByRole("button", { name: "Confirmar desbloqueio" });
    assert.equal(await confirmar.isDisabled(), true, "motivo obrigatório");
    await d.getByLabel("Motivo do desbloqueio").fill("Cliente autorizou de novo");
    await confirmar.click();
    await d.getByText("Número +55 83 9****-0002 sem bloqueio").waitFor();
    const del = s.backend.chamadas.find(
      ([mt, c]) => mt === "DELETE" && c === `/integracoes/whatsapp/clientes/${BIA}/bloqueio`,
    );
    assert.deepEqual(del[3], { motivo: "Cliente autorizou de novo" });
    assert.equal(
      s.backend.bloqueios[0].ativo,
      false,
      "o registro do bloqueio é preservado (inativo)",
    );
    assert.equal(await d.getByRole("button", { name: "Confirmar envio" }).isDisabled(), false);
    assert.equal(s.backend.envios().length, 0);
    await s.encerrar();
  });

  test("bloquear número pela ficha: POST com motivo; o envio passa a ficar desabilitado", async () => {
    const s = await novaSessao();
    await s.abrirClientes();
    await abrirEnvioOficial(s, "Cris Fictícia");
    const d = dialogo(s.pagina);
    await d.getByRole("button", { name: "Bloquear número" }).click();
    await d.getByLabel("Motivo (opcional)").fill("Pediu por telefone");
    await d.getByRole("button", { name: "Confirmar bloqueio" }).click();
    await d.getByText("Número +55 83 9****-0003 bloqueado").waitFor();
    const post = s.backend.chamadas.find(
      ([mt, c]) => mt === "POST" && c === `/integracoes/whatsapp/clientes/${CRIS}/bloqueio`,
    );
    assert.deepEqual(post[3], { motivo: "Pediu por telefone" });
    await s.encerrar();
  });
});

// ─── Situação, histórico, detalhes, liberação, bloqueios ────────────────────────────────────────────────────────────

describe("tela WhatsApp oficial", () => {
  test("situação: sem confirmação do backend = 'Não confirmada'; sem QR Code e sem 'Conectado'; não usa a rota da Evolution", async () => {
    const s = await novaSessao();
    for (const t of s.backend.templates) t.estadoAprovacao = "DESCONHECIDO";
    await s.abrirWhatsapp();
    const badge = s.pagina.getByTestId("situacao-integracao");
    assert.equal(await badge.getAttribute("data-situacao"), "nao_confirmada");
    assert.equal(await s.pagina.locator('img[alt*="QR"]').count(), 0);
    assert.equal(await s.pagina.getByText(/QR Code para conectar/).count(), 0);
    assert.equal(await s.pagina.getByText(/^Conectado$/).count(), 0);
    assert.ok(!s.backend.chamadas.some(([, c]) => c === "/integracoes/whatsapp/status"));

    // Com aprovação confirmada pelo backend: "Envio disponível".
    s.backend.templates[0].estadoAprovacao = "APROVADO";
    await s.pagina.getByRole("button", { name: "Atualizar" }).click();
    await esperarAte(
      async () => (await badge.getAttribute("data-situacao")) === "disponivel",
      "situação disponível",
    );
    await s.encerrar();
  });

  test("histórico: paginação e filtro de estado NO BACKEND; estados exibidos como vieram; telefone mascarado", async () => {
    const s = await novaSessao();
    for (let i = 0; i < 23; i += 1) s.backend.semearMensagem({});
    s.backend.semearMensagem({
      estado: "falha",
      erro: {
        codigo: "SEM_WHATSAPP",
        mensagem: "O número não pode receber mensagens pelo WhatsApp.",
      },
      falhaEm: new Date().toISOString(),
    });
    await s.abrirWhatsapp("Histórico");
    const linhas = s.pagina
      .getByRole("table", { name: "Histórico de mensagens" })
      .locator("tbody tr");
    await esperarAte(async () => (await linhas.count()) === 20, "20 linhas na primeira página");
    await s.pagina.getByText("+55 83 9****-0001").first().waitFor();
    await s.pagina.getByRole("button", { name: "Página 2" }).click();
    await esperarAte(async () => (await linhas.count()) === 4, "4 linhas na segunda página");
    assert.ok(
      s.backend.chamadas.some(
        ([mt, c, q]) =>
          mt === "GET" &&
          c === "/integracoes/whatsapp/mensagens" &&
          q.page === "2" &&
          q.limit === "20",
      ),
    );

    await escolherOpcao(s.pagina, "Filtrar por estado", "Falha");
    await esperarAte(async () => (await linhas.count()) === 1, "só a mensagem com falha");
    const ultima = s.backend.chamadas
      .filter(([mt, c]) => mt === "GET" && c === "/integracoes/whatsapp/mensagens")
      .at(-1);
    assert.equal(ultima[2].estado, "falha");
    assert.equal(ultima[2].page, "1", "filtro novo volta para a página 1");
    assert.equal(
      await linhas.first().locator("[data-estado]").getAttribute("data-estado"),
      "falha",
    );
    await s.encerrar();
  });

  test("detalhes e liberação de reenvio de mensagem INDETERMINADA: advertência, motivo e confirmação explícita; nada é reenviado", async () => {
    const s = await novaSessao();
    const m = s.backend.semearMensagem({
      estado: "indeterminada",
      erro: {
        codigo: "INDETERMINADO",
        mensagem: "Não foi possível confirmar se a mensagem foi enviada.",
      },
      aceitaEm: null,
    });
    s.backend.comportamentosLiberar.push({
      tipo: "erro",
      status: 409,
      code: "WHATSAPP_LIBERACAO_NAO_PERMITIDA",
      message:
        "Aguarde pelo menos 24 horas antes de liberar uma mensagem com resultado indeterminado.",
    });
    await s.abrirWhatsapp("Histórico");
    await s.pagina
      .locator(`[data-mensagem-id="${m.id}"]`)
      .getByRole("button", { name: /Detalhes/ })
      .click();
    const d = dialogo(s.pagina);
    await d.getByTestId("detalhe-mensagem").waitFor();
    await d.getByText("Erro: INDETERMINADO").waitFor();
    await d.getByText("Ana Fictícia").waitFor();
    await d.getByText(/PODE ter sido enviada/).waitFor();
    const liberar = d.getByRole("button", { name: "Liberar reenvio" });
    assert.equal(await liberar.isDisabled(), true);
    await d.getByLabel("Motivo da liberação").fill("Cliente disse que não recebeu");
    assert.equal(await liberar.isDisabled(), true, "indeterminada exige a confirmação do risco");
    await d.getByRole("checkbox", { name: "Confirmo o risco de duplicidade" }).click();
    await liberar.click();
    // A recusa do backend (prazo de 24 h) aparece como veio.
    await s.pagina
      .getByText(
        "Aguarde pelo menos 24 horas antes de liberar uma mensagem com resultado indeterminado.",
      )
      .waitFor();
    await liberar.click();
    await d.getByText(/Reenvio liberado em/).waitFor();
    const posts = s.backend.chamadas.filter(
      ([mt, c]) => mt === "POST" && c.endsWith("/liberar-reenvio"),
    );
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[1][3], {
      motivo: "Cliente disse que não recebeu",
      confirmoRiscoDeDuplicidade: true,
    });
    assert.equal(s.backend.envios().length, 0, "liberar não reenvia nada");
    await s.encerrar();
  });

  test("bloqueios: números mascarados, origem e motivo; desbloqueio por id com motivo; histórico preservado", async () => {
    const s = await novaSessao();
    s.backend.semearBloqueio(null, null, {
      numeroMascarado: "****4321",
      tipoChave: "WAID",
      origem: "PALAVRA_CHAVE",
    });
    s.backend.semearBloqueio(ANA, "pediu");
    await s.abrirWhatsapp("Bloqueios");
    const tabela = s.pagina.getByRole("table", { name: "Bloqueios de WhatsApp" });
    await tabela.getByText("****4321").waitFor();
    await tabela.getByText("Pedido do contato (palavra-chave)").waitFor();
    await tabela.getByText("Sem cliente associado").waitFor();
    await tabela.getByText("Ana Fictícia").waitFor();
    await s.pagina.getByRole("button", { name: "Desbloquear ****4321" }).click();
    const d = dialogo(s.pagina);
    const confirmar = d.getByRole("button", { name: "Confirmar desbloqueio" });
    assert.equal(await confirmar.isDisabled(), true);
    await d.getByLabel("Motivo do desbloqueio").fill("Contato pediu para voltar");
    await confirmar.click();
    await esperarAte(
      async () => (await tabela.locator("tbody tr").count()) === 1,
      "só o bloqueio ativo restante",
    );
    const del = s.backend.chamadas.find(
      ([mt, c]) => mt === "DELETE" && c === "/integracoes/whatsapp/bloqueios/blq-1",
    );
    assert.deepEqual(del[3], { motivo: "Contato pediu para voltar" });
    await s.pagina.getByLabel("Mostrar também bloqueios removidos").click();
    await tabela.getByText("Removido").waitFor();
    await s.encerrar();
  });
});

// ─── Campanha de aniversário ────────────────────────────────────────────────────────────────────────────────────────

async function prepararCampanha(s) {
  await s.abrirClientes();
  await s.pagina.getByRole("button", { name: "Campanha de aniversário (oficial)" }).click();
  const d = dialogo(s.pagina);
  await d.getByRole("checkbox", { name: "Selecionar todos" }).click();
  await d.getByTestId("previa-campanha").waitFor();
  assert.equal(s.backend.envios().length, 0, "seleção e prévia não enviam nada");
  await d.getByRole("button", { name: "Revisar envio (3)" }).click();
  const iniciar = d.getByRole("button", { name: "Iniciar campanha (3)" });
  assert.equal(await iniciar.isDisabled(), true, "exige a confirmação de opt-in");
  await d.getByRole("checkbox", { name: "Confirmo o opt-in" }).click();
  return { d, iniciar };
}

describe("campanha de aniversário", () => {
  test("prévia, confirmação explícita, envio sequencial com chave por cliente; 'já recebeu no ano' aparece como recusa", async () => {
    const s = await novaSessao();
    s.backend.semearMensagem({
      campanha: { tipo: "ANIVERSARIO", ano: hoje.getFullYear() },
      origem: "CAMPANHA_ANIVERSARIO",
      destinatario: { tipo: "CLIENTE", id: BIA, telefoneMascarado: "x" },
    });
    const { d, iniciar } = await prepararCampanha(s);
    await iniciar.click();
    await d.getByTestId("fim-campanha").waitFor({ timeout: 20_000 });
    await d.getByText("Campanha concluída").waitFor();
    const envios = s.backend.envios();
    assert.deepEqual(
      envios.map((e) => e.destinatario.id),
      [ANA, BIA, CRIS],
    );
    assert.equal(new Set(envios.map((e) => e.idempotencyKey)).size, 3);
    assert.ok(
      envios.every((e) => e.campanha?.tipo === "ANIVERSARIO" && UUID_V4.test(e.idempotencyKey)),
    );
    assert.equal(
      await d.locator(`[data-cliente-id="${BIA}"]`).getAttribute("data-situacao"),
      "falha",
    );
    await d
      .locator(`[data-cliente-id="${BIA}"]`)
      .getByText(/já recebeu/)
      .waitFor();
    await d.getByTestId("progresso-campanha").getByText("3 de 3 com resultado").waitFor();
    await s.encerrar();
  });

  test("interromper: o envio em andamento termina e nenhum outro é feito", async () => {
    const s = await novaSessao();
    let liberar;
    s.backend.travas.envio = new Promise((r) => (liberar = r));
    const { d, iniciar } = await prepararCampanha(s);
    await iniciar.click();
    await esperarAte(async () => s.backend.envios().length === 1, "primeiro envio no ar");
    await d.getByRole("button", { name: "Interromper" }).click();
    // Fechar no meio da campanha não é permitido.
    await s.pagina.keyboard.press("Escape");
    assert.equal(await d.count(), 1);
    liberar();
    s.backend.travas.envio = null;
    await d.getByText("Campanha interrompida").waitFor({ timeout: 20_000 });
    await dormir(1500);
    assert.equal(s.backend.envios().length, 1);
    assert.equal(
      await d.locator(`[data-cliente-id="${CRIS}"]`).getAttribute("data-situacao"),
      "nao_executado",
    );
    await s.encerrar();
  });

  test("resultado desconhecido PAUSA a campanha; nada é repetido sozinho", async () => {
    const s = await novaSessao();
    s.backend.comportamentosEnvio.push({ tipo: "gravar-e-abortar" });
    const { d, iniciar } = await prepararCampanha(s);
    await iniciar.click();
    await d.getByText("Campanha pausada").waitFor({ timeout: 20_000 });
    await dormir(1500);
    assert.equal(s.backend.envios().length, 1);
    assert.equal(
      await d.locator(`[data-cliente-id="${ANA}"]`).getAttribute("data-situacao"),
      "falha",
    );
    assert.ok(
      await registroLocal(s.pagina, ANA),
      "a chave do envio desconhecido fica guardada para verificação",
    );
    // Continuar (por decisão do operador) segue com os outros e NÃO reenvia o desconhecido com chave nova.
    await d.getByRole("button", { name: /Continuar com os restantes/ }).click();
    await d.getByText("Campanha concluída").waitFor({ timeout: 20_000 });
    assert.deepEqual(
      s.backend.envios().map((e) => e.destinatario.id),
      [ANA, BIA, CRIS],
    );
    await s.encerrar();
  });
});

// ─── Regressão: fluxo da Evolution e cadastros ───────────────────────────────────────────────────────────────────────

describe("regressão", () => {
  test("Evolution continua: o botão legado abre o diálogo antigo (texto livre) e não chama o fluxo oficial", async () => {
    const s = await novaSessao();
    await s.abrirClientes();
    await s.pagina
      .getByRole("button", {
        name: "Enviar mensagem de WhatsApp para Ana Fictícia (Evolution, legado)",
      })
      .click();
    await dialogo(s.pagina).getByLabel("Mensagem").waitFor();
    assert.ok(!s.backend.chamadas.some(([, c]) => c.startsWith("/integracoes/whatsapp/templates")));
    await dialogo(s.pagina).getByRole("button", { name: "Cancelar" }).click();
    await s.pagina.getByRole("button", { name: "Aniversariantes (Evolution)" }).waitFor();
    await s.encerrar();
  });
});
