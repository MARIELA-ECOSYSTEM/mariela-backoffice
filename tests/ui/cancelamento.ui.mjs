/**
 * Fase 22.5.3 — testes de INTERFACE integrados do cancelamento/devolução (página + diálogo + módulo
 * `src/utils/operacao-cancelamento.ts`), no app real (React, roteador, React Query, cliente HTTP) rodando no Vite local
 * e dirigido pelo Chrome do sistema via Playwright (já instalado — sem dependência nova).
 *
 * Executar:  node --test --test-concurrency=1 tests/ui/cancelamento.ui.mjs
 *   (opcional) SHOT_DIR=<pasta> para salvar as capturas da validação visual.
 *
 * Isolamento — NENHUMA chamada real:
 *   - O Vite sobe com `VITE_USE_MOCK_API=false` e `VITE_API_URL` apontando para um caminho FICTÍCIO na mesma origem
 *     (`/__api_ficticia__/api/v1`). Variáveis de processo têm precedência sobre `.env`/`.env.local` (não lidos nem
 *     alterados).
 *   - Toda requisição a esse caminho é atendida por um backend FALSO em memória (abaixo), com dados fictícios, que
 *     imita o contrato de idempotência da Fase 22.4 (mesma chave + mesma assinatura → replay; mesma chave + conteúdo
 *     diferente → 409).
 *   - Toda requisição para fora de `localhost:<porta>` é ABORTADA e registrada; cada teste falha se alguma delas parecer
 *     uma chamada de API.
 *
 * Nome sem `.test.` de propósito: `bun test tests/unit` (Fase 22.5.2) não deve tentar rodar este arquivo.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORTA = Number(process.env.UI_PORT ?? 5317);
const BASE = `http://localhost:${PORTA}`;
const PREFIXO_API_FICTICIA = "/__api_ficticia__";
const API = `${BASE}${PREFIXO_API_FICTICIA}/api/v1`;
const PREFIXO_REGISTRO = "mariela.backoffice.cancelamento-incerto.v1.";
const SHOT_DIR = process.env.SHOT_DIR ?? null;

const VENDA_A = "venda-ficticia-a";
const VENDA_B = "venda-ficticia-b";
const CHAVE_ORIGINAL = "chave-original-ficticia-0001";

const MSG_INCERTA = "Não foi possível confirmar se a operação foi registrada";
const MSG_AVISO_INCERTA = "Há uma operação anterior cuja confirmação não foi obtida";
const MSG_AVISO_INVALIDA = "Foi encontrado um registro de operação anterior sem confirmação";
const MSG_BLOQUEIO = "Há uma operação anterior desta venda sem confirmação";
const MSG_SEM_PERSISTENCIA = "Não foi possível guardar esta proteção no navegador";

// ─── Utilitários ───────────────────────────────────────────────────────────────────────────────────────────────────

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarAte(condicao, descricao, timeout = 10_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (await condicao()) return;
    await dormir(100);
  }
  throw new Error(`Tempo esgotado esperando: ${descricao}`);
}

/** Mesma forma canônica do módulo real (tipo + itens ordenados; motivo fora). */
function assinaturaDe(corpo) {
  const itens =
    corpo.tipo === "integral"
      ? []
      : (corpo.itens ?? [])
          .map(({ itemId, quantidade }) => ({ itemId, quantidade }))
          .sort((a, b) => a.itemId.localeCompare(b.itemId));
  return JSON.stringify({ tipo: corpo.tipo, itens });
}

const OP_PARCIAL_ITEM1 = { tipo: "parcial", itens: [{ itemId: "item-1", quantidade: 1 }] };
const OP_PARCIAL_ITEM2 = { tipo: "parcial", itens: [{ itemId: "item-2", quantidade: 1 }] };
const OP_PARCIAL_ITEM1_Q2 = { tipo: "parcial", itens: [{ itemId: "item-1", quantidade: 2 }] };
const OP_INTEGRAL = { tipo: "integral" };

function registroValido(vendaId, operacao = OP_PARCIAL_ITEM1, chave = CHAVE_ORIGINAL) {
  return JSON.stringify({
    versao: 1,
    vendaId,
    chave,
    assinatura: assinaturaDe(operacao),
    incertaDesde: "2026-11-12T15:30:00.000Z",
  });
}

// ─── Dados fictícios ───────────────────────────────────────────────────────────────────────────────────────────────

const NOMES = { "item-1": "Blusa Fictícia", "item-2": "Saia Fictícia" };

function novaVenda(id, codigo) {
  const agora = "2026-11-10T14:00:00.000Z";
  return {
    id,
    codigo,
    numero: codigo.replace(/\D/g, ""),
    dataVenda: agora,
    clienteId: null,
    clienteNome: "Cliente Fictício",
    vendedorId: null,
    vendedorNome: "Vendedora Fictícia",
    caixaId: null,
    caixaCodigo: "CX-TESTE",
    totalItens: 4,
    valorBruto: 450,
    descontoPromocional: 0,
    descontoVenda: 0,
    descontoTotal: 0,
    valorFinal: 450,
    valorPago: 450,
    valorPendente: 0,
    valorDevolvido: 0,
    temPromocao: false,
    temDesconto: false,
    formaPagamento: "Pix",
    totalParcelas: 1,
    parcelasPagas: 1,
    status: "concluida",
    observacao: "",
    itens: [item("item-1", 3, 100), item("item-2", 1, 150)],
    pagamentos: [{ id: "pag-1", forma: "Pix", valor: 450, dataPagamento: agora, parcelas: 1 }],
    parcelas: [],
    historico: [
      {
        dataHora: agora,
        tipo: "criacao",
        descricao: "Venda criada (dados fictícios)",
        autor: "Teste",
      },
    ],
    cancelamentos: [],
  };
  function item(itemId, quantidade, preco) {
    return {
      id: itemId,
      produtoId: `prod-${itemId}`,
      codProduto: `PRD-${itemId}`,
      nome: NOMES[itemId],
      categoria: "Teste",
      varianteId: null,
      codVariante: null,
      cor: null,
      tamanho: "M",
      foto: null,
      quantidade,
      precoOriginal: preco,
      precoPraticado: preco,
      emPromocao: false,
      descontoItem: 0,
      subtotal: preco * quantidade,
      quantidadeDevolvida: 0,
    };
  }
}

// ─── Backend FALSO (em memória) ────────────────────────────────────────────────────────────────────────────────────

function criarBackend() {
  const vendas = new Map([
    [VENDA_A, novaVenda(VENDA_A, "VEN-9001")],
    [VENDA_B, novaVenda(VENDA_B, "VEN-9002")],
  ]);
  const chaves = new Map(); // idempotencyKey → { vendaId, assinatura }
  const posts = []; // { vendaId, corpo }
  const getsVenda = new Map(); // vendaId → nº de GET
  /** Comportamentos das próximas requisições de cancelamento (FIFO); vazio ⇒ "normal". */
  const comportamentos = [];

  /** Aplica a operação como o backend real faria (inclui replay e 409 por idempotência). */
  function processar(vendaId, corpo) {
    const venda = vendas.get(vendaId);
    const assinatura = assinaturaDe(corpo);
    const existente = chaves.get(corpo.idempotencyKey);
    if (existente) {
      if (existente.vendaId === vendaId && existente.assinatura === assinatura) {
        return { status: 201, corpo: { data: comResumo(venda) }, replay: true };
      }
      return erroJson(409, "IDEMPOTENCY_CONFLICT", "Chave reutilizada com conteúdo diferente.");
    }
    if (venda.status === "cancelada")
      return erroJson(400, "VENDA_CANCELADA", "Venda já cancelada.");
    const itens =
      corpo.tipo === "integral"
        ? venda.itens
            .filter((i) => i.quantidade - i.quantidadeDevolvida > 0)
            .map((i) => ({ itemId: i.id, quantidade: i.quantidade - i.quantidadeDevolvida }))
        : corpo.itens;
    for (const { itemId, quantidade } of itens) {
      const i = venda.itens.find((x) => x.id === itemId);
      if (!i || quantidade > i.quantidade - i.quantidadeDevolvida) {
        return erroJson(400, "VALIDATION_ERROR", "Quantidade a devolver inválida.");
      }
    }
    registrar(venda, corpo, itens);
    chaves.set(corpo.idempotencyKey, { vendaId, assinatura });
    return { status: 201, corpo: { data: comResumo(venda) }, replay: false };
  }

  function registrar(venda, corpo, itens) {
    const dataHora = new Date().toISOString();
    let valor = 0;
    const devolvidos = itens.map(({ itemId, quantidade }) => {
      const i = venda.itens.find((x) => x.id === itemId);
      i.quantidadeDevolvida += quantidade;
      valor += i.precoPraticado * quantidade;
      return {
        itemId,
        nome: i.nome,
        quantidade,
        valor: i.precoPraticado * quantidade,
        restaurado: true,
      };
    });
    venda.valorDevolvido += valor;
    venda.cancelamentos.push({
      id: `canc-${venda.cancelamentos.length + 1}`,
      tipo: corpo.tipo,
      motivo: corpo.motivo,
      dataHora,
      autor: "Admin Fictício",
      valorDevolvido: valor,
      itens: devolvidos,
      idempotencyKey: corpo.idempotencyKey,
    });
    venda.historico.push({
      dataHora,
      tipo: corpo.tipo === "integral" ? "cancelamento" : "devolucao",
      descricao: `${corpo.tipo === "integral" ? "Cancelamento" : "Devolução parcial"} (${corpo.motivo})`,
      autor: "Admin Fictício",
    });
    if (corpo.tipo === "integral") venda.status = "cancelada";
  }

  function comResumo(venda) {
    return {
      ...venda,
      restauracaoEstoque: {
        status: "concluida",
        totalItens: 1,
        concluidos: 1,
        pendentes: 0,
        emFalhaRecuperavel: 0,
        requerIntervencao: 0,
        proximaTentativaEm: null,
      },
    };
  }

  function erroJson(status, code, message) {
    return { status, corpo: { statusCode: status, code, message } };
  }

  async function responder(route, { status, corpo, html }) {
    await route.fulfill({
      status,
      contentType: html ? "text/html" : "application/json",
      body: html ?? JSON.stringify(corpo),
    });
  }

  async function atender(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === `${PREFIXO_API_FICTICIA}/preparar`) {
      return responder(route, { status: 200, html: "<!doctype html><title>preparar</title>ok" });
    }
    const caminho = url.pathname.slice(`${PREFIXO_API_FICTICIA}/api/v1`.length);
    const metodo = req.method();

    if (metodo === "GET" && caminho === "/auth/me") {
      return responder(route, {
        status: 200,
        corpo: {
          data: {
            id: "usr-ficticio",
            codigo: "USR-9999",
            nome: "Admin Fictício",
            email: "admin@ficticio.test",
            tipo: "ADMIN",
            ativo: true,
          },
        },
      });
    }
    if (metodo === "POST" && caminho === "/auth/logout") {
      return responder(route, { status: 200, corpo: { data: null } });
    }
    let m = caminho.match(/^\/vendas\/([^/]+)$/);
    if (metodo === "GET" && m) {
      const venda = vendas.get(m[1]);
      getsVenda.set(m[1], (getsVenda.get(m[1]) ?? 0) + 1);
      return venda
        ? responder(route, { status: 200, corpo: { data: venda } })
        : responder(route, erroJson(404, "NOT_FOUND", "Venda não encontrada."));
    }
    m = caminho.match(/^\/vendas\/([^/]+)\/cancelamento$/);
    if (metodo === "POST" && m) {
      const vendaId = m[1];
      const corpo = JSON.parse(req.postData() ?? "{}");
      posts.push({ vendaId, corpo });
      const c = comportamentos.shift() ?? { tipo: "normal" };
      switch (c.tipo) {
        case "normal":
          return responder(route, processar(vendaId, corpo));
        case "erro": // erro definitivo devolvido pelo backend, SEM registrar
          return responder(route, erroJson(c.status, c.code, c.message));
        case "registrar-e-gateway": // backend gravou, mas o gateway devolveu 502/503/504 (corpo HTML)
          processar(vendaId, corpo);
          return responder(route, {
            status: c.status,
            html: `<html><body>${c.status}</body></html>`,
          });
        case "abortar": // falha de rede antes de chegar ao backend
          return route.abort("failed");
        case "registrar-e-travar": // backend gravou, resposta nunca chega → TIMEOUT no cliente (15 s)
          processar(vendaId, corpo);
          await dormir(25_000);
          return route.abort("timedout").catch(() => {});
        default:
          throw new Error(`comportamento desconhecido: ${c.tipo}`);
      }
    }
    // Qualquer outra rota da API fictícia: resposta vazia, registrada para diagnóstico.
    naoPrevistas.push(`${metodo} ${caminho}`);
    return responder(route, { status: 200, corpo: { data: [] } });
  }

  const naoPrevistas = [];
  return { vendas, chaves, posts, getsVenda, comportamentos, naoPrevistas, atender };
}

// ─── Infra: Vite + navegador ───────────────────────────────────────────────────────────────────────────────────────

let servidor;
let navegador;
let saidaServidor = "";

before(async () => {
  servidor = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "dev", "--port", String(PORTA), "--strictPort"],
    {
      env: {
        ...process.env,
        VITE_USE_MOCK_API: "false",
        VITE_API_URL: API,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  servidor.stdout.on("data", (d) => (saidaServidor += d));
  servidor.stderr.on("data", (d) => (saidaServidor += d));
  await esperarAte(
    async () => {
      try {
        const r = await fetch(`${BASE}/login`);
        return r.status < 500;
      } catch {
        return false;
      }
    },
    `Vite em ${BASE}\n${saidaServidor}`,
    120_000,
  );
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => {
  await navegador?.close();
  servidor?.kill();
});

/** Novo contexto (aba limpa) com o backend falso e a trava contra requisições externas. */
async function novaSessao({
  viewport,
  sessionStorage: registros = {},
  armazenamentoQueFalha = false,
} = {}) {
  const backend = criarBackend();
  const contexto = await navegador.newContext({
    viewport: viewport ?? { width: 1366, height: 900 },
  });
  const externas = [];
  await contexto.route(
    (url) => url.host !== `localhost:${PORTA}`,
    (route) => {
      externas.push(route.request().url());
      return route.abort("blockedbyclient");
    },
  );
  await contexto.route(
    (url) => url.host === `localhost:${PORTA}` && url.pathname.startsWith(PREFIXO_API_FICTICIA),
    (route) => backend.atender(route),
  );
  if (armazenamentoQueFalha) {
    // sessionStorage inacessível SOMENTE para os registros de operação incerta (o resto do app segue normal).
    await contexto.addInitScript((prefixo) => {
      for (const metodo of ["getItem", "setItem", "removeItem"]) {
        const original = Storage.prototype[metodo];
        Storage.prototype[metodo] = function (chave, ...resto) {
          if (this === window.sessionStorage && String(chave).startsWith(prefixo)) {
            throw new DOMException("bloqueado (teste)", "SecurityError");
          }
          return original.call(this, chave, ...resto);
        };
      }
    }, PREFIXO_REGISTRO);
  }
  const pagina = await contexto.newPage();
  const errosDePagina = [];
  pagina.on("pageerror", (e) => errosDePagina.push(String(e)));

  // Prepara a origem: sessão fictícia (token) e, se pedido, registros no sessionStorage — antes de abrir o app.
  await pagina.goto(`${BASE}${PREFIXO_API_FICTICIA}/preparar`);
  await pagina.evaluate(
    ({ registros }) => {
      localStorage.setItem("mariela.accessToken", "token-ficticio-de-teste");
      for (const [chave, valor] of Object.entries(registros)) sessionStorage.setItem(chave, valor);
    },
    { registros },
  );

  return {
    backend,
    contexto,
    pagina,
    externas,
    errosDePagina,
    async abrirVenda(vendaId) {
      await pagina.goto(`${BASE}/vendas/${vendaId}`);
      await pagina.getByText("Itens da venda").waitFor({ timeout: 60_000 });
    },
    async recarregar() {
      await pagina.reload();
      await pagina.getByText("Itens da venda").waitFor({ timeout: 60_000 });
    },
    registro(vendaId) {
      return pagina.evaluate((k) => {
        try {
          return sessionStorage.getItem(k);
        } catch {
          return "<<inacessível>>";
        }
      }, PREFIXO_REGISTRO + vendaId);
    },
    async encerrar() {
      const apiExterna = externas.filter((u) => /\/api\/|\/auth\/|\/vendas/.test(u));
      await contexto.close();
      assert.deepEqual(apiExterna, [], "requisição de API para fora do backend fictício");
      assert.deepEqual(errosDePagina, [], "erro não tratado na página");
    },
  };
}

const dialogo = (pagina) => pagina.getByRole("dialog");

async function abrirDialogo(pagina) {
  await pagina.getByRole("button", { name: "Cancelar / devolver" }).click();
  await dialogo(pagina).waitFor();
}

/** Preenche o diálogo com a operação (tipo/itens/quantidades) e um motivo. */
async function preencher(pagina, operacao, motivo = "Motivo fictício de teste") {
  const d = dialogo(pagina);
  if (operacao.tipo === "parcial") {
    await d.getByRole("button", { name: /Devolução parcial/ }).click();
    for (const { itemId, quantidade } of operacao.itens) {
      await d.locator(`#dev-${itemId}`).click();
      await d.getByLabel(`Quantidade a devolver de ${NOMES[itemId]}`).fill(String(quantidade));
    }
  } else {
    await d.getByRole("button", { name: /Cancelamento integral/ }).click();
  }
  await d.locator("#motivo-cancelamento").fill(motivo);
}

function botaoEnviar(pagina, operacao) {
  return dialogo(pagina).getByRole("button", {
    name: operacao.tipo === "integral" ? "Cancelar venda" : "Devolver itens",
  });
}

async function enviar(pagina, operacao) {
  await botaoEnviar(pagina, operacao).click();
}

async function esperarTexto(pagina, texto, timeout = 10_000) {
  await pagina.getByText(texto).first().waitFor({ timeout });
}

async function semNovasRequisicoes(backend, quantidadeEsperada, ms = 2_000) {
  await dormir(ms);
  assert.equal(
    backend.posts.length,
    quantidadeEsperada,
    "houve requisição automática de cancelamento",
  );
}

// ─── 6.1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.1 abertura normal", () => {
  test("sem registro: nenhum aviso; diálogo abre e o fluxo normal conclui", async () => {
    const s = await novaSessao();
    await s.abrirVenda(VENDA_A);
    assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
    assert.equal(await s.pagina.getByText(MSG_AVISO_INVALIDA).count(), 0);
    await abrirDialogo(s.pagina);
    assert.equal(await dialogo(s.pagina).getByText(MSG_AVISO_INCERTA).count(), 0);
    await preencher(s.pagina, OP_INTEGRAL);
    await enviar(s.pagina, OP_INTEGRAL);
    await esperarTexto(s.pagina, "Venda cancelada.");
    assert.equal(s.backend.posts.length, 1);
    assert.match(s.backend.posts[0].corpo.idempotencyKey, /^[0-9a-f-]{36}$/);
    assert.equal(await s.registro(VENDA_A), null);
    await s.encerrar();
  });
});

// ─── 6.2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.2 recuperação após reload", () => {
  test("registro válido: aviso com a operação pendente, sem requisição automática, persiste em remontagens", async () => {
    const reg = registroValido(VENDA_A);
    const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: reg } });
    await s.abrirVenda(VENDA_A);
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
    await esperarTexto(s.pagina, "Operação pendente: Devolução parcial: 1× Blusa Fictícia.");
    await esperarTexto(s.pagina, "Reenviar exatamente a mesma operação é seguro");
    await semNovasRequisicoes(s.backend, 0);

    // Remontagem 1: reload. Remontagem 2: navegação completa para outra URL e volta.
    await s.recarregar();
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
    await s.abrirVenda(VENDA_B);
    await s.abrirVenda(VENDA_A);
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
    await semNovasRequisicoes(s.backend, 0, 1_000);
    assert.equal(await s.registro(VENDA_A), reg, "o registro foi alterado só por abrir a página");

    // A chave recuperada é a usada no reenvio da mesma operação.
    await abrirDialogo(s.pagina);
    await esperarTexto(dialogo(s.pagina), MSG_AVISO_INCERTA);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "Devolução parcial registrada.");
    assert.equal(s.backend.posts[0].corpo.idempotencyKey, CHAVE_ORIGINAL);
    await s.encerrar();
  });
});

// ─── 6.3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.3 isolamento entre vendas", () => {
  test("operação de A não aparece em B, B usa chave própria e o registro de A fica intacto", async () => {
    const reg = registroValido(VENDA_A);
    const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: reg } });
    await s.abrirVenda(VENDA_B);
    await semNovasRequisicoes(s.backend, 0, 1_000);
    assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
    assert.equal(await s.pagina.getByText(MSG_AVISO_INVALIDA).count(), 0);

    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1); // MESMA assinatura do registro de A
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "Devolução parcial registrada.");
    assert.equal(s.backend.posts.length, 1);
    assert.equal(s.backend.posts[0].vendaId, VENDA_B);
    assert.notEqual(s.backend.posts[0].corpo.idempotencyKey, CHAVE_ORIGINAL);
    assert.equal(await s.registro(VENDA_A), reg);
    assert.equal(await s.registro(VENDA_B), null);
    await s.encerrar();
  });
});

// ─── 6.4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.4 repetição da operação incerta", () => {
  for (const jaRegistrada of [true, false]) {
    test(`mesma assinatura usa a chave original; sucesso limpa aviso e registro (backend ${jaRegistrada ? "já tinha registrado → replay" : "não tinha registrado → registra uma vez"})`, async () => {
      const s = await novaSessao({
        sessionStorage: {
          [PREFIXO_REGISTRO + VENDA_A]: registroValido(VENDA_A),
          [PREFIXO_REGISTRO + VENDA_B]: registroValido(
            VENDA_B,
            OP_INTEGRAL,
            "chave-da-venda-b-0001",
          ),
        },
      });
      if (jaRegistrada) {
        // Estado do backend após a tentativa "perdida": a devolução existe e a chave é conhecida.
        const venda = s.backend.vendas.get(VENDA_A);
        venda.itens[0].quantidadeDevolvida = 1;
        venda.cancelamentos.push({
          id: "canc-1",
          tipo: "parcial",
          motivo: "tentativa perdida",
          dataHora: "2026-11-12T15:30:00.000Z",
          autor: "Admin Fictício",
          valorDevolvido: 100,
          itens: [
            {
              itemId: "item-1",
              nome: "Blusa Fictícia",
              quantidade: 1,
              valor: 100,
              restaurado: true,
            },
          ],
        });
        s.backend.chaves.set(CHAVE_ORIGINAL, {
          vendaId: VENDA_A,
          assinatura: assinaturaDe(OP_PARCIAL_ITEM1),
        });
      }
      await s.abrirVenda(VENDA_A);
      await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1, "motivo diferente do original");
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, "Devolução parcial registrada.");

      assert.equal(s.backend.posts.length, 1);
      assert.equal(s.backend.posts[0].corpo.idempotencyKey, CHAVE_ORIGINAL);
      await semNovasRequisicoes(s.backend, 1);
      assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1, "devolução duplicada");
      assert.equal(await s.registro(VENDA_A), null);
      assert.notEqual(await s.registro(VENDA_B), null, "o registro de outra venda foi apagado");
      await esperarAte(
        async () => (await s.pagina.getByText(MSG_AVISO_INCERTA).count()) === 0,
        "aviso desaparecer",
      );
      await s.encerrar();
    });
  }
});

// ─── 6.5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.5 mudança de tipo, itens ou quantidades", () => {
  test("operação diferente fica bloqueada; registro e chave originais preservados; orientação exibida", async () => {
    const reg = registroValido(VENDA_A);
    const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: reg } });
    await s.abrirVenda(VENDA_A);
    for (const outra of [OP_PARCIAL_ITEM2, OP_PARCIAL_ITEM1_Q2, OP_INTEGRAL]) {
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, outra);
      await enviar(s.pagina, outra);
      await esperarTexto(s.pagina, MSG_BLOQUEIO);
      await esperarTexto(s.pagina, "descarte-a antes de registrar uma operação diferente");
      await s.pagina.keyboard.press("Escape");
      await dialogo(s.pagina).waitFor({ state: "detached" });
    }
    await semNovasRequisicoes(s.backend, 0, 500);
    assert.equal(await s.registro(VENDA_A), reg);

    // A chave original continua sendo a da operação pendente.
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "Devolução parcial registrada.");
    assert.equal(s.backend.posts[0].corpo.idempotencyKey, CHAVE_ORIGINAL);
    await s.encerrar();
  });
});

// ─── 6.6 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.6 erros incertos", () => {
  const casos = [
    ["TIMEOUT (backend gravou, resposta nunca chegou)", { tipo: "registrar-e-travar" }, 30_000],
    ["NETWORK_ERROR (falha antes de chegar ao backend)", { tipo: "abortar" }, 10_000],
    [
      "HTTP 502 (backend gravou, gateway falhou)",
      { tipo: "registrar-e-gateway", status: 502 },
      10_000,
    ],
    [
      "HTTP 503 (backend gravou, gateway falhou)",
      { tipo: "registrar-e-gateway", status: 503 },
      10_000,
    ],
    [
      "HTTP 504 (backend gravou, gateway falhou)",
      { tipo: "registrar-e-gateway", status: 504 },
      10_000,
    ],
  ];
  for (const [nome, comportamento, espera] of casos) {
    test(
      `${nome}: persiste, avisa, invalida, não repete; após remontagem reusa a chave sem duplicar`,
      { timeout: 120_000 },
      async () => {
        const s = await novaSessao();
        await s.abrirVenda(VENDA_A);
        await abrirDialogo(s.pagina);
        await preencher(s.pagina, OP_PARCIAL_ITEM1);
        s.backend.comportamentos.push(comportamento);
        const getsAntes = s.backend.getsVenda.get(VENDA_A) ?? 0;
        await enviar(s.pagina, OP_PARCIAL_ITEM1);
        await esperarTexto(s.pagina, MSG_INCERTA, espera);

        const chave = s.backend.posts[0].corpo.idempotencyKey;
        const reg = JSON.parse(await s.registro(VENDA_A));
        assert.equal(reg.chave, chave);
        assert.equal(reg.assinatura, assinaturaDe(OP_PARCIAL_ITEM1));
        assert.equal(reg.vendaId, VENDA_A);
        assert.deepEqual(Object.keys(reg).sort(), [
          "assinatura",
          "chave",
          "incertaDesde",
          "vendaId",
          "versao",
        ]);
        await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
        await esperarAte(
          async () => (s.backend.getsVenda.get(VENDA_A) ?? 0) > getsAntes,
          "refetch da venda (invalidação)",
        );
        await semNovasRequisicoes(s.backend, 1);

        await s.recarregar();
        await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
        await semNovasRequisicoes(s.backend, 1, 1_000);
        assert.equal(JSON.parse(await s.registro(VENDA_A)).chave, chave);

        await abrirDialogo(s.pagina);
        await preencher(s.pagina, OP_PARCIAL_ITEM1);
        await enviar(s.pagina, OP_PARCIAL_ITEM1);
        await esperarTexto(s.pagina, "Devolução parcial registrada.");
        assert.equal(s.backend.posts.length, 2);
        assert.equal(
          s.backend.posts[1].corpo.idempotencyKey,
          chave,
          "chave nova gerada após remontagem",
        );
        assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1, "devolução duplicada");
        assert.equal(await s.registro(VENDA_A), null);
        await s.encerrar();
      },
    );
  }
});

// ─── 6.7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.7 erros definitivos", () => {
  for (const status of [400, 409, 422]) {
    test(`HTTP ${status}: feedback de erro, nada persistido, sem retry`, async () => {
      const s = await novaSessao();
      await s.abrirVenda(VENDA_A);
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      s.backend.comportamentos.push({
        tipo: "erro",
        status,
        code: "ERRO_FICTICIO",
        message: `Erro fictício ${status}.`,
      });
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, `Erro fictício ${status}.`);
      assert.equal(await s.pagina.getByText(MSG_INCERTA).count(), 0);
      assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
      assert.equal(await s.registro(VENDA_A), null);
      await semNovasRequisicoes(s.backend, 1);
      await s.encerrar();
    });

    test(`HTTP ${status} com operação incerta anterior: o registro e a chave permanecem`, async () => {
      const reg = registroValido(VENDA_A);
      const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: reg } });
      await s.abrirVenda(VENDA_A);
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      s.backend.comportamentos.push({
        tipo: "erro",
        status,
        code: "ERRO_FICTICIO",
        message: `Erro fictício ${status}.`,
      });
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, `Erro fictício ${status}.`);
      assert.equal(s.backend.posts[0].corpo.idempotencyKey, CHAVE_ORIGINAL);
      assert.equal(await s.registro(VENDA_A), reg);
      await esperarTexto(dialogo(s.pagina), MSG_AVISO_INCERTA);
      await semNovasRequisicoes(s.backend, 1);
      await s.encerrar();
    });
  }
});

// ─── 6.8 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.8 registro inválido", () => {
  const casos = [
    ["JSON inválido", "{corrompido"],
    [
      "registro incompatível (versão 2) com chave",
      JSON.stringify({
        versao: 2,
        vendaId: VENDA_A,
        chave: "chave-antiga-incompativel",
        assinatura: assinaturaDe(OP_PARCIAL_ITEM1),
        incertaDesde: "2026-11-12T15:30:00.000Z",
      }),
    ],
  ];
  for (const [nome, valor] of casos) {
    test(`${nome}: tela íntegra, aviso, envio bloqueado até descarte explícito, sem reutilizar chave`, async () => {
      const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: valor } });
      await s.abrirVenda(VENDA_A);
      await esperarTexto(s.pagina, MSG_AVISO_INVALIDA);
      await esperarTexto(s.pagina, "Histórico");
      await esperarTexto(s.pagina, "Venda criada (dados fictícios)");
      await semNovasRequisicoes(s.backend, 0, 1_000);

      await abrirDialogo(s.pagina);
      await esperarTexto(dialogo(s.pagina), MSG_AVISO_INVALIDA);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      assert.equal(
        await botaoEnviar(s.pagina, OP_PARCIAL_ITEM1).isDisabled(),
        true,
        "envio deveria estar bloqueado",
      );
      assert.equal(await s.registro(VENDA_A), valor);

      // Resolução explícita (descarte em duas etapas, dentro do diálogo).
      await dialogo(s.pagina)
        .getByRole("button", { name: "Já conferi o histórico — descartar" })
        .click();
      await dialogo(s.pagina).getByRole("button", { name: "Confirmar descarte" }).click();
      assert.equal(await s.registro(VENDA_A), null);
      assert.equal(await botaoEnviar(s.pagina, OP_PARCIAL_ITEM1).isDisabled(), false);
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, "Devolução parcial registrada.");
      assert.equal(s.backend.posts.length, 1);
      assert.notEqual(s.backend.posts[0].corpo.idempotencyKey, "chave-antiga-incompativel");
      assert.match(s.backend.posts[0].corpo.idempotencyKey, /^[0-9a-f-]{36}$/);
      await s.encerrar();
    });
  }
});

// ─── 6.9 ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.9 descarte em duas etapas", () => {
  test("1ª etapa não apaga; 2ª explica o risco; cancelar mantém; confirmar remove só a venda atual; sem requisição", async () => {
    const regA = registroValido(VENDA_A);
    const regB = registroValido(VENDA_B, OP_INTEGRAL, "chave-da-venda-b-0001");
    const s = await novaSessao({
      sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: regA, [PREFIXO_REGISTRO + VENDA_B]: regB },
    });
    await s.abrirVenda(VENDA_A);
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);

    await s.pagina.getByRole("button", { name: "Já conferi o histórico — descartar" }).click();
    assert.equal(await s.registro(VENDA_A), regA, "1ª etapa apagou o registro");
    await esperarTexto(s.pagina, "uma nova igual será uma segunda devolução");
    await esperarTexto(s.pagina, "Descarte apenas depois de conferir o histórico");

    await s.pagina.getByRole("button", { name: "Manter operação pendente" }).click();
    assert.equal(await s.registro(VENDA_A), regA);
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
    assert.equal(await s.pagina.getByRole("button", { name: "Confirmar descarte" }).count(), 0);

    await s.pagina.getByRole("button", { name: "Já conferi o histórico — descartar" }).click();
    await s.pagina.getByRole("button", { name: "Confirmar descarte" }).click();
    await esperarAte(
      async () => (await s.pagina.getByText(MSG_AVISO_INCERTA).count()) === 0,
      "aviso sumir",
    );
    assert.equal(await s.registro(VENDA_A), null);
    assert.equal(await s.registro(VENDA_B), regB, "registro de outra venda foi removido");
    await semNovasRequisicoes(s.backend, 0, 1_000);
    await s.encerrar();
  });
});

// ─── 6.10 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("6.10 armazenamento indisponível", () => {
  test(
    "tela íntegra; aviso de limitação; proteção em memória ativa; não promete sobreviver a reload",
    { timeout: 120_000 },
    async () => {
      const s = await novaSessao({ armazenamentoQueFalha: true });
      await s.abrirVenda(VENDA_A);
      assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);

      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      s.backend.comportamentos.push({ tipo: "registrar-e-gateway", status: 503 });
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, MSG_INCERTA);
      await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
      await esperarTexto(
        s.pagina,
        `${MSG_SEM_PERSISTENCIA}: ela se perde se você recarregar ou sair desta página.`,
      );
      const chave = s.backend.posts[0].corpo.idempotencyKey;

      // Proteção em memória: operação diferente bloqueada; a mesma reusa a chave (replay, sem duplicar).
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM2);
      await enviar(s.pagina, OP_PARCIAL_ITEM2);
      await esperarTexto(s.pagina, MSG_BLOQUEIO);
      await s.pagina.keyboard.press("Escape");
      await dialogo(s.pagina).waitFor({ state: "detached" });
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, "Devolução parcial registrada.");
      assert.equal(s.backend.posts.length, 2);
      assert.equal(s.backend.posts[1].corpo.idempotencyKey, chave);
      assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);

      // Nova incerteza + reload: a proteção NÃO sobrevive (limitação declarada) e a tela não afirma o contrário.
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM2);
      s.backend.comportamentos.push({ tipo: "abortar" });
      await enviar(s.pagina, OP_PARCIAL_ITEM2);
      await esperarTexto(s.pagina, MSG_SEM_PERSISTENCIA);
      await s.recarregar();
      await semNovasRequisicoes(s.backend, 3, 1_000);
      assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
      assert.equal(await s.pagina.getByText(MSG_AVISO_INVALIDA).count(), 0);
      await s.encerrar();
    },
  );
});

// ─── 7. Validação visual (capturas + checagem automática de overflow) ──────────────────────────────────────────────

describe("7. validação visual local", () => {
  for (const [rotulo, viewport] of [
    ["desktop-1366", { width: 1366, height: 900 }],
    ["mobile-375", { width: 375, height: 812 }],
  ]) {
    test(`capturas e ausência de overflow horizontal (${rotulo})`, async () => {
      const s = await novaSessao({
        viewport,
        sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: registroValido(VENDA_A) },
      });
      const capturar = async (nome) => {
        const larguraDoc = await s.pagina.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(
          larguraDoc <= viewport.width + 1,
          `overflow horizontal em ${nome}: ${larguraDoc}px`,
        );
        if (SHOT_DIR) {
          fs.mkdirSync(SHOT_DIR, { recursive: true });
          await s.pagina.screenshot({
            path: path.join(SHOT_DIR, `${rotulo}-${nome}.png`),
            fullPage: nome === "pagina",
          });
        }
      };
      await s.abrirVenda(VENDA_A);
      await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
      await capturar("pagina");

      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      await capturar("dialogo");
      await dialogo(s.pagina)
        .getByRole("button", { name: "Já conferi o histórico — descartar" })
        .click();
      await capturar("dialogo-confirmar-descarte");
      await s.pagina.keyboard.press("Escape");
      await dialogo(s.pagina).waitFor({ state: "detached" });

      await s.pagina.evaluate(
        (k) => sessionStorage.setItem(k, "{corrompido"),
        PREFIXO_REGISTRO + VENDA_A,
      );
      await s.recarregar();
      await esperarTexto(s.pagina, MSG_AVISO_INVALIDA);
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      assert.equal(await botaoEnviar(s.pagina, OP_PARCIAL_ITEM1).isDisabled(), true);
      await capturar("dialogo-registro-invalido");
      await botaoEnviar(s.pagina, OP_PARCIAL_ITEM1).scrollIntoViewIfNeeded();
      await capturar("dialogo-registro-invalido-botao-bloqueado");
      await s.encerrar();
    });
  }
});
