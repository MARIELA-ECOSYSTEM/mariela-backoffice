/**
 * Fase 22.8.9.9.4 (M3) — testes de interface da galeria de FOTOS do produto (cadastro, edição e detalhe).
 *
 * Executar:  node --test --test-concurrency=1 tests/ui/galeria.ui.mjs
 *
 * Sobe o Vite com `VITE_USE_MOCK_API=false` e `VITE_API_URL` num caminho FICTÍCIO da própria origem; toda a API é
 * atendida por um backend falso em memória (produtos, galeria, uploads) e o "R2" é outro caminho falso da própria
 * origem (`/__r2_ficticio__/`), que confere método, cabeçalhos EXATOS, ausência de `Authorization` e tamanho.
 * Qualquer requisição para fora de `localhost` é abortada. Nada de R2 real, nada de rede externa. Dados sintéticos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORTA = Number(process.env.UI_PORT_GALERIA ?? 5318);
const BASE = `http://localhost:${PORTA}`;
const PREFIXO_API = "/__api_ficticia__";
const API = `${BASE}${PREFIXO_API}/api/v1`;
const PREFIXO_R2 = "/__r2_ficticio__/";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const PREFIXO_CONFIRMACOES = "mariela.backoffice.confirmacoes-midia.v1.";

/** PNG 1×1 válido (pré-visualização real). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const arquivo = (nome, mimeType = "image/jpeg", buffer = PNG) => ({ name: nome, mimeType, buffer });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarAte(condicao, descricao, timeout = 15_000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    if (await condicao()) return;
    await dormir(100);
  }
  throw new Error(`Tempo esgotado esperando: ${descricao}`);
}

// ─── Backend falso ─────────────────────────────────────────────────────────────────────────────────────────────────

function produtoBase(id, extra = {}) {
  return {
    id,
    codProduto: `PRD-${id}`,
    nome: `Vestido Fictício ${id}`,
    descricao: "",
    categoria: "Vestidos",
    colecaoId: null,
    campanhaId: null,
    fornecedorId: null,
    precoCusto: 50,
    margemLucro: 100,
    precoVenda: 100,
    ehNovidade: false,
    ehPromocao: false,
    precoPromocional: null,
    quantidadeTotal: 0,
    fotoPrincipalVarianteId: null,
    estoqueZeradoEm: null,
    variantes: [],
    criadoEm: "2026-11-19T10:00:00.000Z",
    atualizadoEm: "2026-11-19T10:00:00.000Z",
    ...extra,
  };
}

function midiaImagem(produtoId, id, ordem) {
  return {
    id,
    tipo: "image",
    chave: `products/${produtoId}/${id}.jpg`,
    url: `https://midia.ficticia.test/products/${produtoId}/${id}.jpg`,
    contentType: "image/jpeg",
    tamanho: 1024,
    nomeOriginal: `${id}.jpg`,
    origem: "upload",
    varianteId: null,
    ordem,
    criadoEm: "2026-11-19T10:00:00.000Z",
    criadoPor: "usr-ficticio",
  };
}

/** Fase 22.8.9.9.6 (M4) — vídeo da galeria (fictício). */
function midiaVideo(produtoId, id, ordem) {
  return {
    ...midiaImagem(produtoId, id, ordem),
    tipo: "video",
    chave: `products/${produtoId}/${id}.mp4`,
    url: `https://midia.ficticia.test/products/${produtoId}/${id}.mp4`,
    contentType: "video/mp4",
    nomeOriginal: `${id}.mp4`,
  };
}

function criarBackend() {
  const produtos = new Map();
  const galerias = new Map();
  const uploads = new Map();
  const chamadas = []; // [método, rota curta, corpo]
  const puts = []; // PUTs recebidos pelo "R2"
  const comportamentos = {
    criar: [],
    solicitar: [],
    confirmar: [],
    ordem: [],
    principal: [],
    remover: [],
    put: [],
  };
  const travas = { put: null, confirmar: null, principal: null };
  let seq = 0;

  function galeria(pid) {
    if (!galerias.has(pid)) galerias.set(pid, { midias: [], midiaPrincipalId: null });
    return galerias.get(pid);
  }
  function resposta(pid) {
    const g = galeria(pid);
    const midias = [...g.midias].sort((a, b) => a.ordem - b.ordem);
    const imgs = midias.filter((m) => m.tipo === "image");
    const marcada = imgs.find((m) => m.id === g.midiaPrincipalId);
    return { midias, midiaPrincipalId: (marcada ?? imgs[0])?.id ?? null };
  }
  function semear(pid, n, extra = {}, { video = false } = {}) {
    produtos.set(pid, produtoBase(pid, extra));
    const g = galeria(pid);
    for (let i = 0; i < n; i += 1) g.midias.push(midiaImagem(pid, `${pid}-m${i + 1}`, i));
    if (video) g.midias.push(midiaVideo(pid, `${pid}-v1`, n));
  }

  const json = (route, status, corpo, headers = {}) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers,
      body: JSON.stringify(corpo),
    });
  const erro = (route, status, code, message, headers) =>
    json(route, status, { statusCode: status, code, message, errors: [] }, headers);

  async function aplicarComportamento(route, fila) {
    const c = fila.shift();
    if (!c) return false;
    if (c.tipo === "abortar") {
      await route.abort("failed");
      return true;
    }
    if (c.tipo === "erro") {
      await erro(
        route,
        c.status,
        c.code ?? "ERRO_FICTICIO",
        c.message ?? `Erro fictício ${c.status}.`,
        c.headers,
      );
      return true;
    }
    fila.unshift(c); // comportamentos que gravam e depois falham são tratados por quem chama
    return false;
  }

  async function atenderR2(route) {
    const req = route.request();
    const uploadId = decodeURIComponent(new URL(req.url()).pathname.slice(PREFIXO_R2.length));
    const h = req.headers();
    const corpo = req.postDataBuffer() ?? Buffer.alloc(0);
    puts.push({
      uploadId,
      metodo: req.method(),
      contentType: h["content-type"],
      cacheControl: h["cache-control"],
      authorization: h["authorization"] ?? null,
      tamanho: corpo.length,
    });
    if (travas.put) await travas.put;
    const c = comportamentos.put.shift();
    if (c?.tipo === "erro") return route.fulfill({ status: c.status, body: "<Error/>" });
    const u = uploads.get(uploadId);
    if (
      !u ||
      req.method() !== "PUT" ||
      h["content-type"] !== u.contentType ||
      h["cache-control"] !== CACHE_CONTROL ||
      h["authorization"] ||
      corpo.length !== u.size
    ) {
      return route.fulfill({
        status: 403,
        body: "<Error><Code>SignatureDoesNotMatch</Code></Error>",
      });
    }
    u.recebido = true;
    return route.fulfill({ status: 200, body: "" });
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
    const corpo = req.postData() ? JSON.parse(req.postData()) : null;
    chamadas.push([metodo, caminho, corpo]);

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
    if (metodo === "POST" && caminho === "/auth/logout") return json(route, 200, { data: null });
    if (metodo === "GET" && caminho === "/configuracoes") {
      return json(route, 200, {
        data: {
          loja: {},
          categorias: ["Vestidos", "Blusas"],
          tamanhos: ["P", "M"],
          cores: ["Preto"],
          formasPagamento: [],
          atualizadoEm: "2026-11-19T10:00:00.000Z",
        },
      });
    }
    if (metodo === "POST" && caminho === "/produtos") {
      if (await aplicarComportamento(route, comportamentos.criar)) return;
      const id = `prod-novo-${(seq += 1)}`;
      produtos.set(
        id,
        produtoBase(id, {
          nome: corpo.nome,
          categoria: corpo.categoria,
          precoCusto: corpo.precoCusto,
          precoVenda: corpo.precoVenda,
        }),
      );
      return json(route, 201, { data: { ...produtos.get(id), ...resposta(id) } });
    }
    let m = caminho.match(/^\/produtos\/([^/]+)$/);
    if (m && metodo === "GET") {
      const p = produtos.get(m[1]);
      return p
        ? json(route, 200, { data: { ...p, ...resposta(m[1]) } })
        : erro(route, 404, "NOT_FOUND", "Produto não encontrado.");
    }
    if (m && metodo === "PUT") {
      const p = { ...produtos.get(m[1]), ...corpo, atualizadoEm: new Date().toISOString() };
      produtos.set(m[1], p);
      return json(route, 200, { data: { ...p, ...resposta(m[1]) } });
    }
    m = caminho.match(/^\/produtos\/([^/]+)\/midias\/uploads$/);
    if (m && metodo === "POST") {
      if (await aplicarComportamento(route, comportamentos.solicitar)) return;
      const pid = m[1];
      const g = galeria(pid);
      const kind = corpo.kind === "video" ? "video" : "image";
      const limite = kind === "video" ? 1 : 10;
      const atuais = g.midias.filter((x) => x.tipo === kind).length;
      const reservas = [...uploads.values()].filter(
        (u) => u.produtoId === pid && u.kind === kind && !u.confirmado && !u.substitui,
      ).length;
      if (!corpo.substituiMidiaId && atuais + reservas >= limite) {
        return erro(
          route,
          409,
          "CONFLICT",
          kind === "video"
            ? "Limite de 1 vídeo por produto atingido."
            : "Limite de 10 imagens por produto atingido.",
        );
      }
      const uploadId = `upl-${(seq += 1)}`;
      uploads.set(uploadId, {
        produtoId: pid,
        kind,
        contentType: corpo.contentType,
        size: corpo.size,
        substitui: corpo.substituiMidiaId ?? null,
        recebido: false,
        confirmado: false,
      });
      return json(route, 200, {
        data: {
          uploadId,
          uploadUrl: `${BASE}${PREFIXO_R2}${uploadId}?X-Amz-Signature=ficticia`,
          method: "PUT",
          headers: { "Content-Type": corpo.contentType, "Cache-Control": CACHE_CONTROL },
          expiresIn: 600,
        },
      });
    }
    m = caminho.match(/^\/produtos\/([^/]+)\/midias\/uploads\/([^/]+)\/confirmacao$/);
    if (m && metodo === "POST") {
      const [, pid, uploadId] = m;
      if (travas.confirmar) await travas.confirmar;
      const g = galeria(pid);
      if (g.midias.some((x) => x.id === uploadId))
        return json(route, 201, {
          data: { ...resposta(pid), midia: g.midias.find((x) => x.id === uploadId) },
        });
      if (await aplicarComportamento(route, comportamentos.confirmar)) return;
      const u = uploads.get(uploadId);
      if (!u) return erro(route, 404, "NOT_FOUND", "Upload não encontrado para este produto.");
      if (!u.recebido)
        return erro(
          route,
          400,
          "VALIDATION_ERROR",
          "O arquivo não foi encontrado no armazenamento.",
        );
      let ordem = g.midias.reduce((a, x) => Math.max(a, x.ordem + 1), 0);
      if (u.substitui) {
        const antiga = g.midias.find((x) => x.id === u.substitui);
        if (!antiga)
          return erro(
            route,
            409,
            "CONFLICT",
            "A mídia a ser substituída não está mais na galeria.",
          );
        ordem = antiga.ordem;
        if (g.midiaPrincipalId === antiga.id) g.midiaPrincipalId = uploadId;
        g.midias = g.midias.filter((x) => x.id !== antiga.id);
      }
      const nova =
        u.kind === "video" ? midiaVideo(pid, uploadId, ordem) : midiaImagem(pid, uploadId, ordem);
      g.midias.push(nova);
      u.confirmado = true;
      const c = comportamentos.confirmar[0];
      if (c?.tipo === "gravar-e-503") {
        comportamentos.confirmar.shift();
        return route.fulfill({ status: 503, contentType: "text/html", body: "<html>503</html>" });
      }
      return json(route, 201, { data: { ...resposta(pid), midia: nova } });
    }
    m = caminho.match(/^\/produtos\/([^/]+)\/midias$/);
    if (m && metodo === "GET") return json(route, 200, { data: resposta(m[1]) });
    m = caminho.match(/^\/produtos\/([^/]+)\/midias\/principal$/);
    if (m && metodo === "PUT") {
      if (travas.principal) await travas.principal;
      if (await aplicarComportamento(route, comportamentos.principal)) return;
      galeria(m[1]).midiaPrincipalId = corpo.midiaId;
      return json(route, 200, { data: resposta(m[1]) });
    }
    m = caminho.match(/^\/produtos\/([^/]+)\/midias\/ordem$/);
    if (m && metodo === "PUT") {
      if (await aplicarComportamento(route, comportamentos.ordem)) return;
      const g = galeria(m[1]);
      g.midias = g.midias.map((x) => ({ ...x, ordem: corpo.midiaIds.indexOf(x.id) }));
      return json(route, 200, { data: resposta(m[1]) });
    }
    m = caminho.match(/^\/produtos\/([^/]+)\/midias\/([^/]+)$/);
    if (m && metodo === "DELETE") {
      if (await aplicarComportamento(route, comportamentos.remover)) return;
      const g = galeria(m[1]);
      g.midias = g.midias.filter((x) => x.id !== m[2]);
      if (g.midiaPrincipalId === m[2]) g.midiaPrincipalId = null;
      return json(route, 200, { data: resposta(m[1]) });
    }
    return json(route, 200, { data: [] });
  }

  const contar = (metodo, padrao) =>
    chamadas.filter(([mt, c]) => mt === metodo && padrao.test(c)).length;
  return {
    produtos,
    galerias,
    uploads,
    chamadas,
    puts,
    comportamentos,
    travas,
    semear,
    resposta,
    atender,
    atenderR2,
    contar,
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
  // Aquecimento (pré-otimização de dependências do Vite): a tela de edição renderiza em duas cargas seguidas.
  let seguidas = 0;
  const limite = Date.now() + 240_000;
  while (seguidas < 2) {
    if (Date.now() > limite) throw new Error(`O Vite não estabilizou.\n${saida}`);
    const s = await novaSessao();
    s.backend.semear("prod-aquecimento", 0);
    try {
      await s.abrirEdicao("prod-aquecimento");
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

async function novaSessao({ registrosConfirmacao = {} } = {}) {
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
  await contexto.route(
    (u) => u.host === `localhost:${PORTA}` && u.pathname.startsWith(PREFIXO_R2),
    (r) => backend.atenderR2(r),
  );
  // Fase 22.8.9.9.6 (M4) — os arquivos de teste não são vídeos reais: quando `window.__duracaoTeste` está definido, um
  // `<video>` com URL `blob:` "lê os metadados" com essa duração (simula o navegador; só neste teste).
  await contexto.addInitScript(() => {
    const dur = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "duration");
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        return typeof window.__duracaoTeste === "number" &&
          String(this.getAttribute("src") ?? this.currentSrc ?? "").startsWith("blob:")
          ? window.__duracaoTeste
          : dur.get.call(this);
      },
    });
    const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() {
        return src.get.call(this);
      },
      set(v) {
        src.set.call(this, v);
        if (typeof window.__duracaoTeste === "number" && String(v).startsWith("blob:")) {
          setTimeout(() => this.onloadedmetadata?.(), 0);
        }
      },
    });
  });
  // Fase 22.8.9.9.6 (M4) — registra os atributos de todo <video> com URL https que entra na página (o player troca o
  // <video> pela mensagem de erro assim que a rede externa — bloqueada no teste — falha).
  await contexto.addInitScript(() => {
    window.__videosVistos = [];
    const ver = (v) => {
      const src = v.getAttribute("src") ?? "";
      if (src.startsWith("https:")) {
        window.__videosVistos.push({
          src,
          controls: v.controls,
          preload: v.preload,
          autoplay: v.autoplay,
        });
      }
    };
    new MutationObserver((mudancas) => {
      for (const m of mudancas)
        for (const n of m.addedNodes) {
          if (n instanceof HTMLVideoElement) ver(n);
          else if (n instanceof Element) n.querySelectorAll("video").forEach(ver);
        }
    }).observe(document, { childList: true, subtree: true });
  });
  // Conta as liberações de URLs `blob:` (pré-visualizações).
  await contexto.addInitScript(() => {
    window.__revogadas = [];
    const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (u) => {
      window.__revogadas.push(u);
      original(u);
    };
  });
  let pagina = await contexto.newPage();
  const errosDePagina = [];
  pagina.on("pageerror", (e) => errosDePagina.push(String(e)));
  await pagina.goto(`${BASE}${PREFIXO_API}/preparar`);
  await pagina.evaluate((registros) => {
    localStorage.setItem("mariela.accessToken", "token-ficticio-de-teste");
    for (const [k, v] of Object.entries(registros)) localStorage.setItem(k, v);
  }, registrosConfirmacao);
  return {
    backend,
    contexto,
    /** A página atual; trocá-la ("fechar e reabrir") registra os erros da nova também. */
    get pagina() {
      return pagina;
    },
    set pagina(nova) {
      pagina = nova;
      pagina.on("pageerror", (e) => errosDePagina.push(String(e)));
    },
    async abrirEdicao(id) {
      await pagina.goto(`${BASE}/produtos/${id}/editar`);
      await pagina.getByText("Fotos", { exact: true }).first().waitFor({ timeout: 60_000 });
      await pagina.getByLabel("Galeria de fotos do produto").waitFor({ timeout: 60_000 });
    },
    async encerrar() {
      const api = externas.filter((u) => /\/api\/|\/auth\//.test(u));
      await contexto.close();
      assert.deepEqual(api, [], "requisição de API para fora do backend fictício");
      assert.deepEqual(errosDePagina, [], "erro não tratado na página");
    },
  };
}

const entrada = (p) => p.getByTestId("entrada-fotos");
const itens = (p) => p.getByLabel("Fila de envio").locator("li");
const cartoes = (p) => p.getByLabel("Fotos da galeria").locator("li");
const idsNaGaleria = (p) =>
  cartoes(p).evaluateAll((els) => els.map((e) => e.getAttribute("data-midia-id")));
const esperarTexto = (p, t, timeout = 15_000) => p.getByText(t).first().waitFor({ timeout });
async function esperarEstados(p, estados, timeout = 20_000) {
  await esperarAte(
    async () =>
      JSON.stringify(
        await itens(p).evaluateAll((els) => els.map((e) => e.getAttribute("data-estado"))),
      ) === JSON.stringify(estados),
    `estados ${estados}`,
    timeout,
  );
}
const enviar = (p, n) =>
  p.getByRole("button", { name: `Enviar ${n} ${n === 1 ? "foto" : "fotos"}` }).click();

// ─── Seleção e pré-visualização ─────────────────────────────────────────────────────────────────────────────────────

describe("seleção e pré-visualização", () => {
  test("1, 2, 6. várias fotos de uma vez e seleção incremental; pré-visualização blob:, nome, formato e tamanho", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg"), arquivo("b.png", "image/png")]);
    await esperarAte(async () => (await itens(s.pagina).count()) === 2, "2 itens");
    await entrada(s.pagina).setInputFiles([arquivo("c.webp", "image/webp")]);
    await esperarAte(async () => (await itens(s.pagina).count()) === 3, "3 itens");
    const srcs = await itens(s.pagina)
      .locator("img")
      .evaluateAll((els) => els.map((e) => [e.getAttribute("src"), e.naturalWidth]));
    assert.ok(
      srcs.every(([src]) => src.startsWith("blob:")),
      "pré-visualização deve ser blob:",
    );
    await esperarAte(
      async () =>
        await itens(s.pagina)
          .locator("img")
          .evaluateAll((els) => els.every((e) => e.naturalWidth === 1)),
      "imagens carregadas",
    );
    await esperarTexto(s.pagina, "PNG ·");
    await esperarTexto(s.pagina, "WEBP ·");
    assert.equal(
      s.backend.contar("POST", /midias\/uploads$/),
      0,
      "seleção não pode pedir autorização",
    );
    await esperarTexto(s.pagina, "3 de 10 fotos");
    await s.encerrar();
  });

  test("3, 4, 5. formato inválido, arquivo acima de 5 MiB e limite de 10 recusados ANTES de qualquer requisição", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 8);
    await s.abrirEdicao("prod-a");
    await esperarTexto(s.pagina, "8 de 10 fotos na galeria");
    const grande = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    await entrada(s.pagina).setInputFiles([
      arquivo("anim.gif", "image/gif"),
      arquivo("grande.jpg", "image/jpeg", grande),
      arquivo("ok1.jpg"),
      arquivo("ok2.jpg"),
      arquivo("excedente.jpg"),
    ]);
    await esperarTexto(s.pagina, "3 arquivos não foram aceitos");
    for (const nome of ["anim.gif", "grande.jpg", "excedente.jpg"])
      await esperarTexto(s.pagina, nome);
    await esperarTexto(s.pagina, "excede 5 MB");
    await esperarTexto(s.pagina, "Limite de 10 fotos");
    assert.equal(await itens(s.pagina).count(), 2);
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), 0);
    await s.encerrar();
  });

  test("7. URLs blob: liberadas ao remover da fila e ao sair da tela", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg"), arquivo("b.jpg")]);
    await esperarAte(async () => (await itens(s.pagina).count()) === 2, "2 itens");
    const [srcA, srcB] = await itens(s.pagina)
      .locator("img")
      .evaluateAll((els) => els.map((e) => e.getAttribute("src")));
    await itens(s.pagina).first().getByRole("button", { name: "Remover" }).click();
    await esperarAte(
      async () => (await s.pagina.evaluate(() => window.__revogadas)).includes(srcA),
      "liberação ao remover",
    );
    await s.pagina.getByRole("link", { name: "Produtos" }).first().click(); // sai da tela (desmonta)
    await esperarAte(
      async () => (await s.pagina.evaluate(() => window.__revogadas)).includes(srcB),
      "liberação ao desmontar",
    );
    await s.encerrar();
  });
});

// ─── Envio ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("envio", () => {
  test("8, 9, 10, 12. várias fotos: uma por vez, progresso individual, cabeçalhos exatos; concluída só após a confirmação", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([
      arquivo("a.jpg"),
      arquivo("b.jpg"),
      arquivo("c.png", "image/png"),
    ]);
    let soltarPut;
    s.backend.travas.put = new Promise((r) => (soltarPut = r));
    await enviar(s.pagina, 3);
    await esperarEstados(s.pagina, ["enviando", "aguardando", "aguardando"]);
    assert.equal(
      await itens(s.pagina).first().getByRole("progressbar").count(),
      1,
      "barra de progresso individual",
    );
    assert.equal(s.backend.puts.length, 1, "um envio de cada vez");
    // Confirmação travada: a foto NÃO aparece como concluída antes da resposta.
    let soltarConfirmacao;
    s.backend.travas.confirmar = new Promise((r) => (soltarConfirmacao = r));
    s.backend.travas.put = null;
    soltarPut();
    await esperarEstados(s.pagina, ["confirmando", "aguardando", "aguardando"]);
    assert.equal(await cartoes(s.pagina).count(), 0);
    s.backend.travas.confirmar = null;
    soltarConfirmacao();
    await esperarEstados(s.pagina, ["concluida", "concluida", "concluida"]);
    await esperarAte(async () => (await cartoes(s.pagina).count()) === 3, "3 fotos na galeria");
    assert.deepEqual(
      s.backend.puts.map((x) => [x.metodo, x.contentType, x.cacheControl, x.authorization]),
      [
        ["PUT", "image/jpeg", CACHE_CONTROL, null],
        ["PUT", "image/jpeg", CACHE_CONTROL, null],
        ["PUT", "image/png", CACHE_CONTROL, null],
      ],
    );
    await s.pagina.getByLabel("Foto 1 de 3 (principal)").waitFor({ timeout: 15_000 });
    await s.encerrar();
  });

  test("11. uma foto falha (503 no armazenamento) sem afetar as outras; 'Tentar de novo' a reenvia", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg"), arquivo("b.jpg"), arquivo("c.jpg")]);
    s.backend.comportamentos.put.push({ tipo: "ok" }, { tipo: "erro", status: 503 });
    await enviar(s.pagina, 3);
    await esperarEstados(s.pagina, ["concluida", "falhou", "concluida"]);
    await esperarAte(async () => (await cartoes(s.pagina).count()) === 2, "2 fotos");
    await itens(s.pagina).nth(1).getByRole("button", { name: "Tentar de novo" }).click();
    await enviar(s.pagina, 1);
    await esperarEstados(s.pagina, ["concluida", "concluida", "concluida"]);
    await esperarAte(async () => (await cartoes(s.pagina).count()) === 3, "3 fotos");
    await s.encerrar();
  });
});

// ─── Galeria: principal, ordem, substituição, remoção ──────────────────────────────────────────────────────────────

describe("gerenciamento da galeria", () => {
  test("13. foto principal muda SÓ depois da resposta do backend", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 3);
    await s.abrirEdicao("prod-a");
    await s.pagina.getByLabel("Foto 1 de 3 (principal)").waitFor({ timeout: 15_000 });
    let soltar;
    s.backend.travas.principal = new Promise((r) => (soltar = r));
    await s.pagina.getByRole("button", { name: "Tornar a foto 3 a principal" }).click();
    await dormir(500);
    assert.equal(
      await s.pagina.getByLabel("Foto 1 de 3 (principal)").count(),
      1,
      "mudou antes da resposta",
    );
    s.backend.travas.principal = null;
    soltar();
    await esperarTexto(s.pagina, "Foto principal atualizada.");
    assert.equal(await s.pagina.getByLabel("Foto 3 de 3 (principal)").count(), 1);
    await s.encerrar();
  });

  test("14, 15. reordenar persiste no backend; falha mantém a ordem salva, avisa e permite nova tentativa", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 3);
    await s.abrirEdicao("prod-a");
    await s.pagina.getByRole("button", { name: "Mover foto 1 para depois" }).click();
    await esperarAte(
      async () =>
        JSON.stringify(await idsNaGaleria(s.pagina)) ===
        JSON.stringify(["prod-a-m2", "prod-a-m1", "prod-a-m3"]),
      "nova ordem",
    );
    assert.deepEqual(
      s.backend.chamadas
        .filter(([m, c]) => m === "PUT" && c.endsWith("/ordem"))
        .map(([, , b]) => b),
      [{ midiaIds: ["prod-a-m2", "prod-a-m1", "prod-a-m3"] }],
    );

    s.backend.comportamentos.ordem.push({
      tipo: "erro",
      status: 500,
      message: "Falha fictícia ao salvar a ordem.",
    });
    await s.pagina.getByRole("button", { name: "Mover foto 3 para antes" }).click();
    await esperarTexto(s.pagina, "A nova ordem não foi salva");
    assert.deepEqual(
      await idsNaGaleria(s.pagina),
      ["prod-a-m2", "prod-a-m1", "prod-a-m3"],
      "a ordem não salva foi mostrada como se estivesse salva",
    );
    await s.pagina.getByRole("button", { name: "Tentar salvar de novo" }).click();
    await esperarAte(
      async () =>
        JSON.stringify(await idsNaGaleria(s.pagina)) ===
        JSON.stringify(["prod-a-m2", "prod-a-m3", "prod-a-m1"]),
      "ordem salva na nova tentativa",
    );
    assert.equal(await s.pagina.getByText("A nova ordem não foi salva").count(), 0);
    await s.encerrar();
  });

  test("16, 17. substituição: não consome vaga, a antiga fica até a confirmação, herda posição e principal; falha preserva a antiga", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 10);
    await s.abrirEdicao("prod-a");
    await esperarTexto(s.pagina, "10 de 10 fotos na galeria");
    let soltar;
    s.backend.travas.confirmar = new Promise((r) => (soltar = r));
    await s.pagina.getByTestId("substituir-prod-a-m1").setInputFiles([arquivo("nova.jpg")]);
    await esperarEstados(s.pagina, ["confirmando"]);
    assert.ok(
      (await idsNaGaleria(s.pagina)).includes("prod-a-m1"),
      "a antiga sumiu antes da confirmação",
    );
    s.backend.travas.confirmar = null;
    soltar();
    await esperarEstados(s.pagina, ["concluida"]);
    await esperarAte(
      async () => !(await idsNaGaleria(s.pagina)).includes("prod-a-m1"),
      "antiga substituída",
    );
    const ids = await idsNaGaleria(s.pagina);
    assert.equal(ids.length, 10, "substituição não muda a quantidade");
    assert.match(ids[0], /^upl-/, "a nova herda a posição 1");
    await s.pagina.getByLabel("Foto 1 de 10 (principal)").waitFor({ timeout: 15_000 });

    s.backend.comportamentos.confirmar.push({
      tipo: "erro",
      status: 409,
      code: "CONFLICT",
      message: "A mídia a ser substituída não está mais na galeria.",
    });
    await s.pagina.getByTestId("substituir-prod-a-m2").setInputFiles([arquivo("outra.jpg")]);
    await esperarEstados(s.pagina, ["concluida", "falhou"]);
    await esperarTexto(s.pagina, "A mídia a ser substituída não está mais na galeria.");
    assert.ok(
      (await idsNaGaleria(s.pagina)).includes("prod-a-m2"),
      "falha da substituição removeu a antiga",
    );
    await s.encerrar();
  });

  test("18, 19. remoção pede confirmação, só some depois da resposta; falha mantém a foto", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 3);
    await s.abrirEdicao("prod-a");
    s.backend.comportamentos.remover.push({
      tipo: "erro",
      status: 500,
      message: "Falha fictícia ao remover.",
    });
    await s.pagina.getByRole("button", { name: "Remover a foto 2" }).click();
    await s.pagina.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await esperarTexto(s.pagina, "Falha fictícia ao remover.");
    assert.equal(await cartoes(s.pagina).count(), 3, "a foto sumiu apesar da falha");
    await s.pagina.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await esperarTexto(s.pagina, "Foto removida da galeria.");
    await esperarAte(async () => (await cartoes(s.pagina).count()) === 2, "2 fotos");
    assert.deepEqual(await idsNaGaleria(s.pagina), ["prod-a-m1", "prod-a-m3"]);
    await s.encerrar();
  });
});

// ─── Compatibilidade, cadastro e edição ─────────────────────────────────────────────────────────────────────────────

describe("compatibilidade, cadastro e edição", () => {
  test("20. produto com URLs antigas: continuam exibidas (edição e detalhe), sem conversão nem exclusão", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-legado", 0, {
      fotoPrincipalVarianteId: "var-2",
      variantes: [
        {
          id: "var-1",
          cor: "Preto",
          corNormalizada: "preto",
          codVariante: "V1",
          quantidadeVariante: 0,
          foto: "https://fotos.antigas.test/preto.jpg",
          video: null,
          tamanhos: [],
        },
        {
          id: "var-2",
          cor: "Vinho",
          corNormalizada: "vinho",
          codVariante: "V2",
          quantidadeVariante: 0,
          foto: "https://fotos.antigas.test/vinho.jpg",
          video: null,
          tamanhos: [],
        },
      ],
    });
    await s.abrirEdicao("prod-legado");
    await esperarTexto(s.pagina, "Fotos antigas (URLs cadastradas nas variantes)");
    await esperarTexto(s.pagina, "Continuam valendo enquanto a galeria não tiver fotos");
    assert.equal(await s.pagina.getByLabel("Fotos antigas das variantes").locator("li").count(), 2);
    await esperarTexto(s.pagina, "A galeria ainda não tem fotos.");
    await s.pagina.goto(`${BASE}/produtos/prod-legado`);
    await esperarTexto(s.pagina, "Fotos antigas, cadastradas nas variantes.");
    await s.pagina.getByRole("button", { name: "Ver foto Vinho" }).waitFor();
    assert.equal(
      s.backend.contar("PUT", /produtos\/prod-legado$/),
      0,
      "nada pode ser alterado no produto legado",
    );
    await s.encerrar();
  });

  test("21. cadastro: fotos escolhidas antes; produto criado UMA vez; só depois do id confirmado os envios começam", async () => {
    const s = await novaSessao();
    await s.pagina.goto(`${BASE}/produtos/novo`);
    await s.pagina.locator("#nome").waitFor({ timeout: 60_000 });
    await s.pagina.locator("#nome").fill("Vestido Novo Fictício");
    await s.pagina.locator("#categoria").click();
    await s.pagina.getByRole("option", { name: "Vestidos" }).click();
    await s.pagina.locator("#precoCusto").fill("50");
    await s.pagina.locator("#precoVenda").fill("120");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg"), arquivo("b.jpg")]);
    await esperarAte(async () => (await itens(s.pagina).count()) === 2, "2 itens");
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), 0);
    await s.pagina.getByRole("button", { name: "Criar produto" }).click();
    await esperarTexto(s.pagina, "As fotos escolhidas estão sendo enviadas para a galeria.");
    await esperarEstados(s.pagina, ["concluida", "concluida"]);
    assert.equal(s.backend.contar("POST", /^\/produtos$/), 1, "produto criado mais de uma vez");
    const iCriar = s.backend.chamadas.findIndex(([m, c]) => m === "POST" && c === "/produtos");
    const iPrimeiroUpload = s.backend.chamadas.findIndex(
      ([m, c]) => m === "POST" && /midias\/uploads$/.test(c),
    );
    assert.ok(iCriar >= 0 && iPrimeiroUpload > iCriar, "upload antes do produto existir");
    assert.match(s.backend.chamadas[iPrimeiroUpload][1], /^\/produtos\/prod-novo-1\//);
    await esperarAte(
      async () => (await cartoes(s.pagina).count()) === 2,
      "2 fotos na galeria do novo produto",
    );
    await s.encerrar();
  });

  test("22. cadastro falha: nenhum envio; a seleção continua lá", async () => {
    const s = await novaSessao();
    s.backend.comportamentos.criar.push({
      tipo: "erro",
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Cadastro recusado (fictício).",
    });
    await s.pagina.goto(`${BASE}/produtos/novo`);
    await s.pagina.locator("#nome").waitFor({ timeout: 60_000 });
    await s.pagina.locator("#nome").fill("Vestido Recusado");
    await s.pagina.locator("#categoria").click();
    await s.pagina.getByRole("option", { name: "Vestidos" }).click();
    await s.pagina.locator("#precoCusto").fill("50");
    await s.pagina.locator("#precoVenda").fill("120");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg")]);
    await s.pagina.getByRole("button", { name: "Criar produto" }).click();
    await esperarTexto(s.pagina, "Cadastro recusado (fictício).");
    await dormir(1000);
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), 0, "envio sem produto criado");
    await esperarEstados(s.pagina, ["aguardando"]);
    await s.encerrar();
  });

  test("23. edição: salvar os dados do produto e a galeria são independentes", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 2);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg")]);
    s.backend.comportamentos.solicitar.push({
      tipo: "erro",
      status: 503,
      code: "STORAGE_UNAVAILABLE",
      message: "Armazenamento indisponível (fictício).",
    });
    await enviar(s.pagina, 1);
    await esperarEstados(s.pagina, ["falhou"]);
    await s.pagina.locator("#nome").fill("Nome Alterado Fictício");
    await s.pagina.getByRole("button", { name: "Salvar alterações" }).click();
    await esperarTexto(s.pagina, "Produto atualizado com sucesso.");
    assert.equal(s.backend.produtos.get("prod-a").nome, "Nome Alterado Fictício");
    assert.equal(
      s.backend.resposta("prod-a").midias.length,
      2,
      "a galeria mudou ao salvar o produto",
    );
    await s.encerrar();
  });
});

// ─── Pendências duráveis ────────────────────────────────────────────────────────────────────────────────────────────

function registroConfirmacao(produtoId, uploadId, confirmacao = {}) {
  return JSON.stringify({
    versao: 1,
    produtoId,
    uploadId,
    kind: "image",
    confirmacao,
    estado: "pendente",
    criadoEm: "2026-11-19T09:30:00.000Z",
  });
}

describe("confirmações pendentes", () => {
  test("24, 25. pendência de uma abertura anterior: aparece, nada é enviado sozinho; 'Verificar e confirmar' faz GET e depois POST com o MESMO uploadId e corpo", async () => {
    const s = await novaSessao({
      registrosConfirmacao: {
        [`${PREFIXO_CONFIRMACOES}upl-antigo`]: registroConfirmacao("prod-a", "upl-antigo", {
          principal: true,
        }),
      },
    });
    s.backend.semear("prod-a", 1);
    s.backend.uploads.set("upl-antigo", {
      produtoId: "prod-a",
      contentType: "image/jpeg",
      size: PNG.length,
      substitui: null,
      recebido: true,
      confirmado: false,
    });
    await s.abrirEdicao("prod-a");
    await esperarTexto(s.pagina, "Confirmações pendentes");
    await esperarTexto(s.pagina, "Confirmação sem resultado conclusivo");
    await dormir(1500);
    assert.equal(s.backend.contar("POST", /confirmacao$/), 0, "confirmação enviada sozinha");
    // Pendência bloqueia novo envio do produto até ser reconciliada.
    await entrada(s.pagina).setInputFiles([arquivo("x.jpg")]);
    await enviar(s.pagina, 1);
    await esperarTexto(s.pagina, "Há um envio deste produto aguardando confirmação");
    const antes = s.backend.chamadas.length;
    await s.pagina.getByRole("button", { name: "Verificar e confirmar" }).click();
    await esperarTexto(s.pagina, "Foto confirmada na galeria.");
    const depois = s.backend.chamadas.slice(antes).map(([m, c, b]) => [m, c, b]);
    const iGet = depois.findIndex(([m, c]) => m === "GET" && /\/midias$/.test(c));
    const iPost = depois.findIndex(([m, c]) => m === "POST" && /confirmacao$/.test(c));
    assert.ok(iGet >= 0 && iPost > iGet, "galeria não foi consultada antes");
    assert.equal(depois[iPost][1], "/produtos/prod-a/midias/uploads/upl-antigo/confirmacao");
    assert.deepEqual(depois[iPost][2], { principal: true });
    assert.equal(
      s.backend.contar("POST", /midias\/uploads$/),
      0,
      "nenhum upload novo na reconciliação",
    );
    await esperarAte(
      async () => (await s.pagina.getByText("Confirmações pendentes").count()) === 0,
      "pendência encerrada",
    );
    await esperarAte(
      async () => (await idsNaGaleria(s.pagina)).includes("upl-antigo"),
      "foto na galeria",
    );
    await s.encerrar();
  });

  test("24b. pendência cuja foto JÁ está na galeria é encerrada pela verificação de abertura (só GET)", async () => {
    const s = await novaSessao({
      registrosConfirmacao: {
        [`${PREFIXO_CONFIRMACOES}prod-a-m1`]: registroConfirmacao("prod-a", "prod-a-m1"),
      },
    });
    s.backend.semear("prod-a", 1);
    await s.abrirEdicao("prod-a");
    await esperarAte(
      async () =>
        (await s.pagina.evaluate(
          (k) => localStorage.getItem(k),
          `${PREFIXO_CONFIRMACOES}prod-a-m1`,
        )) === null,
      "registro removido",
    );
    assert.equal(s.backend.contar("POST", /confirmacao$/), 0);
    await s.encerrar();
  });

  test("26. falha ao gravar o registro: confirmação não enviada; 'Tentar confirmar de novo' usa o MESMO uploadId, sem novo envio", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await s.pagina.evaluate((prefixo) => {
      const original = Storage.prototype.setItem;
      window.__restaurar = () => (Storage.prototype.setItem = original);
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith(prefixo))
          throw new DOMException("cheio (teste)", "QuotaExceededError");
        return original.call(this, k, v);
      };
    }, PREFIXO_CONFIRMACOES);
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg")]);
    await enviar(s.pagina, 1);
    await esperarEstados(s.pagina, ["confirmacao_nao_enviada"]);
    await esperarTexto(s.pagina, "Por segurança, ela NÃO foi enviada");
    assert.equal(s.backend.contar("POST", /confirmacao$/), 0);
    await s.pagina.evaluate(() => window.__restaurar());
    await s.pagina.getByRole("button", { name: "Tentar confirmar de novo" }).click();
    await esperarEstados(s.pagina, ["concluida"]);
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), 1, "novo upload na retomada");
    assert.equal(s.backend.puts.length, 1, "arquivo reenviado na retomada");
    const confirmacoes = s.backend.chamadas
      .filter(([m, c]) => m === "POST" && /confirmacao$/.test(c))
      .map(([, c]) => c);
    assert.equal(confirmacoes.length, 1);
    assert.match(
      confirmacoes[0],
      new RegExp(`/uploads/${s.backend.puts[0].uploadId}/confirmacao$`),
    );
    await s.encerrar();
  });
});

// ─── Erros ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe("erros", () => {
  test("27, 28, 29. 409, 429 (com Retry-After exibido) e falha de rede: falha clara por item, nada repetido sozinho", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg"), arquivo("b.jpg"), arquivo("c.jpg")]);
    s.backend.comportamentos.solicitar.push(
      { tipo: "erro", status: 409, code: "CONFLICT", message: "Limite fictício atingido." },
      {
        tipo: "erro",
        status: 429,
        code: "TOO_MANY_REQUESTS",
        message: "Muitas solicitações (fictício).",
        headers: { "Retry-After": "37" },
      },
      { tipo: "abortar" },
    );
    await enviar(s.pagina, 3);
    await esperarEstados(s.pagina, ["falhou", "falhou", "falhou"]);
    await esperarTexto(s.pagina, "Limite fictício atingido.");
    await esperarTexto(s.pagina, "Muitas solicitações (fictício).");
    await esperarTexto(s.pagina, "Aguarde cerca de 37 s antes de tentar de novo.");
    await esperarTexto(s.pagina, "Não foi possível falar com o servidor.");
    const solicitacoes = s.backend.contar("POST", /midias\/uploads$/);
    await dormir(2000);
    assert.equal(
      s.backend.contar("POST", /midias\/uploads$/),
      solicitacoes,
      "repetição automática",
    );
    assert.equal(s.backend.puts.length, 0);
    await s.encerrar();
  });

  test("30. confirmação inconclusiva (gravou e respondeu 503): fica pendente; 'Verificar confirmação' encontra a foto pela galeria, sem novo POST", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-a", 0);
    await s.abrirEdicao("prod-a");
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg")]);
    s.backend.comportamentos.confirmar.push({ tipo: "gravar-e-503" });
    await enviar(s.pagina, 1);
    await esperarEstados(s.pagina, ["confirmacao_pendente"]);
    await esperarTexto(s.pagina, "Não se sabe se a foto entrou na galeria.");
    await esperarTexto(s.pagina, "Confirmações pendentes");
    const confirmacoes = s.backend.contar("POST", /confirmacao$/);
    await itens(s.pagina).first().getByRole("button", { name: "Verificar confirmação" }).click();
    await esperarEstados(s.pagina, ["concluida"]);
    assert.equal(
      s.backend.contar("POST", /confirmacao$/),
      confirmacoes,
      "POST repetido apesar de a foto já estar na galeria",
    );
    await esperarAte(
      async () => (await s.pagina.getByText("Confirmações pendentes").count()) === 0,
      "pendência encerrada",
    );
    await s.encerrar();
  });
});

// ─── Fase 22.8.9.9.6 (M4) — vídeo do produto ──────────────────────────────────────────────────────────────────────

const MP4 = Buffer.from("conteudo-ficticio-de-video-mp4");
const videoMp4 = (nome = "video.mp4", buffer = MP4) => ({
  name: nome,
  mimeType: "video/mp4",
  buffer,
});
const entradaVideo = (p) => p.getByTestId("entrada-video");
const itensVideo = (p) => p.getByLabel("Envio de vídeo").locator("li");
const playerDoProduto = (p) =>
  p.getByLabel("Vídeo do produto").locator("video[aria-label^='Vídeo de']");
async function estadosVideo(p, estados, timeout = 20_000) {
  await esperarAte(
    async () =>
      JSON.stringify(
        await itensVideo(p).evaluateAll((els) => els.map((e) => e.getAttribute("data-estado"))),
      ) === JSON.stringify(estados),
    `estados do vídeo ${estados}`,
    timeout,
  );
}
const duracao = (p, s) => p.evaluate((v) => (window.__duracaoTeste = v), s);

describe("vídeo do produto (M4)", () => {
  test("1, 8, 9. vídeo válido: duração exibida, progresso, concluído só após a confirmação; player com a URL da galeria, sem autoplay", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 2);
    await s.abrirEdicao("prod-v");
    await esperarTexto(s.pagina, "Este produto ainda não tem vídeo.");
    await duracao(s.pagina, 12);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("desfile.mp4")]);
    await estadosVideo(s.pagina, ["aguardando"]);
    await esperarTexto(s.pagina, "MP4 ·");
    await esperarTexto(s.pagina, "· 12 s");
    let soltarPut;
    s.backend.travas.put = new Promise((r) => (soltarPut = r));
    let soltarConfirmacao;
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["enviando"]);
    assert.equal(await itensVideo(s.pagina).first().getByRole("progressbar").count(), 1);
    s.backend.travas.confirmar = new Promise((r) => (soltarConfirmacao = r));
    s.backend.travas.put = null;
    soltarPut();
    await estadosVideo(s.pagina, ["confirmando"]);
    assert.equal(await playerDoProduto(s.pagina).count(), 0, "vídeo apareceu antes da confirmação");
    s.backend.travas.confirmar = null;
    soltarConfirmacao();
    await estadosVideo(s.pagina, ["concluida"]);
    await esperarAte(
      async () =>
        (await s.pagina
          .getByLabel("Vídeo do produto")
          .locator("[data-midia-id^='upl-']")
          .count()) === 1,
      "vídeo confirmado",
    );
    const put = s.backend.puts.at(-1);
    assert.deepEqual(
      [put.metodo, put.contentType, put.cacheControl, put.authorization],
      ["PUT", "video/mp4", CACHE_CONTROL, null],
    );
    // O player usa a URL PÚBLICA da galeria, controles nativos, preload=metadata e nada de autoplay. Como a rede
    // externa está bloqueada no teste, o erro de reprodução vira mensagem clara.
    const vistos = await s.pagina.evaluate(() => window.__videosVistos);
    const doProduto = vistos.filter((v) => /\/products\/prod-v\/upl-\d+\.mp4$/.test(v.src));
    assert.ok(
      doProduto.length >= 1,
      `player não montado com a URL da galeria: ${JSON.stringify(vistos)}`,
    );
    for (const v of doProduto) {
      assert.match(v.src, /^https:\/\/midia\.ficticia\.test\/products\/prod-v\/upl-\d+\.mp4$/);
      assert.deepEqual([v.controls, v.preload, v.autoplay], [true, "metadata", false]);
    }
    await esperarTexto(s.pagina, "Não foi possível reproduzir o vídeo.");
    assert.equal(await cartoes(s.pagina).count(), 2, "as fotos foram afetadas");
    await s.encerrar();
  });

  test("2, 3, 4. formato inválido, acima de 15 MiB e acima de 30 s recusados ANTES de qualquer requisição", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 0);
    await s.abrirEdicao("prod-v");
    await entradaVideo(s.pagina).setInputFiles([
      { name: "clip.webm", mimeType: "video/webm", buffer: MP4 },
    ]);
    await esperarTexto(s.pagina, "Tipo de arquivo não permitido. Use: video/mp4.");
    await entradaVideo(s.pagina).setInputFiles([
      videoMp4("grande.mp4", Buffer.alloc(15 * 1024 * 1024 + 1)),
    ]);
    await esperarTexto(s.pagina, "excede 15 MB");
    await duracao(s.pagina, 45);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("longo.mp4")]);
    await esperarTexto(s.pagina, "O vídeo tem 45 s; o máximo é 30 s.");
    assert.equal(await itensVideo(s.pagina).count(), 0);
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), 0);
    await s.encerrar();
  });

  test("5, 19. um vídeo por vez: segundo arquivo recusado; 409 do backend (limite) vira falha clara", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 0);
    await s.abrirEdicao("prod-v");
    await duracao(s.pagina, 10);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("a.mp4")]);
    await estadosVideo(s.pagina, ["aguardando"]);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("b.mp4")]);
    await esperarTexto(s.pagina, "Já há um vídeo selecionado ou em envio para este produto.");
    assert.equal(await itensVideo(s.pagina).count(), 1);
    s.backend.comportamentos.solicitar.push({
      tipo: "erro",
      status: 409,
      code: "CONFLICT",
      message: "Limite de 1 vídeo por produto atingido.",
    });
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["falhou"]);
    await esperarTexto(s.pagina, "Limite de 1 vídeo por produto atingido.");
    await s.encerrar();
  });

  test("6, 7. substituição: o vídeo anterior fica até a confirmação; falha na substituição preserva o anterior", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 1, {}, { video: true });
    await s.abrirEdicao("prod-v");
    await s.pagina.getByRole("button", { name: "Substituir vídeo" }).waitFor();
    await duracao(s.pagina, 20);
    s.backend.comportamentos.confirmar.push({
      tipo: "erro",
      status: 409,
      code: "CONFLICT",
      message: "A mídia a ser substituída não está mais na galeria.",
    });
    await entradaVideo(s.pagina).setInputFiles([videoMp4("novo.mp4")]);
    await s.pagina.getByRole("button", { name: "Enviar e substituir" }).click();
    await estadosVideo(s.pagina, ["falhou"]);
    assert.equal(
      await s.pagina.locator("[data-midia-id='prod-v-v1']").count(),
      1,
      "o vídeo anterior sumiu apesar da falha",
    );
    await itensVideo(s.pagina).first().getByRole("button", { name: "Remover" }).click();

    let soltar;
    s.backend.travas.confirmar = new Promise((r) => (soltar = r));
    await entradaVideo(s.pagina).setInputFiles([videoMp4("novo2.mp4")]);
    await s.pagina.getByRole("button", { name: "Enviar e substituir" }).click();
    await estadosVideo(s.pagina, ["confirmando"]);
    assert.equal(
      await s.pagina.locator("[data-midia-id='prod-v-v1']").count(),
      1,
      "o anterior sumiu antes da confirmação",
    );
    s.backend.travas.confirmar = null;
    soltar();
    await estadosVideo(s.pagina, ["concluida"]);
    await esperarAte(
      async () => (await s.pagina.locator("[data-midia-id='prod-v-v1']").count()) === 0,
      "anterior substituído",
    );
    assert.equal(
      s.backend.resposta("prod-v").midias.filter((x) => x.tipo === "video").length,
      1,
      "mais de um vídeo",
    );
    assert.equal(await cartoes(s.pagina).count(), 1, "as fotos foram afetadas");
    await s.encerrar();
  });

  test("10, 11. falha na solicitação (503) e no PUT ao armazenamento: falhou, nada muda na galeria", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 0);
    await s.abrirEdicao("prod-v");
    await duracao(s.pagina, 5);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("a.mp4")]);
    s.backend.comportamentos.solicitar.push({
      tipo: "erro",
      status: 503,
      code: "STORAGE_UNAVAILABLE",
      message: "Armazenamento indisponível (fictício).",
    });
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["falhou"]);
    await esperarTexto(s.pagina, "Armazenamento indisponível (fictício).");
    await itensVideo(s.pagina).first().getByRole("button", { name: "Tentar de novo" }).click();
    s.backend.comportamentos.put.push({ tipo: "erro", status: 503 });
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["falhou"]);
    assert.equal(s.backend.contar("POST", /confirmacao$/), 0, "confirmou sem o arquivo");
    assert.equal(s.backend.resposta("prod-v").midias.length, 0);
    await s.encerrar();
  });

  test("12, 13, 14, 15, 16. confirmação inconclusiva: pendente; recarregar e reabrir mantêm; nada automático; verificação pela galeria, mesmo uploadId", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 0);
    await s.abrirEdicao("prod-v");
    await duracao(s.pagina, 8);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("a.mp4")]);
    s.backend.comportamentos.confirmar.push({
      tipo: "erro",
      status: 503,
      code: "STORAGE_UNAVAILABLE",
      message: "Indisponível (fictício).",
    });
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["confirmacao_pendente"]);
    const uploadId = s.backend.puts.at(-1).uploadId;
    // 13. recarregar
    await s.pagina.reload();
    await s.pagina.getByLabel("Galeria de fotos do produto").waitFor({ timeout: 60_000 });
    await esperarTexto(s.pagina, "Confirmações pendentes");
    await esperarTexto(s.pagina, "Vídeo ·");
    // 14. fechar e reabrir (nova página no mesmo perfil; o registro durável continua)
    const nova = await s.contexto.newPage();
    await s.pagina.close();
    s.pagina = nova;
    await s.abrirEdicao("prod-v");
    await esperarTexto(s.pagina, "Confirmações pendentes");
    await dormir(1500);
    const confirmacoesAntes = s.backend.contar("POST", /confirmacao$/);
    assert.equal(confirmacoesAntes, 1, "15: confirmação reenviada automaticamente");
    // Pendência bloqueia novo vídeo do produto.
    await entradaVideo(s.pagina).setInputFiles([videoMp4("outro.mp4")]);
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await esperarTexto(s.pagina, "Há um envio deste produto aguardando confirmação");
    const antes = s.backend.chamadas.length;
    await s.pagina.getByRole("button", { name: "Verificar e confirmar" }).click();
    await esperarTexto(s.pagina, "Vídeo confirmado na galeria.");
    const depois = s.backend.chamadas.slice(antes);
    const iGet = depois.findIndex(([m, c]) => m === "GET" && /\/midias$/.test(c));
    const iPost = depois.findIndex(([m, c]) => m === "POST" && /confirmacao$/.test(c));
    assert.ok(iGet >= 0 && iPost > iGet, "a galeria não foi consultada antes");
    assert.equal(
      depois[iPost][1],
      `/produtos/prod-v/midias/uploads/${uploadId}/confirmacao`,
      "16: outro uploadId",
    );
    assert.deepEqual(depois[iPost][2], {}, "16: outro corpo");
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), 1, "novo upload na recuperação");
    await esperarAte(
      async () => (await s.pagina.locator(`[data-midia-id='${uploadId}']`).count()) === 1,
      "vídeo na galeria",
    );
    await s.encerrar();
  });

  test("17, 18. remoção pede confirmação; falha mantém o vídeo; sucesso remove só depois da resposta", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 1, {}, { video: true });
    await s.abrirEdicao("prod-v");
    s.backend.comportamentos.remover.push({
      tipo: "erro",
      status: 500,
      message: "Falha fictícia ao remover o vídeo.",
    });
    await s.pagina.getByRole("button", { name: "Remover o vídeo" }).click();
    await s.pagina.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await esperarTexto(s.pagina, "Falha fictícia ao remover o vídeo.");
    assert.equal(await s.pagina.locator("[data-midia-id='prod-v-v1']").count(), 1);
    await s.pagina.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await esperarTexto(s.pagina, "Vídeo removido do produto.");
    await esperarTexto(s.pagina, "Este produto ainda não tem vídeo.");
    assert.equal(await cartoes(s.pagina).count(), 1, "a foto foi removida junto");
    await s.encerrar();
  });

  test("20, 21. 429 com Retry-After e falha de rede: mensagem clara, sem repetição e SEM logout", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 0);
    await s.abrirEdicao("prod-v");
    await duracao(s.pagina, 5);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("a.mp4")]);
    s.backend.comportamentos.solicitar.push({
      tipo: "erro",
      status: 429,
      code: "TOO_MANY_REQUESTS",
      message: "Muitas solicitações (fictício).",
      headers: { "Retry-After": "41" },
    });
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["falhou"]);
    await esperarTexto(s.pagina, "Aguarde cerca de 41 s antes de tentar de novo.");
    await itensVideo(s.pagina).first().getByRole("button", { name: "Tentar de novo" }).click();
    s.backend.comportamentos.solicitar.push({ tipo: "abortar" });
    await s.pagina.getByRole("button", { name: "Enviar vídeo" }).click();
    await estadosVideo(s.pagina, ["falhou"]);
    await esperarTexto(s.pagina, "Não foi possível falar com o servidor.");
    const n = s.backend.contar("POST", /midias\/uploads$/);
    await dormir(1500);
    assert.equal(s.backend.contar("POST", /midias\/uploads$/), n, "repetição automática");
    assert.ok(s.pagina.url().endsWith("/produtos/prod-v/editar"), "saiu da tela (logout?)");
    assert.equal(
      await s.pagina.evaluate(() => localStorage.getItem("mariela.accessToken")),
      "token-ficticio-de-teste",
      "sessão encerrada por falha temporária",
    );
    await s.encerrar();
  });

  test("detalhe: player do vídeo da galeria; cadastro envia o vídeo depois de criar o produto", async () => {
    const s = await novaSessao();
    s.backend.semear("prod-v", 1, {}, { video: true });
    await s.pagina.goto(`${BASE}/produtos/prod-v`);
    await esperarTexto(s.pagina, "Vídeo do produto");
    const v = s.pagina.locator("video[aria-label^='Vídeo de']").first();
    await v.waitFor({ timeout: 30_000 }).catch(() => undefined);
    await esperarTexto(s.pagina, "Não foi possível reproduzir o vídeo."); // rede externa bloqueada no teste
    const noDetalhe = await s.pagina.evaluate(() => window.__videosVistos);
    assert.ok(
      noDetalhe.some(
        (v) =>
          v.src.endsWith("/products/prod-v/prod-v-v1.mp4") &&
          v.controls &&
          v.preload === "metadata" &&
          !v.autoplay,
      ),
      `player do detalhe: ${JSON.stringify(noDetalhe)}`,
    );

    await s.pagina.goto(`${BASE}/produtos/novo`);
    await s.pagina.locator("#nome").waitFor({ timeout: 60_000 });
    await s.pagina.locator("#nome").fill("Vestido Com Vídeo");
    await s.pagina.locator("#categoria").click();
    await s.pagina.getByRole("option", { name: "Vestidos" }).click();
    await s.pagina.locator("#precoCusto").fill("50");
    await s.pagina.locator("#precoVenda").fill("120");
    await duracao(s.pagina, 9);
    await entrada(s.pagina).setInputFiles([arquivo("a.jpg")]);
    await entradaVideo(s.pagina).setInputFiles([videoMp4("v.mp4")]);
    await estadosVideo(s.pagina, ["aguardando"]);
    assert.equal(
      s.backend.contar("POST", /midias\/uploads$/),
      0,
      "envio antes de o produto existir",
    );
    await s.pagina.getByRole("button", { name: "Criar produto" }).click();
    await estadosVideo(s.pagina, ["concluida"], 30_000);
    assert.equal(s.backend.contar("POST", /^\/produtos$/), 1);
    const kinds = s.backend.chamadas
      .filter(([m, c]) => m === "POST" && /midias\/uploads$/.test(c))
      .map(([, c, b]) => [c.split("/")[2], b.kind]);
    assert.deepEqual(
      kinds,
      [
        ["prod-novo-1", "image"],
        ["prod-novo-1", "video"],
      ],
      "ordem/produto dos envios",
    );
    await s.encerrar();
  });
});
