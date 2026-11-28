/**
 * Fase 2 — testes de INTERFACE das correções operacionais essenciais, no app real (React, roteador, React Query,
 * cliente HTTP) rodando no Vite local e dirigido pelo Chrome do sistema via Playwright (mesma infraestrutura de
 * `cancelamento.ui.mjs`).
 *
 * Executar:  node --test --test-concurrency=1 tests/ui/operacoes.ui.mjs
 *
 * Cobre:
 *   - P1-01 entrada/saída de estoque: resposta perdida (timeout de 15 s e falha de rede) → aviso de operação pendente;
 *     reabrir o diálogo mantém o aviso; "Tentar novamente" reenvia com a MESMA chave (um registro); uma nova operação
 *     depois da confirmação usa chave NOVA; erro definitivo não deixa operação pendente.
 *   - P1-02 sangria de caixa e recebimento: mesma chave na nova tentativa, um registro.
 *   - P2-02 caixa: "Dinheiro esperado na gaveta" (não a soma de todas as formas) e "Dinheiro" como forma padrão.
 *   - P2-01 "Dar baixa": abre o diálogo de recebimento da parcela; nada é enviado sem escolher a forma de pagamento;
 *     a forma enviada é a escolhida, nunca "A definir".
 *
 * Isolamento — NENHUMA chamada real: o Vite sobe com `VITE_USE_MOCK_API=false` e `VITE_API_URL` num caminho FICTÍCIO
 * da mesma origem, atendido por um backend FALSO em memória (dados fictícios) que deduplica pela `idempotencyKey` como
 * o backend real. Toda requisição para fora de `localhost:<porta>` é ABORTADA e registrada.
 *
 * Nome sem `.test.` de propósito: `bun test tests/unit` não deve tentar rodar este arquivo.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORTA = Number(process.env.UI_PORT ?? 5319);
const BASE = `http://localhost:${PORTA}`;
const PREFIXO_API_FICTICIA = "/__api_ficticia__";
const API = `${BASE}${PREFIXO_API_FICTICIA}/api/v1`;

const PRODUTO = "produto-ficticio-1";
const VARIANTE = "variante-ficticia-1";
const TAMANHO = "tamanho-ficticio-m";
const CAIXA = "caixa-ficticio-1";
const VENDA = "venda-ficticia-fiado";

const MSG_PENDENTE = "O servidor não confirmou a operação anterior";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarAte(condicao, descricao, timeout = 10_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (await condicao()) return;
    await dormir(100);
  }
  throw new Error(`Tempo esgotado esperando: ${descricao}`);
}

// ─── Dados fictícios ───────────────────────────────────────────────────────────────────────────────────────────────

const AGORA = "2026-11-20T14:00:00.000Z";

function novoProduto() {
  return {
    id: PRODUTO,
    codProduto: "PRD-9001",
    nome: "Vestido Fictício",
    descricao: "",
    categoria: "Vestidos",
    colecaoId: null,
    campanhaId: null,
    fornecedorId: null,
    precoCusto: 50,
    margemLucro: 160,
    precoVenda: 130,
    ehNovidade: false,
    ehPromocao: false,
    precoPromocional: null,
    quantidadeTotal: 5,
    fotoPrincipalVarianteId: null,
    estoqueZeradoEm: null,
    variantes: [
      {
        id: VARIANTE,
        codVariante: "PRD-9001-AZUL",
        cor: "Azul",
        quantidadeVariante: 5,
        foto: null,
        video: null,
        tamanhos: [{ id: TAMANHO, tamanho: "M", quantidade: 5 }],
      },
    ],
    midias: [],
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  };
}

function novoCaixa() {
  return {
    id: CAIXA,
    codigo: "CX-9001",
    status: "aberto",
    abertura: {
      dataHora: AGORA,
      responsavelId: null,
      responsavelNome: "Admin Fictício",
      valorInicial: 100,
      observacao: "",
    },
    fechamento: null,
    movimentacoes: [],
    vendas: [],
    recebimentos: [],
  };
}

/** Resumo calculado como o backend: saldo = todas as formas; dinheiro = abertura + movimentos em Dinheiro. */
function comResumo(caixa, movimentos) {
  const soma = (f) => movimentos.filter(f).reduce((t, m) => t + m.valor, 0);
  const entradas = soma((m) => m.sentido === "entrada");
  const saidas = soma((m) => m.sentido === "saida");
  const dinheiro =
    soma((m) => m.sentido === "entrada" && m.formaPagamento === "Dinheiro") -
    soma((m) => m.sentido === "saida" && m.formaPagamento === "Dinheiro");
  return {
    ...caixa,
    movimentacoes: movimentos,
    resumo: {
      valorAbertura: caixa.abertura.valorInicial,
      totalVendas: entradas,
      recebimentos: 0,
      entradasManuais: 0,
      totalEntradas: entradas,
      saidasManuais: saidas,
      devolucoes: 0,
      totalSaidas: saidas,
      saldoEsperado: caixa.abertura.valorInicial + entradas - saidas,
      quantidadeVendas: 3,
      quantidadeMovimentacoes: movimentos.length,
      dinheiroEsperado: caixa.abertura.valorInicial + dinheiro,
      porFormaPagamento: [],
    },
  };
}

/** Vendas já lançadas no caixa: Dinheiro 100 + PIX 134 + Crédito 130 + Débito 130 → dinheiro 200, saldo 594. */
function movimentosIniciais() {
  return [
    ["Dinheiro", 100],
    ["PIX", 134],
    ["Crédito", 130],
    ["Débito", 130],
  ].map(([formaPagamento, valor], i) => ({
    id: `mov-venda-${i}`,
    dataHora: AGORA,
    tipo: "venda",
    origem: "venda",
    descricao: "Venda fictícia",
    referencia: null,
    vendaId: null,
    vendaCodigo: null,
    formaPagamento,
    valor,
    sentido: "entrada",
    observacao: "",
    motivo: null,
  }));
}

function novaVenda() {
  return {
    id: VENDA,
    codigo: "VEN-9101",
    numero: "9101",
    dataVenda: AGORA,
    clienteId: null,
    clienteNome: "Cliente Fictícia",
    vendedorId: null,
    vendedorNome: "Vendedora Fictícia",
    caixaId: null,
    caixaCodigo: "CX-9001",
    totalItens: 1,
    valorBruto: 300,
    descontoPromocional: 0,
    descontoVenda: 0,
    descontoTotal: 0,
    valorFinal: 300,
    valorPago: 0,
    valorPendente: 300,
    valorDevolvido: 0,
    temPromocao: false,
    temDesconto: false,
    formaPagamento: "A definir",
    totalParcelas: 3,
    parcelasPagas: 0,
    status: "em_pagamento",
    observacao: "",
    itens: [
      {
        id: "item-1",
        produtoId: PRODUTO,
        codProduto: "PRD-9001",
        nome: "Vestido Fictício",
        categoria: "Vestidos",
        varianteId: null,
        codVariante: null,
        cor: null,
        tamanho: "M",
        foto: null,
        quantidade: 1,
        precoOriginal: 300,
        precoPraticado: 300,
        emPromocao: false,
        descontoItem: 0,
        subtotal: 300,
        quantidadeDevolvida: 0,
      },
    ],
    pagamentos: [],
    parcelas: [1, 2, 3].map((numero) => ({
      id: `parcela-${numero}`,
      numero,
      total: 3,
      valor: 100,
      vencimento: "2026-12-20",
      pagoEm: null,
      formaPagamento: null,
    })),
    historico: [
      { dataHora: AGORA, tipo: "criacao", descricao: "Venda fiada (fictícia)", autor: "Teste" },
    ],
    cancelamentos: [],
    restauracaoEstoque: {
      status: "nao_aplicavel",
      totalItens: 0,
      concluidos: 0,
      pendentes: 0,
      emFalhaRecuperavel: 0,
      requerIntervencao: 0,
      indeterminados: 0,
    },
  };
}

// ─── Backend FALSO (em memória) ────────────────────────────────────────────────────────────────────────────────────

function criarBackend() {
  const produto = novoProduto();
  const caixa = novoCaixa();
  const movimentos = movimentosIniciais();
  const venda = novaVenda();
  /** idempotencyKey → assinatura da operação já gravada. */
  const chaves = new Map();
  /** Toda POST de operação recebida: { rota, corpo }. */
  const posts = [];
  /** Registros efetivamente gravados (sem replays), por rota. */
  const gravados = { estoque: 0, caixa: 0, recebimento: 0, baixa: 0 };
  /**
   * Comportamento das próximas POSTs (FIFO; vazio ⇒ "normal"):
   *   normal | gravar-e-abortar (rede) | gravar-e-502 | gravar-e-travar (timeout do cliente) | erro-400
   */
  const comportamentos = [];

  function json(route, status, corpo) {
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  }

  /** Grava UMA vez por chave (replay se a chave já foi usada na mesma operação; 409 se em outra). */
  function gravar(tipo, corpo, aplicar) {
    const { idempotencyKey, ...resto } = corpo;
    const assinatura = JSON.stringify([tipo, resto]);
    const anterior = idempotencyKey ? chaves.get(idempotencyKey) : undefined;
    if (anterior !== undefined) return anterior === assinatura ? "replay" : "conflito";
    aplicar();
    gravados[tipo] += 1;
    if (idempotencyKey) chaves.set(idempotencyKey, assinatura);
    return "gravado";
  }

  async function operacao(route, tipo, corpo, aplicar, resposta) {
    posts.push({ tipo, corpo });
    const c = comportamentos.shift() ?? "normal";
    if (c === "erro-400") {
      return json(route, 400, {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Recusado (fictício).",
      });
    }
    const resultado = gravar(tipo, corpo, aplicar);
    if (resultado === "conflito") {
      return json(route, 409, {
        statusCode: 409,
        code: "CONFLICT",
        message: "Chave usada em outra operação.",
      });
    }
    if (c === "gravar-e-abortar") return route.abort("failed");
    if (c === "gravar-e-502") {
      return route.fulfill({ status: 502, contentType: "text/html", body: "<html>502</html>" });
    }
    if (c === "gravar-e-travar") {
      await dormir(20_000); // o cliente desiste aos 15 s (TIMEOUT)
      return route.abort("timedout").catch(() => {});
    }
    return json(route, resultado === "gravado" ? 201 : 200, { data: resposta() });
  }

  async function atender(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === `${PREFIXO_API_FICTICIA}/preparar`) {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>ok" });
    }
    const caminho = url.pathname.slice(`${PREFIXO_API_FICTICIA}/api/v1`.length);
    const metodo = req.method();
    const corpo = () => JSON.parse(req.postData() ?? "{}");

    if (metodo === "GET" && caminho === "/auth/me") {
      return json(route, 200, {
        data: {
          id: "usr",
          codigo: "USR-9999",
          nome: "Admin Fictício",
          email: "a@ficticio.test",
          tipo: "ADMIN",
          ativo: true,
        },
      });
    }
    if (metodo === "GET" && caminho === "/configuracoes") {
      return json(route, 200, {
        data: {
          loja: {},
          categorias: ["Vestidos"],
          tamanhos: ["M"],
          cores: ["Azul"],
          // "Dinheiro" de propósito fora da primeira posição.
          formasPagamento: ["PIX", "Crédito", "Dinheiro", "Débito"],
          mensagensWhatsapp: [],
          atualizadoEm: AGORA,
        },
      });
    }
    if (metodo === "GET" && caminho === `/produtos/${PRODUTO}`)
      return json(route, 200, { data: produto });
    if (metodo === "POST" && (caminho === "/estoque/entrada" || caminho === "/estoque/saida")) {
      const c = corpo();
      const sinal = caminho.endsWith("entrada") ? 1 : -1;
      return operacao(
        route,
        "estoque",
        c,
        () => {
          produto.variantes[0].tamanhos[0].quantidade += sinal * c.quantidade;
          produto.variantes[0].quantidadeVariante += sinal * c.quantidade;
          produto.quantidadeTotal += sinal * c.quantidade;
        },
        () => produto,
      );
    }
    if (metodo === "GET" && caminho === `/caixas/${CAIXA}`)
      return json(route, 200, { data: comResumo(caixa, movimentos) });
    if (metodo === "GET" && caminho === `/caixas/${CAIXA}/movimentacoes`)
      return json(route, 200, { data: movimentos });
    if (
      metodo === "POST" &&
      (caminho === `/caixas/${CAIXA}/saida` || caminho === `/caixas/${CAIXA}/entrada`)
    ) {
      const c = corpo();
      const saida = caminho.endsWith("saida");
      return operacao(
        route,
        "caixa",
        c,
        () =>
          movimentos.push({
            id: `mov-${movimentos.length}`,
            dataHora: AGORA,
            tipo: saida ? "sangria" : "injecao",
            origem: "manual",
            descricao: c.descricao,
            referencia: null,
            vendaId: null,
            vendaCodigo: null,
            formaPagamento: c.formaPagamento,
            valor: c.valor,
            sentido: saida ? "saida" : "entrada",
            observacao: c.observacao ?? "",
            motivo: c.motivo ?? null,
          }),
        () => comResumo(caixa, movimentos),
      );
    }
    if (metodo === "GET" && caminho === `/vendas/${VENDA}`)
      return json(route, 200, { data: venda });
    if (metodo === "POST" && caminho === `/vendas/${VENDA}/recebimentos`) {
      const c = corpo();
      return operacao(
        route,
        "recebimento",
        c,
        () => {
          venda.pagamentos.push({
            id: `pag-${venda.pagamentos.length}`,
            forma: c.forma,
            valor: c.valor,
            dataPagamento: AGORA,
            parcelas: 1,
          });
          venda.valorPago += c.valor;
          venda.valorPendente -= c.valor;
        },
        () => venda,
      );
    }
    const baixa = caminho.match(new RegExp(`^/vendas/${VENDA}/parcelas/([^/]+)/baixa$`));
    if (metodo === "POST" && baixa) {
      const c = corpo();
      return operacao(
        route,
        "baixa",
        { ...c, parcelaId: baixa[1] },
        () => {
          const parcela = venda.parcelas.find((p) => p.id === baixa[1]);
          parcela.pagoEm = AGORA;
          parcela.formaPagamento = c.formaPagamento;
          venda.pagamentos.push({
            id: `pag-${venda.pagamentos.length}`,
            forma: c.formaPagamento,
            valor: parcela.valor,
            dataPagamento: AGORA,
            parcelas: 1,
          });
          venda.valorPago += parcela.valor;
          venda.valorPendente -= parcela.valor;
        },
        () => venda,
      );
    }
    naoPrevistas.push(`${metodo} ${caminho}`);
    return json(route, 200, { data: [] });
  }

  const naoPrevistas = [];
  return { produto, movimentos, venda, posts, gravados, comportamentos, naoPrevistas, atender };
}

// ─── Infra: Vite + navegador ───────────────────────────────────────────────────────────────────────────────────────

let servidor;
let navegador;
let saidaServidor = "";

before(async () => {
  servidor = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "dev", "--port", String(PORTA), "--strictPort", "--force"],
    {
      env: { ...process.env, VITE_USE_MOCK_API: "false", VITE_API_URL: API },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  servidor.stdout.on("data", (d) => (saidaServidor += d));
  servidor.stderr.on("data", (d) => (saidaServidor += d));
  await esperarAte(
    async () => {
      try {
        return (await fetch(`${BASE}/login`)).status < 500;
      } catch {
        return false;
      }
    },
    `Vite em ${BASE}\n${saidaServidor}`,
    120_000,
  );
  navegador = await chromium.launch({ channel: "chrome", headless: true });
  await aquecerServidor();
});

after(async () => {
  await navegador?.close();
  servidor?.kill();
});

/** Com o cache do Vite frio, a primeira carga re-otimiza dependências e recarrega: espera duas cargas estáveis. */
async function aquecerServidor() {
  const limite = Date.now() + 240_000;
  let seguidas = 0;
  while (seguidas < 2) {
    if (Date.now() > limite) throw new Error(`O Vite não estabilizou.\n${saidaServidor}`);
    const s = await novaSessao();
    try {
      await s.abrirVariantes();
      seguidas += 1;
    } catch {
      seguidas = 0;
    } finally {
      assert.equal(s.backend.posts.length, 0, "o aquecimento não pode enviar operações");
      await s.contexto.close();
    }
  }
}

async function novaSessao() {
  const backend = criarBackend();
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
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
  const pagina = await contexto.newPage();
  const errosDePagina = [];
  pagina.on("pageerror", (e) => errosDePagina.push(String(e)));
  await pagina.goto(`${BASE}${PREFIXO_API_FICTICIA}/preparar`);
  await pagina.evaluate(() =>
    localStorage.setItem("mariela.accessToken", "token-ficticio-de-teste"),
  );

  const dialogo = () => pagina.getByRole("dialog");
  return {
    backend,
    contexto,
    pagina,
    dialogo,
    async abrirVariantes() {
      await pagina.goto(`${BASE}/produtos/${PRODUTO}/variantes`);
      await pagina.getByText("PRD-9001-AZUL").first().waitFor({ timeout: 60_000 });
    },
    async abrirCaixa() {
      await pagina.goto(`${BASE}/caixa/${CAIXA}`);
      await pagina.getByText("Resumo financeiro").waitFor({ timeout: 60_000 });
    },
    async abrirVenda() {
      await pagina.goto(`${BASE}/vendas/${VENDA}`);
      await pagina.getByText("Itens da venda").waitFor({ timeout: 60_000 });
    },
    async escolher(rotuloOuId, opcao) {
      await dialogo().locator(rotuloOuId).click();
      await pagina.getByRole("option", { name: opcao }).click();
    },
    async encerrar() {
      const apiExterna = externas.filter((u) => /\/api\/|\/auth\//.test(u));
      await contexto.close();
      assert.deepEqual(apiExterna, [], "requisição de API para fora do backend fictício");
      assert.deepEqual(errosDePagina, [], "erro não tratado na página");
    },
  };
}

// ─── Estoque (P1-01) ───────────────────────────────────────────────────────────────────────────────────────────────

async function lancarEntrada(s, quantidade) {
  await s.pagina.getByRole("button", { name: "Entrada" }).click();
  await s.escolher("#tamanhoId", /^M — /);
  await s.dialogo().locator("#quantidade").fill(String(quantidade));
  await s.dialogo().getByRole("button", { name: "Registrar entrada" }).click();
}

describe("estoque — uma chave por operação (P1-01)", () => {
  for (const [nome, comportamento, limite] of [
    ["falha de rede depois de gravar", "gravar-e-abortar", 15_000],
    ["TIMEOUT de 15 s depois de gravar", "gravar-e-travar", 40_000],
  ]) {
    test(`${nome}: aviso pendente, reabrir mantém, nova tentativa com a MESMA chave grava UMA vez`, async () => {
      const s = await novaSessao();
      try {
        await s.abrirVariantes();
        s.backend.comportamentos.push(comportamento);
        await lancarEntrada(s, 2);
        await s.dialogo().getByText(MSG_PENDENTE).waitFor({ timeout: limite });
        assert.equal(
          await s.dialogo().locator("#quantidade").count(),
          0,
          "o formulário não pode aparecer",
        );
        assert.match(await s.dialogo().innerText(), /Entrada de 2 un\. no tamanho M/);

        // Fechar e reabrir: a operação continua pendente (não nasce uma operação nova).
        await s.pagina.keyboard.press("Escape");
        await s.pagina.getByRole("button", { name: "Entrada" }).click();
        await s.dialogo().getByText(MSG_PENDENTE).waitFor();

        await s.dialogo().getByRole("button", { name: "Tentar novamente" }).click();
        await s.pagina.getByText("Estoque atualizado com sucesso.").waitFor();
        const [primeiro, segundo] = s.backend.posts;
        assert.equal(s.backend.posts.length, 2);
        assert.ok(primeiro.corpo.idempotencyKey, "a entrada precisa levar idempotencyKey");
        assert.equal(segundo.corpo.idempotencyKey, primeiro.corpo.idempotencyKey);
        assert.equal(s.backend.gravados.estoque, 1);
        assert.equal(s.backend.produto.variantes[0].tamanhos[0].quantidade, 7);

        // Operação nova e legítima: chave nova, grava de novo.
        await lancarEntrada(s, 1);
        await s.pagina.getByText("Estoque atualizado com sucesso.").last().waitFor();
        await esperarAte(() => s.backend.posts.length === 3, "terceira POST");
        assert.notEqual(s.backend.posts[2].corpo.idempotencyKey, primeiro.corpo.idempotencyKey);
        assert.equal(s.backend.gravados.estoque, 2);
        assert.equal(s.backend.produto.variantes[0].tamanhos[0].quantidade, 8);
      } finally {
        await s.encerrar();
      }
    });
  }

  test("erro definitivo (400): sem operação pendente; o novo envio é uma operação nova", async () => {
    const s = await novaSessao();
    try {
      await s.abrirVariantes();
      s.backend.comportamentos.push("erro-400");
      await lancarEntrada(s, 2);
      await s.pagina.getByText("Recusado (fictício).").first().waitFor();
      assert.equal(await s.dialogo().getByText(MSG_PENDENTE).count(), 0);
      await s.dialogo().getByRole("button", { name: "Registrar entrada" }).click();
      await s.pagina.getByText("Estoque atualizado com sucesso.").waitFor();
      assert.equal(s.backend.posts.length, 2);
      assert.notEqual(
        s.backend.posts[1].corpo.idempotencyKey,
        s.backend.posts[0].corpo.idempotencyKey,
      );
      assert.equal(s.backend.gravados.estoque, 1);
    } finally {
      await s.encerrar();
    }
  });

  test("descartar a operação pendente libera o formulário (com confirmação)", async () => {
    const s = await novaSessao();
    try {
      await s.abrirVariantes();
      s.backend.comportamentos.push("gravar-e-abortar");
      await lancarEntrada(s, 2);
      await s.dialogo().getByText(MSG_PENDENTE).waitFor();
      await s.dialogo().getByRole("button", { name: "Descartar", exact: true }).click();
      await s.dialogo().getByRole("button", { name: "Descartar operação pendente" }).click();
      await s.dialogo().locator("#quantidade").waitFor();
    } finally {
      await s.encerrar();
    }
  });
});

// ─── Caixa (P2-02 + P1-02) ─────────────────────────────────────────────────────────────────────────────────────────

describe("caixa — dinheiro da gaveta e sangria idempotente", () => {
  test("a página mostra o dinheiro esperado na gaveta, não a soma de todas as formas", async () => {
    const s = await novaSessao();
    try {
      await s.abrirCaixa();
      const texto = await s.pagina.locator("main").innerText();
      assert.match(texto, /Dinheiro esperado na gaveta\s+R\$\s200,00/);
      assert.match(texto, /Saldo de todas as formas\s+R\$\s594,00/);
    } finally {
      await s.encerrar();
    }
  });

  test("sangria: Dinheiro vem como padrão, saldo informado é o da gaveta; 502 → mesma chave, UM registro", async () => {
    const s = await novaSessao();
    try {
      await s.abrirCaixa();
      await s.pagina.getByRole("button", { name: "Saída" }).click();
      const d = s.dialogo();
      assert.match(await d.innerText(), /Dinheiro esperado na gaveta:\s+R\$\s200,00/);
      assert.equal((await d.locator("#mov-forma").innerText()).trim(), "Dinheiro");

      await d.locator("#mov-descricao").fill("Compra de material (fictícia)");
      await d.locator("#mov-valor").fill("30");
      await d.getByRole("button", { name: "Continuar" }).click();
      s.backend.comportamentos.push("gravar-e-502");
      await d.getByRole("button", { name: "Confirmar" }).click();
      await d.getByText(MSG_PENDENTE).waitFor();

      await d.getByRole("button", { name: "Tentar novamente" }).click();
      await s.pagina.getByText("Saída registrada.").waitFor();
      assert.equal(s.backend.posts.length, 2);
      assert.equal(
        s.backend.posts[1].corpo.idempotencyKey,
        s.backend.posts[0].corpo.idempotencyKey,
      );
      assert.equal(s.backend.posts[0].corpo.formaPagamento, "Dinheiro");
      assert.equal(s.backend.gravados.caixa, 1);
      // A gaveta agora mostra 200 − 30.
      await s.pagina
        .getByText(/R\$\s170,00/)
        .first()
        .waitFor();
    } finally {
      await s.encerrar();
    }
  });
});

// ─── Recebimento e baixa de parcela (P1-02 + P2-01) ───────────────────────────────────────────────────────────────

describe("recebimentos", () => {
  test("recebimento: forma obrigatória; falha de rede → mesma chave na nova tentativa, UM recebimento", async () => {
    const s = await novaSessao();
    try {
      await s.abrirVenda();
      await s.pagina.getByRole("button", { name: "Receber pagamento" }).click();
      const d = s.dialogo();
      assert.equal(
        await d.getByRole("button", { name: "Confirmar recebimento" }).isDisabled(),
        true,
      );
      await s.escolher("#receb-forma", "Dinheiro");
      await d.locator("#receb-valor").fill("50");
      s.backend.comportamentos.push("gravar-e-abortar");
      await d.getByRole("button", { name: "Confirmar recebimento em Dinheiro" }).click();
      await d.getByText(MSG_PENDENTE).waitFor();
      await d.getByRole("button", { name: "Tentar novamente" }).click();
      await s.pagina.getByText("Recebimento registrado.").waitFor();
      assert.equal(s.backend.posts.length, 2);
      assert.equal(
        s.backend.posts[1].corpo.idempotencyKey,
        s.backend.posts[0].corpo.idempotencyKey,
      );
      assert.equal(s.backend.gravados.recebimento, 1);
      assert.equal(s.backend.venda.valorPago, 50);
    } finally {
      await s.encerrar();
    }
  });

  test("Dar baixa: abre o recebimento da parcela, nada é enviado sem escolher a forma, e a forma é a escolhida", async () => {
    const s = await novaSessao();
    try {
      await s.abrirVenda();
      await s.pagina.getByRole("button", { name: "Dar baixa" }).first().click();
      const d = s.dialogo();
      await d.getByText("Receber parcela 1/3").waitFor();
      assert.equal(s.backend.posts.length, 0, "abrir o diálogo não pode enviar nada");
      assert.equal(await d.locator("#receb-valor").inputValue(), "100");
      assert.equal(await d.locator("#receb-valor").getAttribute("readonly"), "");
      assert.equal(
        await d.getByRole("button", { name: "Confirmar recebimento" }).isDisabled(),
        true,
      );

      await s.escolher("#receb-forma", "Dinheiro");
      await d.getByRole("button", { name: "Confirmar recebimento em Dinheiro" }).click();
      await s.pagina.getByText("Parcela baixada.").waitFor();
      assert.equal(s.backend.posts.length, 1);
      assert.equal(s.backend.posts[0].corpo.formaPagamento, "Dinheiro");
      assert.equal(s.backend.posts[0].corpo.parcelaId, "parcela-1");
      assert.ok(s.backend.posts[0].corpo.idempotencyKey);
      assert.equal(s.backend.venda.parcelas[0].formaPagamento, "Dinheiro");
    } finally {
      await s.encerrar();
    }
  });

  test("Dar baixa com resposta perdida: nova tentativa da MESMA parcela usa a mesma chave", async () => {
    const s = await novaSessao();
    try {
      await s.abrirVenda();
      await s.pagina.getByRole("button", { name: "Dar baixa" }).first().click();
      await s.escolher("#receb-forma", "PIX");
      s.backend.comportamentos.push("gravar-e-abortar");
      await s.dialogo().getByRole("button", { name: "Confirmar recebimento em PIX" }).click();
      await s.dialogo().getByText(MSG_PENDENTE).waitFor();
      await s.dialogo().getByRole("button", { name: "Tentar novamente" }).click();
      await s.pagina.getByText("Parcela baixada.").waitFor();
      assert.equal(
        s.backend.posts[1].corpo.idempotencyKey,
        s.backend.posts[0].corpo.idempotencyKey,
      );
      assert.equal(s.backend.gravados.baixa, 1);
    } finally {
      await s.encerrar();
    }
  });
});
