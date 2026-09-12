// Etapa 20.13 — validação E2E real da ação "excluir tamanho" (script ad-hoc,
// adaptado do driver da Etapa 20.12). Dirige o Chrome do sistema via
// Playwright contra o Backoffice real + backend real.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const TAG = "E2E2013";

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

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

const consoleErros = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErros.push(msg.text());
});

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

// ---------- LOGIN ----------
await tentar("login", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", SENHA_TESTE);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  log("login", page.url().includes("/dashboard"), `url=${page.url()}`);
});

// ---------- SEED: categoria/cor/2 tamanhos ----------
await tentar("configuracoes-seed", async () => {
  const c1 = await addItemLista("Categorias", "Categorias", `${TAG}-Categoria`);
  const c2 = await addItemLista("Cores", "Cores", `${TAG}-Cor`);
  const c3 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-M`);
  const c4 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-G`);
  log("configuracoes-seed", c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0, `categoria=${c1} cor=${c2} M=${c3} G=${c4}`);
});

// ---------- CRIAR PRODUTO ----------
let produtoId = "";
await tentar("produto-criar", async () => {
  await page.goto(`${BASE}/produtos/novo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", `${TAG} Produto`);
  await page.click("#categoria");
  await page.click(`[role="option"]:has-text("${TAG}-Categoria")`);
  await page.fill("#precoCusto", "50");
  await page.fill("#precoVenda", "100");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/produtos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Criar produto")'),
  ]);
  await page.waitForURL(/\/produtos\/[a-f0-9]+$/, { timeout: 10000 });
  produtoId = page.url().split("/").pop();
  log("produto-criar", resp.ok(), `httpStatus=${resp.status()} id=${produtoId}`);
});

// ---------- REGRESSÃO: ADICIONAR VARIANTE SEM FOTO/VÍDEO ----------
await tentar("variante-criar-sem-foto-video", async () => {
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  // Deliberadamente NÃO preenche #foto nem #video — é exatamente a regressão da 20.12.
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  const dialogFechou = !(await page.locator("#cor").isVisible().catch(() => false));
  log("variante-criar-sem-foto-video", resp.ok() && dialogFechou, `httpStatus=${resp.status()} (esperado 201, confirma sem regressão da 20.12)`);
});

// ---------- ADICIONAR TAMANHO M ----------
await tentar("tamanho-M-adicionar", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-M")`);
  await page.fill('#quantidade', "5");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  log("tamanho-M-adicionar", resp.ok(), `httpStatus=${resp.status()}`);
});

// ---------- ADICIONAR TAMANHO G ----------
await tentar("tamanho-G-adicionar", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-G")`);
  await page.fill('#quantidade', "3");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  log("tamanho-G-adicionar", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("confirmar-ambos-tamanhos-visiveis", async () => {
  const corpo = await page.textContent("body");
  const temM = corpo?.includes(`${TAG}-M`) ?? false;
  const temG = corpo?.includes(`${TAG}-G`) ?? false;
  log("confirmar-ambos-tamanhos-visiveis", temM && temG, `M presente=${temM} G presente=${temG}`);
  await page.screenshot({ path: "e2e/.evidencias-2013-01-ambos-tamanhos.png" });
});

// ---------- TESTE NEGATIVO: cancelar exclusão do tamanho M ----------
await tentar("excluir-M-cancelar", async () => {
  let chamouDelete = false;
  const onReq = (req) => {
    if (req.url().includes("/tamanhos/") && req.method() === "DELETE") chamouDelete = true;
  };
  page.on("request", onReq);

  await page.click(`button[aria-label="Excluir tamanho ${TAG}-M"]`);
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  const textoDialogo = await page.locator('[role="alertdialog"]').textContent();
  const identificaTamanhoCorreto = textoDialogo?.includes(`${TAG}-M`) ?? false;

  // Cancelar (fechar sem confirmar)
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  page.off("request", onReq);
  const corpo = await page.textContent("body");
  const aindaPresente = corpo?.includes(`${TAG}-M`) ?? false;
  log(
    "excluir-M-cancelar",
    identificaTamanhoCorreto && !chamouDelete && aindaPresente,
    `dialogIdentificaTamanho=${identificaTamanhoCorreto} mutationDisparada=${chamouDelete} tamanhoAindaPresente=${aindaPresente}`,
  );
});

// ---------- EXCLUIR TAMANHO M (confirmando de verdade) ----------
await tentar("excluir-M-confirmar", async () => {
  await page.click(`button[aria-label="Excluir tamanho ${TAG}-M"]`);
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos/") && r.request().method() === "DELETE", { timeout: 8000 }),
    page.click('[role="alertdialog"] button:has-text("Excluir")'),
  ]);
  await page.waitForTimeout(700);
  const corpo = await page.textContent("body");
  const mSumiu = !(corpo?.includes(`${TAG}-M`) ?? true);
  const gPermanece = corpo?.includes(`${TAG}-G`) ?? false;
  log("excluir-M-confirmar", resp.ok() && mSumiu && gPermanece, `httpStatus=${resp.status()} M-sumiu=${mSumiu} G-permanece=${gPermanece}`);
  await page.screenshot({ path: "e2e/.evidencias-2013-02-apos-exclusao.png" });
});

// ---------- RELOAD: confirmar persistência ----------
await tentar("reload-confirma-persistencia", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  const mAindaAusente = !(corpo?.includes(`${TAG}-M`) ?? true);
  const gAindaPresente = corpo?.includes(`${TAG}-G`) ?? false;
  log("reload-confirma-persistencia", mAindaAusente && gAindaPresente, `M-ausente=${mAindaAusente} G-presente=${gAindaPresente}`);
});

// ---------- GROUND TRUTH VIA API REAL ----------
await tentar("ground-truth-api", async () => {
  const resp = await fetch(`${API}/produtos/${produtoId}`, {
    headers: { Authorization: `Bearer ${await tokenAtual()}` },
  });
  const json = await resp.json();
  const variante = json.data.variantes[0];
  const tamanhos = variante ? variante.tamanhos.map((t) => t.tamanho) : [];
  const mAusente = !tamanhos.includes(`${TAG}-M`);
  const gPresente = tamanhos.includes(`${TAG}-G`);
  log("ground-truth-api", mAusente && gPresente, `tamanhos reais=${JSON.stringify(tamanhos)}`);
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

// ---------- LIMPEZA ----------
await tentar("limpeza-produto", async () => {
  const token = await tokenAtual();
  const resp = await fetch(`${API}/produtos/${produtoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  log("limpeza-produto", resp.ok, `httpStatus=${resp.status}`);
});

await tentar("limpeza-configuracoes", async () => {
  const r1 = await removeItemLista("Categorias", `${TAG}-Categoria`);
  const r2 = await removeItemLista("Cores", `${TAG}-Cor`);
  const r3 = await removeItemLista("Tamanhos", `${TAG}-G`);
  // ${TAG}-M já não existe mais na lista de configurações? Não — a exclusão de
  // tamanho da VARIANTE não remove o item da lista de configurações (são
  // entidades diferentes: "tamanhos disponíveis" vs. "tamanho cadastrado numa
  // variante específica"). Por isso ainda precisa ser removido aqui também.
  const r4 = await removeItemLista("Tamanhos", `${TAG}-M`);
  log("limpeza-configuracoes", r1 && r2 && r3 && r4, `categoria=${r1} cor=${r2} G=${r3} M=${r4}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
fs.writeFileSync("e2e/.resultado-2013.json", JSON.stringify({ resultados, consoleErros }, null, 2));
await browser.close();
