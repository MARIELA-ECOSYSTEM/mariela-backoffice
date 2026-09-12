// Etapa 20.21 — auditoria da próxima superfície de risco de reentrância
// (script ad-hoc, não é suíte permanente). Dirige o Chrome do sistema via
// Playwright contra o Backoffice real + backend real. Reutiliza a
// infraestrutura das Etapas 20.12-20.20.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";

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

// ================= PROBE: WhatsApp continua não implementado? (reverificação) =================
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

// ================= CANDIDATO 1: LOGIN — duplo clique em "Entrar" =================
await tentar("cand1-duplo-submit-login", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", SENHA_TESTE);

  const captura = contadorRequests((req) => req.url().endsWith("/auth/login") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Entrar")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.waitForURL(/\/dashboard/, { timeout: 8000 }).catch(() => {});
  log(
    "cand1-duplo-submit-login",
    captura.chamadas.length === 1,
    `requestsPOST=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)} urlFinal=${page.url()}`,
  );
});

// ================= CANDIDATO 2: LOGOUT — duplo clique em "Sair" (baixo risco, verificado por completude) =================
await tentar("cand2-duplo-clique-logout", async () => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.click('[aria-label="Menu do usuário"]');
  await page.waitForSelector('div[role="menuitem"]:has-text("Sair")', { timeout: 5000 });

  const captura = contadorRequests((req) => req.url().endsWith("/auth/logout") && req.method() === "POST");
  const item = page.locator('div[role="menuitem"]:has-text("Sair")');
  const statusCliques = await cliqueDuploForcado(item);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.waitForURL(/\/login/, { timeout: 8000 }).catch(() => {});
  log(
    "cand2-duplo-clique-logout",
    captura.chamadas.length <= 1,
    `requestsPOST=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)} urlFinal=${page.url()} — baixo impacto mesmo se >1 (logout é idempotente: 2ª chamada apenas encontraria sessão já encerrada)`,
  );
});

// ================= REGRESSÃO: LOGIN LEGÍTIMO SEQUENCIAL APÓS O TESTE (login único, deve funcionar normalmente) =================
await tentar("regressao-login-unico-apos-teste", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", SENHA_TESTE);
  await page.click('button[type="submit"]:has-text("Entrar")');
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  log("regressao-login-unico-apos-teste", page.url().includes("/dashboard"), `url=${page.url()}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
console.log("--- erros de rede (>=500 ou requestfailed):", redeErros.length, JSON.stringify(redeErros));
console.log("--- respostas 4xx (diagnóstico):", respostas4xx.length, JSON.stringify(respostas4xx, null, 2));
fs.writeFileSync("e2e/.resultado-2021.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
