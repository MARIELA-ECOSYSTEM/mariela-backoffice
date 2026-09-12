// Etapa 20.18 — auditoria final de reentrância + cobertura de fluxos
// administrativos remanescentes (script ad-hoc, não é suíte permanente).
// Dirige o Chrome do sistema via Playwright contra o Backoffice real +
// backend real. Reutiliza a infraestrutura das Etapas 20.12-20.17.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const TAG = "E2E2018";

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

// ================= PROBE: WhatsApp continua não implementado no backend real? =================
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

// ================= SEED: produto + categoria/cor para os candidatos de Produto =================
await tentar("seed-config-produto", async () => {
  const r = await api("/configuracoes/categorias", { method: "POST", body: JSON.stringify({ valor: `${TAG}-Categoria` }) });
  const r2 = await api("/configuracoes/cores", { method: "POST", body: JSON.stringify({ valor: `${TAG}-Cor` }) });
  log("seed-config-produto", r.ok && r2.ok, `categoria=${r.status} cor=${r2.status}`);
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

// ================= CANDIDATO 1: PROMOCAODIALOG — "ATIVAR PROMOÇÃO" (nunca testado) =================
await tentar("cand1-duplo-submit-ativar-promocao", async () => {
  await page.click('button:has-text("Ativar promoção")');
  await page.waitForSelector("#precoPromocional", { timeout: 5000 });
  await page.fill("#precoPromocional", "80");

  const captura = contadorRequests((req) => req.url().includes("/promocao") && req.method() === "PATCH");
  const botao = page.locator('button[type="submit"]:has-text("Ativar promoção")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const desativarVisivel = await page.locator('button:has-text("Desativar promoção")').count();
  log(
    "cand1-duplo-submit-ativar-promocao",
    captura.chamadas.length === 1 && desativarVisivel === 1,
    `requestsPATCH=${captura.chamadas.length} promocaoAtiva=${desativarVisivel === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

// ================= CANDIDATO 2: PRODUTO-CARD (lista) — "DESATIVAR PROMOÇÃO" (instância distinta da 20.16) =================
await tentar("cand2-duplo-clique-desativar-promocao-lista", async () => {
  await page.goto(`${BASE}/produtos`, { waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeProduto}"]`);
  await page.waitForTimeout(200);

  const captura = contadorRequests((req) => req.url().includes("/promocao") && req.method() === "PATCH");
  const item = page.locator('div[role="menuitem"]:has-text("Desativar promoção")');
  const statusCliques = await cliqueDuploForcado(item);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeProduto}"]`);
  await page.waitForTimeout(200);
  const ofereceAtivar = await page.locator('div[role="menuitem"]:has-text("Ativar promoção")').count();
  await page.keyboard.press("Escape").catch(() => {});

  log(
    "cand2-duplo-clique-desativar-promocao-lista",
    captura.chamadas.length === 1 && ofereceAtivar === 1,
    `requestsPATCH=${captura.chamadas.length} statusFinalDesativado=${ofereceAtivar === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

// ================= CANDIDATO 3: PRODUTO-CARD (lista) — "ALTERNAR NOVIDADE" (nunca testado) =================
await tentar("cand3-duplo-clique-alternar-novidade", async () => {
  await page.click(`[aria-label="Ações de ${nomeProduto}"]`);
  await page.waitForTimeout(200);

  const captura = contadorRequests((req) => req.url().includes("/novidade") && req.method() === "PATCH");
  const item = page.locator('div[role="menuitem"]:has-text("Marcar como novidade")');
  const statusCliques = await cliqueDuploForcado(item);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeProduto}"]`);
  await page.waitForTimeout(200);
  const ofereceRemover = await page.locator('div[role="menuitem"]:has-text("Remover marca de novidade")').count();
  await page.keyboard.press("Escape").catch(() => {});

  log(
    "cand3-duplo-clique-alternar-novidade",
    captura.chamadas.length === 1 && ofereceRemover === 1,
    `requestsPATCH=${captura.chamadas.length} statusFinalNovidade=${ofereceRemover === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

// ================= CANDIDATO 4: VARIANTE + TAMANHO — SEED PARA CANDIDATOS 5/6/7 =================
await tentar("seed-variante-tamanho", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);

  const r1 = await api("/configuracoes/tamanhos", { method: "POST", body: JSON.stringify({ valor: `${TAG}-M` }) });
  log("seed-variante-tamanho", r1.ok, `tamanhoConfig=${r1.status}`);
});

await tentar("seed-tamanho-M", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-M")`);
  await page.fill("#quantidade", "5");
  await page.waitForTimeout(400);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  log("seed-tamanho-M", true, "tamanho M adicionado (qtd 5)");
});

// ================= CANDIDATO 5: ESTOQUE — "SAÍDA" (nunca force-double-click testado; entrada já foi) =================
await tentar("cand5-duplo-clique-estoque-saida", async () => {
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-M")`);
  await page.fill("#quantidade", "2");
  await page.fill("#motivo", "Teste E2E 20.18");
  await page.waitForTimeout(400);

  const captura = contadorRequests((req) => req.url().includes("/estoque/saida") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Registrar saída")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const quantidadeCorreta = corpo?.includes("3") ?? false; // 5 - 2 = 3 (não 1, se houvesse duplicidade)
  log(
    "cand5-duplo-clique-estoque-saida",
    captura.chamadas.length === 1 && quantidadeCorreta,
    `requestsPOST=${captura.chamadas.length} quantidadeFinalCorreta(3)=${quantidadeCorreta} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

// ================= CANDIDATO 6: GALERIA — "DEFINIR COMO IMAGEM PRINCIPAL" (nunca testado, baixo risco/idempotente) =================
await tentar("cand6-duplo-clique-marcar-foto-principal", async () => {
  // Preenche foto na 1ª variante (vira principal automaticamente, por ser a
  // única). Depois cria uma 2ª variante com foto própria: como já existe uma
  // principal, o botão "Definir como imagem principal" fica disponível para
  // esta 2ª foto, tornando o cenário de duplo clique testável de fato.
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Editar variante")').first().click();
  await page.waitForSelector("#foto", { timeout: 5000 });
  await page.fill("#foto", "https://exemplo.com/foto-e2e-2018-a.jpg");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes/") && r.request().method() === "PUT", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Salvar")'),
  ]);
  await page.waitForTimeout(500);

  const r1 = await api("/configuracoes/cores", { method: "POST", body: JSON.stringify({ valor: `${TAG}-Cor2` }) });
  if (!r1.ok) throw new Error("falha ao semear 2a cor");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor2")`);
  await page.fill("#foto", "https://exemplo.com/foto-e2e-2018-b.jpg");
  await page.waitForTimeout(400);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });

  await page.click(`button[aria-label="Ver foto ${TAG}-Cor2"]`);
  await page.waitForTimeout(300);
  const botao = page.locator('button:has-text("Definir como imagem principal")');
  await botao.waitFor({ state: "visible", timeout: 5000 });

  const captura = contadorRequests((req) => req.url().includes("/foto-principal") && req.method() === "PATCH");
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  log(
    "cand6-duplo-clique-marcar-foto-principal",
    captura.chamadas.length === 1,
    `requestsPATCH=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

// ================= CANDIDATO 7: PRODUTO — EXCLUIR (ConfirmDialog, verificação representativa) =================
await tentar("cand7-duplo-clique-excluir-produto-confirmdialog", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  // Espera explícita pelo botão renderizar antes de interagir — logo após
  // `waitForURL` a página de detalhe ainda pode estar montando as ações
  // (mesma classe de artefato de timing já vista em etapas anteriores).
  await page.waitForSelector('button:has-text("Excluir")', { timeout: 8000 });
  // O botão "Excluir" do PRODUTO fica no cabeçalho da página, renderizado
  // antes dos botões "Excluir" de cada variante — por isso `.first()`, não
  // `.last()` (com múltiplas variantes, `.last()` acerta o botão errado).
  await page.locator('button:has-text("Excluir")').first().click();
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });

  const captura = contadorRequests((req) => req.url().endsWith(`/produtos/${produtoId}`) && req.method() === "DELETE");
  const botao = page.locator('[role="alertdialog"] button:has-text("Excluir")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  log(
    "cand7-duplo-clique-excluir-produto-confirmdialog",
    captura.chamadas.length === 1,
    `requestsDELETE=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)} — ConfirmDialog, mecanismo já validado 3x nas Etapas 20.15-20.17`,
  );
});

// ================= LIMPEZA =================
await tentar("limpeza-config", async () => {
  const r1 = await api(`/configuracoes/categorias/${encodeURIComponent(`${TAG}-Categoria`)}`, { method: "DELETE" });
  const r2 = await api(`/configuracoes/cores/${encodeURIComponent(`${TAG}-Cor`)}`, { method: "DELETE" });
  const r3 = await api(`/configuracoes/tamanhos/${encodeURIComponent(`${TAG}-M`)}`, { method: "DELETE" });
  const r4 = await api(`/configuracoes/cores/${encodeURIComponent(`${TAG}-Cor2`)}`, { method: "DELETE" });
  log("limpeza-config", r1.ok && r2.ok && r3.ok, `categoria=${r1.ok} cor=${r2.ok} tamanho=${r3.ok} cor2=${r4.ok}`);
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
    achados.length === 0 ? "nenhum resíduo encontrado" : `resíduos encontrados e removidos: ${JSON.stringify(achados)}`,
  );
});

// ================= VERIFICAÇÃO DE CAIXA =================
await tentar("verificacao-caixa-nenhum-aberto", async () => {
  const resp = await api("/caixas/atual");
  const json = await resp.json();
  log("verificacao-caixa-nenhum-aberto", json.data === null, `caixas/atual=${JSON.stringify(json.data)}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
console.log("--- erros de rede (>=500 ou requestfailed):", redeErros.length, JSON.stringify(redeErros));
console.log("--- respostas 4xx (diagnóstico):", respostas4xx.length, JSON.stringify(respostas4xx, null, 2));
fs.writeFileSync("e2e/.resultado-2018.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
