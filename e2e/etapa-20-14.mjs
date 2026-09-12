// Etapa 20.14 — auditoria e validação pós-20.13 (script ad-hoc, não é suíte
// permanente). Dirige o Chrome do sistema via Playwright contra o Backoffice
// real + backend real. Foco: regressão das Etapas 20.12/20.13 + cobertura
// ampla dos fluxos críticos (produto, variante, tamanho, estoque, caixa,
// navegação, logout).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const SHOT_DIR = "e2e/.evidencias-2014";
fs.mkdirSync(SHOT_DIR, { recursive: true });
const TAG = "E2E2014";

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
let shotN = 0;
async function shot(page, nome) {
  shotN += 1;
  await page.screenshot({ path: `${SHOT_DIR}/${String(shotN).padStart(2, "0")}-${nome}.png` }).catch(() => {});
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const respostas4xx = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErros.push(msg.text());
});
page.on("requestfailed", (req) => {
  redeErros.push(`REQFAIL ${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
});
page.on("response", (res) => {
  if (res.status() >= 500) redeErros.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  if (res.status() >= 400 && res.status() < 500) {
    respostas4xx.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  }
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

// ================= LOGIN =================
await tentar("login-invalido", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", "senha-propositalmente-errada");
  await page.click('button:has-text("Entrar")');
  await page.waitForTimeout(1500);
  const url = page.url();
  log("login-invalido", url.includes("/login"), `url=${url}`);
});

await tentar("login-valido", async () => {
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", SENHA_TESTE);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  log("login-valido", page.url().includes("/dashboard"), `url=${page.url()}`);
});

// ================= SEED CONFIGURAÇÕES =================
await tentar("configuracoes-seed", async () => {
  const c1 = await addItemLista("Categorias", "Categorias", `${TAG}-Categoria`);
  const c2 = await addItemLista("Cores", "Cores", `${TAG}-Cor`);
  const c3 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-M`);
  const c4 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-G`);
  log("configuracoes-seed", c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0, `categoria=${c1} cor=${c2} M=${c3} G=${c4}`);
});

// ================= PRODUTO: CREATE/READ/UPDATE =================
let produtoId = "";
let produtoNome = `${TAG} Produto`;
await tentar("produto-criar", async () => {
  await page.goto(`${BASE}/produtos/novo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", produtoNome);
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

await tentar("produto-ler", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  log("produto-ler", corpo?.includes(produtoNome) ?? false, "nome presente após reload");
});

await tentar("produto-editar", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}/editar`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  produtoNome = `${TAG} Produto Editado`;
  await page.fill("#nome", produtoNome);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/produtos/${produtoId}`) && r.request().method() === "PUT", { timeout: 8000 }).catch(() => null),
    page.click('button[type="submit"]:has-text("Salvar alterações")'),
  ]);
  await page.waitForURL(new RegExp(`/produtos/${produtoId}$`), { timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  log("produto-editar", corpo?.includes(produtoNome) ?? false, `httpStatus=${resp ? resp.status() : "n/d"} persistiu após reload`);
});

// ================= VARIANTE: CRIAR SEM FOTO/VÍDEO (regressão 20.12) =================
let codVarianteOriginal = "";
await tentar("variante-criar-sem-foto-video", async () => {
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  // Deliberadamente sem #foto/#video — regressão da correção `?? -> ||` da 20.12.
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  const dialogFechou = !(await page.locator("#cor").isVisible().catch(() => false));
  log("variante-criar-sem-foto-video", resp.ok() && dialogFechou, `httpStatus=${resp.status()} (esperado 201, sem regressão)`);
});

await tentar("variante-capturar-codigo", async () => {
  const corpo = await page.textContent("body");
  const m = corpo?.match(/PROD-\d+-[A-Z0-9]+/) ?? corpo?.match(/[A-Z]+-\d+-[A-Z0-9]+/);
  codVarianteOriginal = m ? m[0] : "";
  log("variante-capturar-codigo", codVarianteOriginal !== "", `codVariante=${codVarianteOriginal}`);
});

// ================= VARIANTE: EDITAR (preencher foto, manter cor) =================
await tentar("variante-editar", async () => {
  await page.locator('button:has-text("Editar variante")').first().click();
  await page.waitForSelector("#foto", { timeout: 5000 });
  await page.fill("#foto", "https://exemplo.com/foto-e2e-2014.jpg");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes/") && r.request().method() === "PUT", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Salvar")'),
  ]);
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const codigoEstavel = codVarianteOriginal !== "" && (corpo?.includes(codVarianteOriginal) ?? false);
  log("variante-editar", resp.ok() && codigoEstavel, `httpStatus=${resp.status()} codigoEstavelAposEdicao=${codigoEstavel}`);
});

// ================= TAMANHOS: ADICIONAR M e G =================
await tentar("tamanho-M-adicionar", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-M")`);
  await page.fill("#quantidade", "5");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  log("tamanho-M-adicionar", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("tamanho-G-adicionar", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-G")`);
  await page.fill("#quantidade", "3");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  log("tamanho-G-adicionar", resp.ok(), `httpStatus=${resp.status()}`);
  await shot(page, "ambos-tamanhos");
});

// ================= TAMANHO: CANCELAR EXCLUSÃO (negativo) =================
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

// ================= TAMANHO: CONFIRMAR EXCLUSÃO =================
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
});

await tentar("tamanho-reload-persistencia", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const mAusente = !(corpo?.includes(`${TAG}-M`) ?? true);
  const gPresente = corpo?.includes(`${TAG}-G`) ?? false;
  log("tamanho-reload-persistencia", mAusente && gPresente, `M-ausente=${mAusente} G-presente=${gPresente}`);
});

await tentar("tamanho-ground-truth-api", async () => {
  const resp = await fetch(`${API}/produtos/${produtoId}`, {
    headers: { Authorization: `Bearer ${await tokenAtual()}` },
  });
  const json = await resp.json();
  const variante = json.data.variantes[0];
  const tamanhos = variante ? variante.tamanhos.map((t) => t.tamanho) : [];
  const tamanhoGId = variante.tamanhos.find((t) => t.tamanho === `${TAG}-G`)?.id ?? "";
  const ok = !tamanhos.includes(`${TAG}-M`) && tamanhos.includes(`${TAG}-G`);
  log("tamanho-ground-truth-api", ok, `tamanhos reais=${JSON.stringify(tamanhos)}`);
  globalThis.__tamanhoGId = tamanhoGId;
});

fs.writeFileSync("e2e/.resultado-parcial-2014.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 1 salvo (produto/variante/tamanhos) ---");

// ================= ESTOQUE: ENTRADA / SAÍDA / SAÍDA INVÁLIDA =================
await tentar("estoque-entrada", async () => {
  await page.click('button:has-text("Entrada")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-G")`);
  await page.fill("#quantidade", "4");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/estoque/entrada"), { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Registrar entrada")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log("estoque-entrada", resp.ok() && Boolean(corpo?.includes("7")), `httpStatus=${resp.status()} 3+4=7 refletido`);
});

await tentar("estoque-saida", async () => {
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-G")`);
  await page.fill("#quantidade", "2");
  await page.fill("#motivo", "Teste E2E 20.14");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/estoque/saida"), { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Registrar saída")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log("estoque-saida", resp.ok() && Boolean(corpo?.includes("5")), `httpStatus=${resp.status()} 7-2=5 refletido`);
});

await tentar("estoque-saida-invalida", async () => {
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-G")`);
  await page.fill("#quantidade", "999");
  await page.fill("#motivo", "Teste estoque insuficiente 20.14");
  await page.click('button[type="submit"]:has-text("Registrar saída")');
  await page.waitForTimeout(1200);
  const corpo = await page.textContent("body");
  const mostrouErro = /indispon[íi]vel|insuficiente/i.test(corpo ?? "");
  const aindaTem5 = corpo?.includes("5");
  log("estoque-saida-invalida", mostrouErro && aindaTem5, `erro=${mostrouErro} estoqueInalterado=${aindaTem5}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
});

// ================= CAIXA: CICLO COMPLETO =================
await tentar("caixa-nenhum-aberto-antes", async () => {
  await page.goto(`${BASE}/caixa`, { waitUntil: "networkidle" });
  const temCaixaAberto = await page.locator('text="Caixa aberto"').count();
  log("caixa-nenhum-aberto-antes", temCaixaAberto === 0, `ausente=${temCaixaAberto === 0}`);
});

await tentar("caixa-abrir", async () => {
  await page.locator('button:has-text("Abrir caixa")').first().click();
  await page.waitForSelector("#abertura-valor", { timeout: 5000 });
  await page.fill("#abertura-valor", "100");
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/caixas") && r.request().method() === "POST", { timeout: 8000 }),
    page.locator('button:has-text("Abrir caixa")').last().click(),
  ]);
  await page.waitForTimeout(1000);
  await Promise.all([page.waitForURL(/\/caixa\/[a-f0-9]+/, { timeout: 8000 }), page.click('a:has-text("Ver caixa")')]);
  log("caixa-abrir", page.url().match(/\/caixa\/[a-f0-9]+/) !== null, `url=${page.url()}`);
});

await tentar("caixa-entrada-sem-motivo-no-payload", async () => {
  let bodyEnviado = null;
  const onReq = (req) => {
    if (req.url().includes("/entrada") && req.method() === "POST") {
      bodyEnviado = req.postData();
    }
  };
  page.on("request", onReq);
  await page.click('button:has-text("Entrada")');
  await page.waitForSelector("#mov-descricao", { timeout: 5000 });
  await page.fill("#mov-descricao", "Entrada teste E2E 20.14");
  await page.fill("#mov-valor", "40");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/entrada") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button:has-text("Confirmar")'),
  ]);
  await page.waitForTimeout(800);
  page.off("request", onReq);
  const semMotivoNoPayload = bodyEnviado !== null && !JSON.parse(bodyEnviado).hasOwnProperty("motivo");
  log("caixa-entrada-sem-motivo-no-payload", resp.ok() && semMotivoNoPayload, `httpStatus=${resp.status()} payloadSemMotivo=${semMotivoNoPayload}`);
});

await tentar("caixa-saida-com-motivo-no-payload", async () => {
  let bodyEnviado = null;
  const onReq = (req) => {
    if (req.url().includes("/saida") && req.method() === "POST") {
      bodyEnviado = req.postData();
    }
  };
  page.on("request", onReq);
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#mov-descricao", { timeout: 5000 });
  await page.fill("#mov-descricao", "Saida teste E2E 20.14");
  await page.fill("#mov-valor", "15");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/saida") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button:has-text("Confirmar")'),
  ]);
  await page.waitForTimeout(800);
  page.off("request", onReq);
  const comMotivoNoPayload = bodyEnviado !== null && JSON.parse(bodyEnviado).hasOwnProperty("motivo");
  log("caixa-saida-com-motivo-no-payload", resp.ok() && comMotivoNoPayload, `httpStatus=${resp.status()} payloadComMotivo=${comMotivoNoPayload}`);
});

await tentar("caixa-movimentacoes-sem-duplicacao", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const temEntrada = (corpo?.match(/Entrada teste E2E 20\.14/g) ?? []).length;
  const temSaida = (corpo?.match(/Saida teste E2E 20\.14/g) ?? []).length;
  log("caixa-movimentacoes-sem-duplicacao", temEntrada === 1 && temSaida === 1, `entrada=${temEntrada} saida=${temSaida}`);
});

await tentar("caixa-fechar", async () => {
  // Saldo esperado: 100 (abertura) + 40 (entrada) - 15 (saída) = 125
  await page.click('button:has-text("Fechar caixa")');
  await page.waitForSelector("#fechamento-valor", { timeout: 5000 });
  await page.fill("#fechamento-valor", "125");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/fechamento") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button:has-text("Confirmar fechamento")'),
  ]);
  await page.waitForTimeout(800);
  log("caixa-fechar", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("caixa-nenhum-aberto-depois", async () => {
  const resp = await fetch(`${API}/caixas/atual`, { headers: { Authorization: `Bearer ${await tokenAtual()}` } });
  const json = await resp.json();
  log("caixa-nenhum-aberto-depois", json.data === null, `caixas/atual=${JSON.stringify(json.data)}`);
});

fs.writeFileSync("e2e/.resultado-parcial-2014.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 2 salvo (estoque/caixa) ---");

// ================= NAVEGAÇÃO COMPLETA =================
await tentar("navegacao-completa", async () => {
  const rotas = [
    "/dashboard",
    "/produtos",
    "/estoque",
    "/clientes",
    "/fornecedores",
    "/colecoes",
    "/campanhas",
    "/vendedores",
    "/adquirentes",
    "/caixa",
    "/vendas",
    "/configuracoes",
  ];
  const falhas = [];
  for (const rota of rotas) {
    await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const corpo = await page.textContent("body");
    const quebrou = !corpo || corpo.trim().length < 50 || /erro 500|internal server error/i.test(corpo);
    const foiParaLogin = page.url().includes("/login");
    if (quebrou || foiParaLogin) falhas.push(`${rota} (quebrou=${quebrou} foiParaLogin=${foiParaLogin})`);
  }
  log("navegacao-completa", falhas.length === 0, falhas.length ? `falhas: ${falhas.join(", ")}` : "todas as 12 rotas carregaram");
});

// ================= LOGOUT E PROTEÇÃO DE ROTA =================
await tentar("logout", async () => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.click('[aria-label="Menu do usuário"]');
  await page.click('div[role="menuitem"]:has-text("Sair")');
  await page.waitForURL(/\/login/, { timeout: 8000 });
  log("logout", page.url().includes("/login"), `url=${page.url()}`);
});

await tentar("protecao-rota-apos-logout", async () => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  log("protecao-rota-apos-logout", page.url().includes("/login"), `url=${page.url()}`);
});

// ================= LIMPEZA =================
await tentar("limpeza-produto", async () => {
  const token = await tokenAtual();
  const resp = await fetch(`${API}/produtos/${produtoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  log("limpeza-produto", resp.ok, `httpStatus=${resp.status}`);
});

await tentar("limpeza-configuracoes", async () => {
  // relogar via UI pois a limpeza usa cliques, não fetch
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    await page.fill("#usuario", USUARIO_TESTE);
    await page.fill("#senha", SENHA_TESTE);
    await page.click('button:has-text("Entrar")');
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  }
  const r1 = await removeItemLista("Categorias", `${TAG}-Categoria`);
  const r2 = await removeItemLista("Cores", `${TAG}-Cor`);
  const r3 = await removeItemLista("Tamanhos", `${TAG}-G`);
  const r4 = await removeItemLista("Tamanhos", `${TAG}-M`);
  log("limpeza-configuracoes", r1 && r2 && r3 && r4, `categoria=${r1} cor=${r2} G=${r3} M=${r4}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
console.log("--- erros de rede (>=500 ou requestfailed):", redeErros.length, JSON.stringify(redeErros));
console.log("--- respostas 4xx (diagnóstico, esperado incluir negativos deliberados):", respostas4xx.length, JSON.stringify(respostas4xx, null, 2));
fs.writeFileSync("e2e/.resultado-2014.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
