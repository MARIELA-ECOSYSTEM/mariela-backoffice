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
/** Registros de operação pendente: v2 (gravado desde a Fase 22.6.1) e v1 (legado, ainda lido — usado nos seeds). */
const PREFIXO_BASE_REGISTRO = "mariela.backoffice.cancelamento-incerto.";
const PREFIXO_REGISTRO = `${PREFIXO_BASE_REGISTRO}v1.`;
const PREFIXO_REGISTRO_V2 = `${PREFIXO_BASE_REGISTRO}v2.`;
const SHOT_DIR = process.env.SHOT_DIR ?? null;

const VENDA_A = "venda-ficticia-a";
const VENDA_B = "venda-ficticia-b";
const CHAVE_ORIGINAL = "chave-original-ficticia-0001";

const MSG_INCERTA = "Não foi possível confirmar se a operação foi registrada";
const MSG_AVISO_INCERTA = "Há uma operação anterior cuja confirmação não foi obtida";
const MSG_AVISO_INVALIDA = "Foi encontrado um registro de operação anterior sem confirmação";
const MSG_BLOQUEIO = "Há uma operação anterior desta venda sem confirmação";
const MSG_SEM_PERSISTENCIA = "Não foi possível guardar esta proteção no navegador";
// Fase 22.6.1
const MSG_CONFIRMADA_APOS_ERRO =
  "confirmada pelo histórico da venda, embora a resposta do servidor tenha indicado erro";
const MSG_CONFIRMADA_PENDENTE = "A operação pendente foi confirmada pelo histórico da venda";
const MSG_PROTEGIDA_APOS_ERRO =
  "A operação não aparece no histórico da venda e continua protegida: reenviar exatamente a mesma operação é seguro.";
const MSG_AVISO_INTERROMPIDA = "A página foi recarregada ou fechada enquanto ela era enviada";
const MSG_SEM_PERSISTENCIA_ENVIO =
  "Não foi possível guardar a proteção desta operação no navegador";

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
  /** Fase 22.6.1 — controle das próximas leituras da venda (reconciliação): falhar (503) ou vir sem `cancelamentos`. */
  const leituras = { comFalha: 0, incompletas: 0 };
  /** Fase 22.6.1 — gancho chamado quando um POST de cancelamento CHEGA (antes de processar). */
  const ganchos = { aoReceberPost: null };

  /** Aplica a operação como o backend real faria (inclui replay e 409 por idempotência). */
  function processar(vendaId, corpo, restauracao = "concluida") {
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
    registrar(venda, corpo, itens, restauracao);
    chaves.set(corpo.idempotencyKey, { vendaId, assinatura });
    return { status: 201, corpo: { data: comResumo(venda) }, replay: false };
  }

  /** Estado de restauração por linha, no formato real do backend (`restaurado` + `estadoRestauracao`). */
  function linhaDeRestauracao(restauracao) {
    if (restauracao === "concluida") return { restaurado: true, estadoRestauracao: "concluida" };
    if (restauracao === "indeterminado") return { restaurado: false }; // linha histórica sem prova
    return { restaurado: false, estadoRestauracao: restauracao };
  }

  function registrar(venda, corpo, itens, restauracao = "concluida") {
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
        ...linhaDeRestauracao(restauracao),
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

  /**
   * Resumo da VENDA INTEIRA, com a mesma precedência do backend real (`resumoRestauracao`): o Backoffice NÃO deve
   * usá-lo para descrever a operação atual (Fase 22.6.1).
   */
  function comResumo(venda) {
    const linhas = venda.cancelamentos.flatMap((e) => e.itens);
    const conta = (f) => linhas.filter(f).length;
    const concluidos = conta((l) => l.restaurado === true);
    const requerIntervencao = conta(
      (l) => !l.restaurado && l.estadoRestauracao === "requer_intervencao",
    );
    const indeterminados = conta(
      (l) =>
        !l.restaurado &&
        !["pendente", "falha_recuperavel", "requer_intervencao"].includes(l.estadoRestauracao),
    );
    const status =
      linhas.length === 0
        ? "nao_aplicavel"
        : requerIntervencao > 0
          ? "requer_intervencao"
          : indeterminados > 0
            ? "indeterminado"
            : concluidos === linhas.length
              ? "concluida"
              : "pendente";
    return {
      ...venda,
      restauracaoEstoque: {
        status,
        totalItens: linhas.length,
        concluidos,
        pendentes: conta((l) => !l.restaurado && l.estadoRestauracao === "pendente"),
        emFalhaRecuperavel: conta(
          (l) => !l.restaurado && l.estadoRestauracao === "falha_recuperavel",
        ),
        requerIntervencao,
        indeterminados,
        proximaTentativaEm: null,
      },
    };
  }

  /** Acrescenta direto no "banco" um evento de OUTRA operação (outra chave), com o estado de restauração dado. */
  function adicionarEvento(vendaId, idempotencyKey, itemId = "item-2", restauracao = "concluida") {
    const venda = vendas.get(vendaId);
    registrar(
      venda,
      { tipo: "parcial", motivo: "operação anterior (fictícia)", idempotencyKey },
      [{ itemId, quantidade: 1 }],
      restauracao,
    );
    chaves.set(idempotencyKey, {
      vendaId,
      assinatura: assinaturaDe({ tipo: "parcial", itens: [{ itemId, quantidade: 1 }] }),
    });
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
      if (leituras.comFalha > 0) {
        leituras.comFalha -= 1;
        return responder(route, erroJson(503, "HTTP_ERROR", "Leitura indisponível (fictício)."));
      }
      if (venda && leituras.incompletas > 0) {
        leituras.incompletas -= 1;
        const { cancelamentos, ...semCancelamentos } = venda;
        return responder(route, { status: 200, corpo: { data: semCancelamentos } });
      }
      return venda
        ? responder(route, { status: 200, corpo: { data: comResumo(venda) } })
        : responder(route, erroJson(404, "NOT_FOUND", "Venda não encontrada."));
    }
    m = caminho.match(/^\/vendas\/([^/]+)\/cancelamento$/);
    if (metodo === "POST" && m) {
      const vendaId = m[1];
      const corpo = JSON.parse(req.postData() ?? "{}");
      posts.push({ vendaId, corpo });
      if (ganchos.aoReceberPost) await ganchos.aoReceberPost(corpo);
      const c = comportamentos.shift() ?? { tipo: "normal" };
      switch (c.tipo) {
        case "normal":
          return responder(route, processar(vendaId, corpo, c.restauracao));
        case "erro": // erro definitivo devolvido pelo backend, SEM registrar
          return responder(route, erroJson(c.status, c.code, c.message));
        case "registrar-e-erro": // Fase 22.6.1 (A2): backend GRAVOU e depois respondeu erro (caixa, agregados…)
          processar(vendaId, corpo, c.restauracao);
          return responder(route, erroJson(c.status, c.code, c.message));
        case "registrar-e-gateway": // backend gravou, mas o gateway devolveu 502/503/504 (corpo HTML)
          processar(vendaId, corpo);
          return responder(route, {
            status: c.status,
            html: `<html><body>${c.status}</body></html>`,
          });
        case "gateway": // gateway respondeu 502/503/504 SEM a requisição ter sido processada
          return responder(route, {
            status: c.status,
            html: `<html><body>${c.status}</body></html>`,
          });
        case "abortar": // falha de rede antes de chegar ao backend
          return route.abort("failed");
        case "registrar-e-travar": // backend gravou, resposta nunca chega → TIMEOUT no cliente (15 s)
          processar(vendaId, corpo);
          await dormir(20_000);
          return route.abort("timedout").catch(() => {});
        case "travar": // requisição nunca processada nem respondida → TIMEOUT no cliente (ou reload no meio)
          await dormir(20_000);
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
  return {
    vendas,
    chaves,
    posts,
    getsVenda,
    comportamentos,
    leituras,
    ganchos,
    adicionarEvento,
    naoPrevistas,
    atender,
  };
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
    }, PREFIXO_BASE_REGISTRO);
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
    /** Registro EFETIVO da venda (v2 tem precedência sobre o legado v1), como texto bruto; `null` se não houver. */
    registro(vendaId) {
      return pagina.evaluate(
        ([v2, v1]) => {
          try {
            return sessionStorage.getItem(v2) ?? sessionStorage.getItem(v1);
          } catch {
            return "<<inacessível>>";
          }
        },
        [PREFIXO_REGISTRO_V2 + vendaId, PREFIXO_REGISTRO + vendaId],
      );
    },
    /** Registro efetivo já interpretado (`null` se não houver). */
    async registroJson(vendaId) {
      const bruto = await this.registro(vendaId);
      return bruto === null ? null : JSON.parse(bruto);
    },
    /** Força o refetch da venda como numa volta de foco (React Query `refetchOnWindowFocus`). */
    async simularFoco() {
      await pagina.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
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
  test("backend NÃO tinha registrado: mesma assinatura usa a chave original, registra uma vez e limpa só a venda atual", async () => {
    const s = await novaSessao({
      sessionStorage: {
        [PREFIXO_REGISTRO + VENDA_A]: registroValido(VENDA_A),
        [PREFIXO_REGISTRO + VENDA_B]: registroValido(VENDA_B, OP_INTEGRAL, "chave-da-venda-b-0001"),
      },
    });
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

  test("Fase 22.6.1 (A5): backend JÁ tinha registrado (evento com a chave) → pendência encerrada ao abrir, sem repetir nem selecionar itens", async () => {
    const s = await novaSessao({
      sessionStorage: {
        [PREFIXO_REGISTRO + VENDA_A]: registroValido(VENDA_A, OP_PARCIAL_ITEM2),
        [PREFIXO_REGISTRO + VENDA_B]: registroValido(VENDA_B, OP_INTEGRAL, "chave-da-venda-b-0001"),
      },
    });
    // A operação perdida consumiu TODO o restante do item 2 (que some da lista do diálogo): não daria para repeti-la.
    s.backend.adicionarEvento(VENDA_A, CHAVE_ORIGINAL, "item-2");
    await s.abrirVenda(VENDA_A);
    await esperarTexto(s.pagina, MSG_CONFIRMADA_PENDENTE);
    await esperarAte(async () => (await s.registro(VENDA_A)) === null, "registro removido");
    assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
    assert.notEqual(await s.registro(VENDA_B), null, "o registro de outra venda foi apagado");
    await semNovasRequisicoes(s.backend, 0);
    assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);
    await s.encerrar();
  });
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
  // Fase 22.6.1 — quando o backend GRAVOU, a releitura encontra a chave e encerra a operação na hora.
  const gravou = [
    ["TIMEOUT (backend gravou, resposta nunca chegou)", { tipo: "registrar-e-travar" }, 30_000],
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
  for (const [nome, comportamento, espera] of gravou) {
    test(
      `${nome}: reconciliação pela chave confirma; sem aviso, sem registro, sem repetição`,
      { timeout: 120_000 },
      async () => {
        const s = await novaSessao();
        await s.abrirVenda(VENDA_A);
        await abrirDialogo(s.pagina);
        await preencher(s.pagina, OP_PARCIAL_ITEM1);
        s.backend.comportamentos.push(comportamento);
        await enviar(s.pagina, OP_PARCIAL_ITEM1);
        await esperarTexto(s.pagina, MSG_CONFIRMADA_APOS_ERRO, espera);
        assert.equal(await s.pagina.getByText(MSG_INCERTA).count(), 0);
        assert.equal(await s.registro(VENDA_A), null);
        assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
        await semNovasRequisicoes(s.backend, 1);
        assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);
        await s.encerrar();
      },
    );
  }

  // Quando NÃO gravou: a chave ausente não prova nada — a operação fica protegida e sobrevive à remontagem.
  const naoGravou = [
    ["TIMEOUT (nada processado)", { tipo: "travar" }, 30_000],
    ["NETWORK_ERROR (falha antes de chegar ao backend)", { tipo: "abortar" }, 10_000],
    ["HTTP 502 (gateway, nada processado)", { tipo: "gateway", status: 502 }, 10_000],
    ["HTTP 503 (gateway, nada processado)", { tipo: "gateway", status: 503 }, 10_000],
    ["HTTP 504 (gateway, nada processado)", { tipo: "gateway", status: 504 }, 10_000],
  ];
  for (const [nome, comportamento, espera] of naoGravou) {
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
        const reg = await s.registroJson(VENDA_A);
        assert.equal(reg.chave, chave);
        assert.equal(reg.assinatura, assinaturaDe(OP_PARCIAL_ITEM1));
        assert.equal(reg.vendaId, VENDA_A);
        assert.equal(reg.estado, "incerta");
        assert.deepEqual(Object.keys(reg).sort(), [
          "assinatura",
          "chave",
          "estado",
          "iniciadaEm",
          "vendaId",
          "versao",
        ]);
        await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
        await esperarAte(
          async () => (s.backend.getsVenda.get(VENDA_A) ?? 0) > getsAntes,
          "releitura/refetch da venda",
        );
        await semNovasRequisicoes(s.backend, 1);

        await s.recarregar();
        await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
        await semNovasRequisicoes(s.backend, 1, 1_000);
        assert.equal((await s.registroJson(VENDA_A)).chave, chave);

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

describe("6.7 erros definitivos SEM registro (Fase 22.6.1: a operação fica protegida)", () => {
  for (const status of [400, 409, 422, 500]) {
    test(`HTTP ${status} sem evento: feedback do backend, operação protegida (mesma chave), sem retry`, async () => {
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
      await esperarTexto(s.pagina, MSG_PROTEGIDA_APOS_ERRO);
      assert.equal(await s.pagina.getByText(MSG_CONFIRMADA_APOS_ERRO).count(), 0);
      const chave = s.backend.posts[0].corpo.idempotencyKey;
      const reg = await s.registroJson(VENDA_A);
      assert.equal(reg.chave, chave);
      assert.equal(reg.estado, "incerta");
      await esperarTexto(dialogo(s.pagina), MSG_AVISO_INCERTA); // diálogo continua aberto, com o aviso
      await semNovasRequisicoes(s.backend, 1);

      // Outra operação: bloqueada. A mesma: reenviada com a MESMA chave.
      await preencher(s.pagina, OP_PARCIAL_ITEM2);
      await enviar(s.pagina, OP_PARCIAL_ITEM2);
      await esperarTexto(s.pagina, MSG_BLOQUEIO);
      await semNovasRequisicoes(s.backend, 1, 500);
      await s.pagina.keyboard.press("Escape");
      await dialogo(s.pagina).waitFor({ state: "detached" });
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, "Devolução parcial registrada.");
      assert.equal(s.backend.posts[1].corpo.idempotencyKey, chave);
      assert.equal(await s.registro(VENDA_A), null);
      await s.encerrar();
    });

    test(`HTTP ${status} com operação incerta anterior: chave e assinatura permanecem`, async () => {
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
      const atual = await s.registroJson(VENDA_A);
      assert.equal(atual.chave, CHAVE_ORIGINAL);
      assert.equal(atual.assinatura, JSON.parse(reg).assinatura);
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
    // Fase 22.6.1 — o texto deixa claro que descartar NÃO desfaz nada no backend.
    await esperarTexto(s.pagina, "não desfaz nem cancela");

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
      s.backend.comportamentos.push({ tipo: "gateway", status: 503 });
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      // Fase 22.6.1 — já ANTES do envio o operador é avisado de que a proteção não sobrevive a reload.
      await esperarTexto(s.pagina, MSG_SEM_PERSISTENCIA_ENVIO);
      await esperarTexto(s.pagina, MSG_INCERTA);
      await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
      await esperarTexto(
        s.pagina,
        `${MSG_SEM_PERSISTENCIA}: ela se perde se você recarregar ou sair desta página.`,
      );
      const chave = s.backend.posts[0].corpo.idempotencyKey;

      // Proteção em memória: operação diferente bloqueada; a mesma reusa a chave (registra uma única vez).
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

// ─── Fase 22.6.1 — reconciliação pela chave, persistência antes do envio, restauração da operação ─────────────────

describe("22.6.1 reconciliação pela chave após erro", () => {
  for (const [status, code, message] of [
    [400, "VALIDATION_ERROR", "Este caixa está fechado e é imutável (fictício)."],
    [404, "NOT_FOUND", "Vendedor(a) não encontrado(a) (fictício)."],
    [409, "CONFLICT", "A venda foi modificada por outra operação simultânea (fictício)."],
    [500, "INTERNAL_ERROR", "Erro interno (fictício)."],
  ]) {
    test(`1–4/10/16. HTTP ${status} DEPOIS de gravar: a chave exata na venda relida confirma; limpa só a venda atual`, async () => {
      const regB = registroValido(VENDA_B, OP_INTEGRAL, "chave-da-venda-b-0001");
      const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_B]: regB } });
      await s.abrirVenda(VENDA_A);
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      s.backend.comportamentos.push({ tipo: "registrar-e-erro", status, code, message });
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      await esperarTexto(s.pagina, MSG_CONFIRMADA_APOS_ERRO);
      await esperarTexto(s.pagina, message); // o erro original continua informado, mas não como falha
      assert.equal(await s.pagina.getByText(MSG_PROTEGIDA_APOS_ERRO).count(), 0);
      assert.equal(await s.pagina.getByText(MSG_INCERTA).count(), 0);
      await dialogo(s.pagina).waitFor({ state: "detached" });
      assert.equal(await s.registro(VENDA_A), null);
      assert.equal(await s.registro(VENDA_B), regB, "registro de outra venda foi removido");
      assert.equal(await s.pagina.getByText(MSG_AVISO_INCERTA).count(), 0);
      await semNovasRequisicoes(s.backend, 1);
      assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);
      // Uma NOVA operação depois disso recebe chave nova (a anterior foi encerrada).
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM2);
      await enviar(s.pagina, OP_PARCIAL_ITEM2);
      await esperarTexto(s.pagina, "Devolução parcial registrada.");
      assert.notEqual(
        s.backend.posts[1].corpo.idempotencyKey,
        s.backend.posts[0].corpo.idempotencyKey,
      );
      await s.encerrar();
    });
  }

  test("7/13. releitura FALHA (backend gravou): chave preservada; depois do reload a pendência é confirmada sem POST", async () => {
    const s = await novaSessao();
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    s.backend.comportamentos.push({
      tipo: "registrar-e-erro",
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno (fictício).",
    });
    s.backend.leituras.comFalha = 3; // releitura + refetch + retry do React Query
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, MSG_INCERTA);
    const chave = s.backend.posts[0].corpo.idempotencyKey;
    const reg = await s.registroJson(VENDA_A);
    assert.equal(reg.chave, chave);
    assert.equal(reg.estado, "incerta");
    await semNovasRequisicoes(s.backend, 1);

    s.backend.leituras.comFalha = 0;
    await s.recarregar();
    await esperarTexto(s.pagina, MSG_CONFIRMADA_PENDENTE);
    await esperarAte(async () => (await s.registro(VENDA_A)) === null, "registro removido");
    await semNovasRequisicoes(s.backend, 1);
    assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);
    await s.encerrar();
  });

  test("8. releitura INCOMPLETA (sem cancelamentos): inconclusiva — chave preservada, operação protegida", async () => {
    const s = await novaSessao();
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    s.backend.comportamentos.push({
      tipo: "erro",
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno (fictício).",
    });
    s.backend.leituras.incompletas = 1;
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, MSG_INCERTA); // inconclusiva ⇒ tratada como incerta, não como "não registrada"
    const chave = s.backend.posts[0].corpo.idempotencyKey;
    assert.equal((await s.registroJson(VENDA_A)).chave, chave);
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
    await semNovasRequisicoes(s.backend, 1);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "Devolução parcial registrada.");
    assert.equal(s.backend.posts[1].corpo.idempotencyKey, chave);
    await s.encerrar();
  });

  test("9. venda relida tem evento de OUTRA chave (mesmo item): não conta como sucesso", async () => {
    const s = await novaSessao();
    s.backend.adicionarEvento(VENDA_A, "chave-de-outra-operacao-0001", "item-1");
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    s.backend.comportamentos.push({
      tipo: "erro",
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno (fictício).",
    });
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, MSG_PROTEGIDA_APOS_ERRO);
    assert.equal(await s.pagina.getByText(MSG_CONFIRMADA_APOS_ERRO).count(), 0);
    const reg = await s.registroJson(VENDA_A);
    assert.equal(reg.chave, s.backend.posts[0].corpo.idempotencyKey);
    assert.notEqual(reg.chave, "chave-de-outra-operacao-0001");
    await semNovasRequisicoes(s.backend, 1);
    await s.encerrar();
  });
});

describe("22.6.1 persistência antes do envio e reload durante a requisição", () => {
  test("11. o registro 'em_andamento' (só campos mínimos) já existe quando o POST chega ao backend", async () => {
    const s = await novaSessao();
    await s.abrirVenda(VENDA_A);
    let noMomentoDoPost = null;
    s.backend.ganchos.aoReceberPost = async () => {
      noMomentoDoPost = await s.registroJson(VENDA_A);
    };
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1, "motivo que não deve ser gravado");
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "Devolução parcial registrada.");
    assert.ok(noMomentoDoPost, "nada gravado antes do POST");
    assert.equal(noMomentoDoPost.estado, "em_andamento");
    assert.equal(noMomentoDoPost.chave, s.backend.posts[0].corpo.idempotencyKey);
    assert.equal(noMomentoDoPost.assinatura, assinaturaDe(OP_PARCIAL_ITEM1));
    assert.deepEqual(Object.keys(noMomentoDoPost).sort(), [
      "assinatura",
      "chave",
      "estado",
      "iniciadaEm",
      "vendaId",
      "versao",
    ]);
    assert.ok(!JSON.stringify(noMomentoDoPost).includes("motivo que não deve"));
    assert.equal(await s.registro(VENDA_A), null, "sucesso deveria limpar o registro");
    await s.encerrar();
  });

  test("12/13. reload DURANTE o envio, backend gravou: ao recarregar, a pendência é confirmada sem POST automático", async () => {
    const s = await novaSessao();
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    s.backend.comportamentos.push({ tipo: "registrar-e-travar" });
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarAte(async () => s.backend.posts.length === 1, "POST chegar");
    await s.recarregar(); // requisição ainda pendente
    await esperarTexto(s.pagina, MSG_CONFIRMADA_PENDENTE);
    await esperarAte(async () => (await s.registro(VENDA_A)) === null, "registro removido");
    await semNovasRequisicoes(s.backend, 1);
    assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);
    await s.encerrar();
  });

  test("12/13. reload DURANTE o envio, nada gravado: aviso de envio interrompido, chave preservada, sem POST automático", async () => {
    const s = await novaSessao();
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    s.backend.comportamentos.push({ tipo: "travar" });
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarAte(async () => s.backend.posts.length === 1, "POST chegar");
    const chave = s.backend.posts[0].corpo.idempotencyKey;
    await s.recarregar();
    await esperarTexto(s.pagina, MSG_AVISO_INTERROMPIDA);
    await esperarTexto(s.pagina, MSG_AVISO_INCERTA);
    const reg = await s.registroJson(VENDA_A);
    assert.equal(reg.chave, chave);
    assert.equal(reg.estado, "em_andamento");
    await semNovasRequisicoes(s.backend, 1);

    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM2);
    await enviar(s.pagina, OP_PARCIAL_ITEM2);
    await esperarTexto(s.pagina, MSG_BLOQUEIO); // outra operação: bloqueada
    await semNovasRequisicoes(s.backend, 1, 500);
    await s.pagina.keyboard.press("Escape");
    await dialogo(s.pagina).waitFor({ state: "detached" });
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "Devolução parcial registrada.");
    assert.equal(s.backend.posts[1].corpo.idempotencyKey, chave);
    assert.equal(s.backend.vendas.get(VENDA_A).cancelamentos.length, 1);
    await s.encerrar();
  });
});

describe("22.6.1 restauração de estoque DA OPERAÇÃO (20–22)", () => {
  const casos = [
    ["concluida", null, "Estoque devolvido"],
    [
      "pendente",
      "a devolução de estoque desta operação ainda está pendente",
      "Estoque: devolução pendente",
    ],
    [
      "falha_recuperavel",
      "a devolução de estoque desta operação falhou nesta tentativa",
      "Estoque: falha, nova tentativa automática",
    ],
    [
      "requer_intervencao",
      "a devolução de estoque desta operação não pôde ser concluída e precisa de verificação do administrador",
      "Estoque: requer intervenção",
    ],
    [
      "indeterminado",
      "não foi possível determinar se o estoque desta operação foi devolvido",
      "Estoque: situação indeterminada",
    ],
  ];
  for (const [estado, trecho, selo] of casos) {
    test(`estoque '${estado}' da operação atual, com evento ANTIGO indeterminado na mesma venda`, async () => {
      const s = await novaSessao();
      // Linha antiga sem prova: o resumo da VENDA vira "indeterminado" — não pode contaminar a operação atual.
      s.backend.adicionarEvento(VENDA_A, "chave-antiga-0001", "item-2", "indeterminado");
      await s.abrirVenda(VENDA_A);
      await abrirDialogo(s.pagina);
      await preencher(s.pagina, OP_PARCIAL_ITEM1);
      s.backend.comportamentos.push({ tipo: "normal", restauracao: estado });
      await enviar(s.pagina, OP_PARCIAL_ITEM1);
      if (trecho === null) {
        await esperarTexto(s.pagina, "Devolução parcial registrada.");
        assert.equal(await s.pagina.getByText("não foi possível determinar").count(), 0);
      } else {
        await esperarTexto(s.pagina, `Devolução parcial registrada; ${trecho}`);
      }
      // Selos no histórico: a operação nova com o próprio estado; a antiga continua "indeterminada".
      await esperarAte(
        async () => (await s.pagina.getByText(selo, { exact: true }).count()) >= 1,
        `selo '${selo}'`,
      );
      await esperarAte(
        async () =>
          (await s.pagina.getByText("Estoque: situação indeterminada", { exact: true }).count()) >=
          (estado === "indeterminado" ? 2 : 1),
        "selo do evento antigo",
      );
      await s.encerrar();
    });
  }

  test("pendência NOVA não fica escondida por intervenção ANTIGA", async () => {
    const s = await novaSessao();
    s.backend.adicionarEvento(VENDA_A, "chave-antiga-0002", "item-2", "requer_intervencao");
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await preencher(s.pagina, OP_PARCIAL_ITEM1);
    s.backend.comportamentos.push({ tipo: "normal", restauracao: "pendente" });
    await enviar(s.pagina, OP_PARCIAL_ITEM1);
    await esperarTexto(s.pagina, "a devolução de estoque desta operação ainda está pendente");
    assert.equal(
      await s.pagina.getByText("desta operação não pôde ser concluída").count(),
      0,
      "a intervenção antiga foi atribuída à operação atual",
    );
    await s.encerrar();
  });
});

describe("22.6.1 refetch com o diálogo aberto (23)", () => {
  test("dados novos SEM a chave pendente: aviso e registro preservados; COM a chave: encerra avisando (nunca em silêncio)", async () => {
    const reg = registroValido(VENDA_A);
    const s = await novaSessao({ sessionStorage: { [PREFIXO_REGISTRO + VENDA_A]: reg } });
    await s.abrirVenda(VENDA_A);
    await abrirDialogo(s.pagina);
    await esperarTexto(dialogo(s.pagina), MSG_AVISO_INCERTA);

    // Outro operador registra outra devolução (outra chave) e o item muda: refetch com o diálogo aberto.
    s.backend.adicionarEvento(VENDA_A, "chave-de-outro-operador-0001", "item-2");
    let gets = s.backend.getsVenda.get(VENDA_A) ?? 0;
    await s.simularFoco();
    await esperarAte(async () => (s.backend.getsVenda.get(VENDA_A) ?? 0) > gets, "refetch");
    await dormir(500);
    await esperarTexto(dialogo(s.pagina), MSG_AVISO_INCERTA);
    assert.equal(await s.registro(VENDA_A), reg);
    await semNovasRequisicoes(s.backend, 0, 200);

    // Agora o histórico passa a ter a chave pendente: encerra COM aviso ao operador.
    s.backend.adicionarEvento(VENDA_A, CHAVE_ORIGINAL, "item-1");
    gets = s.backend.getsVenda.get(VENDA_A) ?? 0;
    await s.simularFoco();
    await esperarAte(async () => (s.backend.getsVenda.get(VENDA_A) ?? 0) > gets, "refetch");
    await esperarTexto(s.pagina, MSG_CONFIRMADA_PENDENTE);
    await esperarAte(async () => (await s.registro(VENDA_A)) === null, "registro removido");
    await semNovasRequisicoes(s.backend, 0, 200);
    await s.encerrar();
  });
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
