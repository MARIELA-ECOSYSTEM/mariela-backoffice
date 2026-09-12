// Etapa 20.16 — auditoria de reentrância/idempotência da UI (script ad-hoc,
// não é suíte permanente). Dirige o Chrome do sistema via Playwright contra
// o Backoffice real + backend real. Reutiliza a infraestrutura das Etapas
// 20.12-20.15 (login, seed/remoção de configurações, tokenAtual, contador de
// requests, clique duplo forçado).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const TAG = "E2E2016";

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
  const json = await resp.json();
  return json.data.accessToken;
}

async function addItemLista(aba, tituloAria, valor) {
  await page.goto(`${BASE}/configuracoes`, { waitUntil: "networkidle" });
  await page.click(`button[role="tab"]:has-text("${aba}")`);
  await page.waitForTimeout(300);
  const input = page.locator(`[aria-label="Adicionar em ${tituloAria}"]`);
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill(valor);
  await input.press("Enter");
  await page.waitForTimeout(800);
  return page.locator(`text="${valor}"`).count();
}
async function removeItemLista(aba, valor) {
  await page.goto(`${BASE}/configuracoes`, { waitUntil: "networkidle" });
  await page.click(`button[role="tab"]:has-text("${aba}")`);
  await page.waitForTimeout(300);
  const removerBtn = page.locator(`button[aria-label="Remover ${valor}"]`);
  if ((await removerBtn.count()) === 0) return false;
  await removerBtn.click();
  await page.waitForTimeout(300);
  await page.click('[role="alertdialog"] button:has-text("Remover")');
  await page.waitForTimeout(800);
  return true;
}

/** Clique duplo "forçado": ignora a espera de actionability do Playwright,
 * simulando o pior caso real de um duplo clique humano rápido. A prova
 * aceita é a contagem de requisições de rede reais, nunca o atributo
 * `disabled` isoladamente. */
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
    if (matcher(req)) chamadas.push({ url: req.url(), method: req.method(), body: req.postData() });
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

// ================= PROBE: endpoint de WhatsApp existe no backend real? =================
await tentar("probe-whatsapp-endpoint", async () => {
  const token = await tokenAtual();
  const resp = await fetch(`${API}/integracoes/whatsapp/mensagens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clienteId: "000000000000000000000000", telefone: "83999999999", mensagem: "probe" }),
  });
  log(
    "probe-whatsapp-endpoint",
    true,
    `httpStatus=${resp.status} — ${resp.status === 404 ? "endpoint não implementado no backend real; candidatos de envio WhatsApp classificados D (não testável)" : "endpoint existe; reavaliar classificação"}`,
  );
});

// ================= CANDIDATO 1: CLIENTES — CRIAR (react-hook-form + CorpoFormulario/AcoesFormulario) =================
await tentar("candidato1-duplo-submit-cliente-criar", async () => {
  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Nova cliente")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", `${TAG} Cliente`);
  await page.fill("#telefone", "83999990001");

  const captura = contadorRequests((req) => req.url().endsWith("/clientes") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Salvar")');
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  const corpo = await page.textContent("body");
  const ocorrencias = (corpo?.match(new RegExp(`${TAG} Cliente`, "g")) ?? []).length;

  log(
    "candidato1-duplo-submit-cliente-criar",
    captura.chamadas.length === 1 && ocorrencias === 1,
    `requestsPOST=${captura.chamadas.length} ocorrenciasNaLista=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

await tentar("candidato1-limpeza", async () => {
  const token = await tokenAtual();
  const resp = await fetch(`${API}/clientes?busca=${encodeURIComponent(TAG)}&limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await resp.json();
  const itens = json.data ?? json;
  let removidos = 0;
  for (const item of itens) {
    if (item.nome?.includes(TAG)) {
      const del = await fetch(`${API}/clientes/${item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (del.ok) removidos += 1;
    }
  }
  log("candidato1-limpeza", removidos >= 1, `removidos=${removidos}`);
});

// ================= CANDIDATO 2: COLEÇÕES — ALTERNAR STATUS (DropdownMenuItem onSelect) =================
let nomeColecao = `${TAG} Coleção`;
await tentar("candidato2-seed-colecao", async () => {
  await page.goto(`${BASE}/colecoes`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Nova coleção")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", nomeColecao);
  await page.fill("#descricao", "Descrição de teste E2E 20.16");
  await page.fill("#inicio", "2026-01-01");
  await page.fill("#fim", "2026-02-01");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/colecoes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Salvar")'),
  ]);
  await page.waitForTimeout(500);
  log("candidato2-seed-colecao", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("candidato2-duplo-clique-alternar-status", async () => {
  await page.click(`[aria-label="Ações de ${nomeColecao}"]`);
  await page.waitForTimeout(200);
  const captura = contadorRequests((req) => req.url().includes("/colecoes/") && ["PATCH", "PUT"].includes(req.method()));
  const item = page.locator('div[role="menuitem"]:has-text("Inativar")');
  const statusCliques = await cliqueDuploForcado(item);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  // Se a reentrância alternasse o status duas vezes, o item voltaria a "ativo"
  // (Ativar apareceria de novo); esperado: exatamente 1 chamada e status
  // final = inativo (botão do menu agora oferece "Ativar").
  await page.click(`[aria-label="Ações de ${nomeColecao}"]`);
  await page.waitForTimeout(200);
  const ofereceAtivar = await page.locator('div[role="menuitem"]:has-text("Ativar")').count();
  await page.keyboard.press("Escape").catch(() => {});

  log(
    "candidato2-duplo-clique-alternar-status",
    captura.chamadas.length === 1 && ofereceAtivar === 1,
    `requestsPATCH/PUT=${captura.chamadas.length} statusFinalInativo(ofereceAtivar)=${ofereceAtivar === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("candidato2-limpeza", async () => {
  await page.goto(`${BASE}/colecoes`, { waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeColecao}"]`);
  await page.waitForTimeout(200);
  await page.click('div[role="menuitem"]:has-text("Excluir")');
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await page.click('[role="alertdialog"] button:has-text("Excluir")');
  await page.waitForTimeout(1000);
  const corpo = await page.textContent("body");
  log("candidato2-limpeza", !corpo?.includes(nomeColecao), "coleção removida");
});

fs.writeFileSync("e2e/.resultado-parcial-2016.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
console.log("--- checkpoint 1 salvo (candidatos 1 e 2) ---");

// ================= CANDIDATO 3: PRODUTO — "DESATIVAR PROMOÇÃO" (onClick sem nenhum disabled) =================
await tentar("candidato3-seed-configuracoes", async () => {
  const c1 = await addItemLista("Categorias", "Categorias", `${TAG}-Categoria`);
  log("candidato3-seed-configuracoes", c1 > 0, `categoria=${c1}`);
});

let produtoId = "";
await tentar("candidato3-seed-produto-promocao", async () => {
  await page.goto(`${BASE}/produtos/novo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", `${TAG} Produto`);
  await page.click("#categoria");
  await page.click(`[role="option"]:has-text("${TAG}-Categoria")`);
  await page.fill("#precoCusto", "50");
  await page.fill("#precoVenda", "100");
  await Promise.all([
    page.waitForURL(/\/produtos\/[a-f0-9]+$/, { timeout: 10000 }),
    page.click('button[type="submit"]:has-text("Criar produto")'),
  ]);
  produtoId = page.url().split("/").pop();

  await page.click('button:has-text("Ativar promoção")');
  await page.waitForSelector("#precoPromocional", { timeout: 5000 });
  await page.fill("#precoPromocional", "80");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/promocao") && r.request().method() === "PATCH", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Ativar promoção")'),
  ]);
  await page.waitForTimeout(500);
  log("candidato3-seed-produto-promocao", produtoId !== "", `produtoId=${produtoId}`);
});

await tentar("candidato3-duplo-clique-desativar-promocao", async () => {
  const captura = contadorRequests((req) => req.url().includes("/promocao") && req.method() === "PATCH");
  const botao = page.locator('button:has-text("Desativar promoção")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const aindaEmPromocao = await page.locator('button:has-text("Desativar promoção")').count();

  log(
    "candidato3-duplo-clique-desativar-promocao",
    captura.chamadas.length === 1 && aindaEmPromocao === 0,
    `requestsPATCH=${captura.chamadas.length} promocaoDesativada=${aindaEmPromocao === 0} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("candidato3-limpeza", async () => {
  const token = await tokenAtual();
  const resp = await fetch(`${API}/produtos/${produtoId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const r2 = await removeItemLista("Categorias", `${TAG}-Categoria`);
  log("candidato3-limpeza", resp.ok && r2, `httpStatusProduto=${resp.status} categoriaRemovida=${r2}`);
});

// ================= VERIFICAÇÃO DE CAIXA (nenhum teste desta etapa abriu caixa) =================
await tentar("verificacao-caixa-nenhum-aberto", async () => {
  const resp = await fetch(`${API}/caixas/atual`, { headers: { Authorization: `Bearer ${await tokenAtual()}` } });
  const json = await resp.json();
  log("verificacao-caixa-nenhum-aberto", json.data === null, `caixas/atual=${JSON.stringify(json.data)}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
console.log("--- erros de rede (>=500 ou requestfailed):", redeErros.length, JSON.stringify(redeErros));
console.log("--- respostas 4xx (diagnóstico):", respostas4xx.length, JSON.stringify(respostas4xx, null, 2));
fs.writeFileSync("e2e/.resultado-2016.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
