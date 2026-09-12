// Etapa 20.19 — fechamento dos riscos residuais de reentrância + validação
// final controlada (script ad-hoc, não é suíte permanente). Dirige o Chrome
// do sistema via Playwright contra o Backoffice real + backend real.
// Reutiliza a infraestrutura das Etapas 20.12-20.18.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const TAG = "E2E2019";

const resultados = [];
function log(secao, ok, detalhe) {
  resultados.push({ secao, ok, detalhe });
  const rotulo = ok === null ? "N/T " : ok ? "OK  " : "FAIL";
  console.log(`${rotulo} [${secao}] ${detalhe ?? ""}`);
}
async function tentar(secao, fn) {
  try {
    await fn();
  } catch (err) {
    log(secao, false, `EXCEÇÃO: ${err.message?.split("\n")[0]}`);
  }
}

const consoleErros = [];
const redeErros = [];
const respostas4xx = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErros.push(msg.text());
});
page.on("requestfailed", (req) => {
  redeErros.push(`REQFAIL ${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
});
page.on("response", (res) => {
  if (res.status() >= 500) redeErros.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  if (res.status() >= 400 && res.status() < 500) respostas4xx.push(`${res.status()} ${res.request().method()} ${res.url()}`);
});

async function tokenAtual() {
  const resp = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: USUARIO_TESTE, senha: SENHA_TESTE }),
  });
  return (await resp.json()).data.accessToken;
}
async function api(path, opts) {
  const token = await tokenAtual();
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
}
async function cliqueDuploForcado(locator) {
  const resultado = await Promise.allSettled([
    locator.click({ force: true, timeout: 3000 }),
    locator.click({ force: true, timeout: 3000 }),
  ]);
  return resultado.map((r) => r.status);
}
function contadorRequests(matcher) {
  const chamadas = [];
  const handler = (req) => {
    if (matcher(req)) chamadas.push({ url: req.url(), method: req.method() });
  };
  page.on("request", handler);
  return { chamadas, parar: () => page.off("request", handler) };
}

// ================= LOGIN =================
await tentar("login-valido", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", SENHA_TESTE);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  log("login-valido", page.url().includes("/dashboard"), `url=${page.url()}`);
});

// ================= FASE 9: PROBE WHATSAPP =================
await tentar("probe-whatsapp-endpoint", async () => {
  const resp = await api("/integracoes/whatsapp/mensagens", {
    method: "POST",
    body: JSON.stringify({ clienteId: "000000000000000000000000", telefone: "83999999999", mensagem: "probe" }),
  });
  log(
    "probe-whatsapp-endpoint",
    true,
    `httpStatus=${resp.status} — ${resp.status === 404 ? "endpoint ainda não implementado (Nível D mantido)" : "endpoint agora existe; reavaliar"}`,
  );
});

// ================= SEED: produto + categoria para os testes de edição/promoção =================
await tentar("seed-config", async () => {
  const r = await api("/configuracoes/categorias", { method: "POST", body: JSON.stringify({ valor: `${TAG}-Categoria` }) });
  log("seed-config", r.ok, `categoria=${r.status}`);
});

let produtoId = "";
const nomeProduto = `${TAG} Produto`;
await tentar("seed-produto", async () => {
  await page.goto(`${BASE}/produtos/novo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", nomeProduto);
  await page.click("#categoria");
  await page.click(`[role="option"]:has-text("${TAG}-Categoria")`);
  await page.fill("#precoCusto", "50");
  await page.fill("#precoVenda", "100");
  await Promise.all([
    page.waitForURL(/\/produtos\/[a-f0-9]+$/, { timeout: 10000 }),
    page.click('button[type="submit"]:has-text("Criar produto")'),
  ]);
  produtoId = page.url().split("/").pop();
  log("seed-produto", produtoId !== "", `produtoId=${produtoId}`);
});

// ================= FASE 4: EDIÇÃO — TESTE REPRESENTATIVO (Produto editar, ProdutoForm compartilhado) =================
await tentar("fase4-duplo-submit-produto-editar", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}/editar`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", `${nomeProduto} Editado`);

  const captura = contadorRequests((req) => req.url().endsWith(`/produtos/${produtoId}`) && req.method() === "PUT");
  const botao = page.locator('button[type="submit"]:has-text("Salvar alterações")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  log(
    "fase4-duplo-submit-produto-editar",
    captura.chamadas.length === 1,
    `requestsPUT=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)} — ProdutoForm compartilhado por criar/editar; guarda já validada no modo criar (Etapa 20.17)`,
  );
});

// ================= FASE 5: REGRESSÃO DE PROMOÇÃO (ativar → desativar → ativar, cliques únicos sequenciais) =================
await tentar("fase5-regressao-promocao-ativar1", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.waitForSelector('button:has-text("Ativar promoção")', { timeout: 8000 });
  await page.click('button:has-text("Ativar promoção")');
  await page.waitForSelector("#precoPromocional", { timeout: 5000 });
  await page.fill("#precoPromocional", "80");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/promocao") && r.request().method() === "PATCH", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Ativar promoção")'),
  ]);
  await page.waitForTimeout(500);
  log("fase5-regressao-promocao-ativar1", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("fase5-regressao-promocao-desativar", async () => {
  await page.waitForSelector('button:has-text("Desativar promoção")', { timeout: 8000 });
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/promocao") && r.request().method() === "PATCH", { timeout: 8000 }),
    page.click('button:has-text("Desativar promoção")'),
  ]);
  await page.waitForTimeout(500);
  log("fase5-regressao-promocao-desativar", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("fase5-regressao-promocao-ativar2", async () => {
  await page.waitForSelector('button:has-text("Ativar promoção")', { timeout: 8000 });
  await page.click('button:has-text("Ativar promoção")');
  await page.waitForSelector("#precoPromocional", { timeout: 5000 });
  await page.fill("#precoPromocional", "70");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/promocao") && r.request().method() === "PATCH", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Ativar promoção")'),
  ]);
  await page.waitForTimeout(500);
  log(
    "fase5-regressao-promocao-ativar2",
    resp.ok(),
    `httpStatus=${resp.status()} — confirma que a guarda de PromocaoDialog/desativar não ficou travada após o ciclo anterior`,
  );
});

// ================= LIMPEZA =================
await tentar("limpeza", async () => {
  const r1 = await api(`/produtos/${produtoId}`, { method: "DELETE" });
  const r2 = await api(`/configuracoes/categorias/${encodeURIComponent(`${TAG}-Categoria`)}`, { method: "DELETE" });
  log("limpeza", r1.ok && r2.ok, `produto=${r1.ok} categoria=${r2.ok}`);
});

// ================= REDE DE SEGURANÇA: VARREDURA FINAL POR RESÍDUOS =================
await tentar("rede-seguranca-varredura-final", async () => {
  const achados = [];
  async function varrer(path) {
    const resp = await api(`${path}?limit=100`);
    const json = await resp.json();
    const itens = json.data ?? [];
    for (const item of itens) {
      if (item.nome?.includes(TAG)) {
        achados.push(`${path}/${item.id} (${item.nome})`);
        await api(`${path}/${item.id}`, { method: "DELETE" });
      }
    }
  }
  await varrer("/produtos");
  const configResp = await api("/configuracoes");
  const config = (await configResp.json()).data;
  for (const item of [...config.categorias, ...config.cores, ...config.tamanhos]) {
    if (item.includes(TAG)) achados.push(`configuracoes/${item}`);
  }
  log(
    "rede-seguranca-varredura-final",
    achados.length === 0,
    achados.length === 0 ? "nenhum resíduo encontrado (busca por E2E2019)" : `resíduos encontrados e removidos: ${JSON.stringify(achados)}`,
  );
});

// ================= FASE 8: VERIFICAÇÃO DE CAIXA =================
await tentar("verificacao-caixa-nenhum-aberto", async () => {
  const resp = await api("/caixas/atual");
  const json = await resp.json();
  log("verificacao-caixa-nenhum-aberto", json.data === null, `caixas/atual=${JSON.stringify(json.data)}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
console.log("--- erros de rede (>=500 ou requestfailed):", redeErros.length, JSON.stringify(redeErros));
console.log("--- respostas 4xx (diagnóstico):", respostas4xx.length, JSON.stringify(respostas4xx, null, 2));
fs.writeFileSync("e2e/.resultado-2019.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
