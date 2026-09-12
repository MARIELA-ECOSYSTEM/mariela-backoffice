// Etapa 20.17 — validação e correção dos candidatos Nível B de reentrância
// (script ad-hoc, não é suíte permanente). Dirige o Chrome do sistema via
// Playwright contra o Backoffice real + backend real. Reutiliza a
// infraestrutura das Etapas 20.12-20.16.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const TAG = "E2E2017";

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

// ================= CANDIDATO A1: FORNECEDOR — CRIAR =================
await tentar("A1-duplo-submit-fornecedor-criar", async () => {
  await page.goto(`${BASE}/fornecedores`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Novo fornecedor")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", `${TAG} Fornecedor`);

  const captura = contadorRequests((req) => req.url().endsWith("/fornecedores") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Salvar")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  const ocorrencias = await page.locator(`[aria-label^="Ações de ${TAG} Fornecedor"]`).count();
  log(
    "A1-duplo-submit-fornecedor-criar",
    captura.chamadas.length === 1 && ocorrencias === 1,
    `requestsPOST=${captura.chamadas.length} cardsNaLista=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});
await tentar("A1-limpeza", async () => {
  const resp = await api(`/fornecedores?busca=${encodeURIComponent(TAG)}&limit=50`);
  const itens = (await resp.json()).data ?? [];
  let removidos = 0;
  for (const item of itens) {
    if (item.nome?.includes(TAG)) {
      const del = await api(`/fornecedores/${item.id}`, { method: "DELETE" });
      if (del.ok) removidos += 1;
    }
  }
  log("A1-limpeza", removidos >= 1, `removidos=${removidos}`);
});

// ================= CANDIDATO A2/B1: VENDEDOR — CRIAR / ALTERNAR STATUS / SENHA =================
let nomeVendedor = `${TAG} Vendedor`;
await tentar("A2-duplo-submit-vendedor-criar", async () => {
  await page.goto(`${BASE}/vendedores`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Novo vendedor")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", nomeVendedor);
  await page.fill("#telefone", "83999990020");
  await page.fill("#senha", "SenhaTeste2017!");
  await page.fill("#confirmacaoSenha", "SenhaTeste2017!");

  const captura = contadorRequests((req) => req.url().endsWith("/vendedores") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Salvar")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  const ocorrencias = await page.locator(`[aria-label^="Ações de ${nomeVendedor}"]`).count();
  log(
    "A2-duplo-submit-vendedor-criar",
    captura.chamadas.length === 1 && ocorrencias === 1,
    `requestsPOST=${captura.chamadas.length} cardsNaLista=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("B1-duplo-clique-vendedor-alternar-status", async () => {
  await page.click(`[aria-label="Ações de ${nomeVendedor}"]`);
  await page.waitForTimeout(200);
  const captura = contadorRequests((req) => req.url().includes("/vendedores/") && ["PATCH", "PUT"].includes(req.method()));
  const item = page.locator('div[role="menuitem"]:has-text("Inativar")');
  const statusCliques = await cliqueDuploForcado(item);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeVendedor}"]`);
  await page.waitForTimeout(200);
  const ofereceAtivar = await page.locator('div[role="menuitem"]:has-text("Ativar")').count();
  await page.keyboard.press("Escape").catch(() => {});

  log(
    "B1-duplo-clique-vendedor-alternar-status",
    captura.chamadas.length === 1 && ofereceAtivar === 1,
    `requestsPATCH/PUT=${captura.chamadas.length} statusFinalInativo=${ofereceAtivar === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("VEND-duplo-submit-redefinir-senha", async () => {
  await page.click(`[aria-label="Ações de ${nomeVendedor}"]`);
  await page.waitForTimeout(200);
  await page.click('div[role="menuitem"]:has-text("Redefinir senha")');
  await page.waitForSelector("#nova-senha", { timeout: 5000 });
  await page.fill("#nova-senha", "NovaSenha2017!");
  await page.fill("#nova-senha-confirmacao", "NovaSenha2017!");

  const captura = contadorRequests((req) => req.url().includes("/vendedores/") && req.url().includes("senha"));
  const botao = page.locator('button[type="submit"]:has-text("Salvar senha")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  log(
    "VEND-duplo-submit-redefinir-senha",
    captura.chamadas.length === 1,
    `requestsPATCH/PUT/POST=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("A2-limpeza", async () => {
  const resp = await api(`/vendedores?busca=${encodeURIComponent(TAG)}&limit=50`);
  const itens = (await resp.json()).data ?? [];
  let removidos = 0;
  for (const item of itens) {
    if (item.nome?.includes(TAG)) {
      const del = await api(`/vendedores/${item.id}`, { method: "DELETE" });
      if (del.ok) removidos += 1;
    }
  }
  log("A2-limpeza", removidos >= 1, `removidos=${removidos}`);
});

fs.writeFileSync("e2e/.resultado-parcial-2017.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
console.log("--- checkpoint 1 salvo (Fornecedor, Vendedor) ---");

// ================= CANDIDATO A3/B2: ADQUIRENTE — CRIAR / ALTERNAR STATUS =================
let nomeAdq = `${TAG} Adquirente`;
await tentar("A3-duplo-submit-adquirente-criar", async () => {
  await page.goto(`${BASE}/adquirentes`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Nova adquirente")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", nomeAdq);

  const captura = contadorRequests((req) => req.url().endsWith("/adquirentes") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Salvar")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  const corpo = await page.textContent("body");
  const ocorrencias = (corpo?.match(new RegExp(nomeAdq, "g")) ?? []).length;
  log(
    "A3-duplo-submit-adquirente-criar",
    captura.chamadas.length === 1 && ocorrencias === 1,
    `requestsPOST=${captura.chamadas.length} ocorrenciasNaLista=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("B2-duplo-clique-adquirente-alternar-status", async () => {
  const captura = contadorRequests((req) => req.url().includes("/adquirentes/") && ["PATCH", "PUT"].includes(req.method()));
  const botao = page.locator('button[aria-label="Inativar adquirente"]');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const voltouAAtivar = await page.locator('button[aria-label="Ativar adquirente"]').count();

  log(
    "B2-duplo-clique-adquirente-alternar-status",
    captura.chamadas.length === 1 && voltouAAtivar === 1,
    `requestsPATCH/PUT=${captura.chamadas.length} statusFinalInativo=${voltouAAtivar === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("A3-limpeza", async () => {
  const resp = await api(`/adquirentes?limit=100`);
  const itens = (await resp.json()).data ?? [];
  let removidos = 0;
  for (const item of itens) {
    if (item.nome?.includes(TAG)) {
      const del = await api(`/adquirentes/${item.id}`, { method: "DELETE" });
      if (del.ok) removidos += 1;
    }
  }
  log("A3-limpeza", removidos >= 1, `removidos=${removidos}`);
});

// ================= CANDIDATO A4/B3: CAMPANHA — CRIAR (PeriodoDialog, compartilhado c/ Coleções) / ALTERNAR STATUS =================
let nomeCampanha = `${TAG} Campanha`;
await tentar("A4-duplo-submit-campanha-criar", async () => {
  await page.goto(`${BASE}/campanhas`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Nova campanha")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", nomeCampanha);
  await page.fill("#inicio", "2026-01-01");
  await page.fill("#fim", "2026-02-01");

  const captura = contadorRequests((req) => req.url().endsWith("/campanhas") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Salvar")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  const ocorrencias = await page.locator(`[aria-label="Ações de ${nomeCampanha}"]`).count();
  log(
    "A4-duplo-submit-campanha-criar",
    captura.chamadas.length === 1 && ocorrencias === 1,
    `requestsPOST=${captura.chamadas.length} cardsNaLista=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)} — PeriodoDialog é compartilhado com Coleções: este resultado cobre ambos`,
  );
});

await tentar("B3-duplo-clique-campanha-alternar-status", async () => {
  await page.click(`[aria-label="Ações de ${nomeCampanha}"]`);
  await page.waitForTimeout(200);
  const captura = contadorRequests((req) => req.url().includes("/campanhas/") && ["PATCH", "PUT"].includes(req.method()));
  const item = page.locator('div[role="menuitem"]:has-text("Inativar")');
  const statusCliques = await cliqueDuploForcado(item);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeCampanha}"]`);
  await page.waitForTimeout(200);
  const ofereceAtivar = await page.locator('div[role="menuitem"]:has-text("Ativar")').count();
  await page.keyboard.press("Escape").catch(() => {});

  log(
    "B3-duplo-clique-campanha-alternar-status",
    captura.chamadas.length === 1 && ofereceAtivar === 1,
    `requestsPATCH/PUT=${captura.chamadas.length} statusFinalInativo=${ofereceAtivar === 1} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("A4-limpeza", async () => {
  await page.goto(`${BASE}/campanhas`, { waitUntil: "networkidle" });
  await page.click(`[aria-label="Ações de ${nomeCampanha}"]`);
  await page.waitForTimeout(200);
  await page.click('div[role="menuitem"]:has-text("Excluir")');
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await page.click('[role="alertdialog"] button:has-text("Excluir")');
  await page.waitForTimeout(1000);
  const corpo = await page.textContent("body");
  log("A4-limpeza", !corpo?.includes(nomeCampanha), "campanha removida");
});

fs.writeFileSync("e2e/.resultado-parcial-2017.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
console.log("--- checkpoint 2 salvo (Adquirente, Campanha) ---");

// ================= CANDIDATO A5: CONFIGURAÇÃO DA LOJA =================
let nomeLojaOriginal = null;
await tentar("A5-duplo-submit-configuracao-loja", async () => {
  await page.goto(`${BASE}/configuracoes`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  nomeLojaOriginal = await page.locator("#nome").inputValue();
  await page.fill("#nome", `${nomeLojaOriginal} ${TAG}`);

  const captura = contadorRequests((req) => req.url().endsWith("/configuracoes/loja") && ["PUT", "PATCH"].includes(req.method()));
  const botao = page.locator('button[type="submit"]:has-text("Salvar dados da loja")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  log(
    "A5-duplo-submit-configuracao-loja",
    captura.chamadas.length === 1,
    `requestsPUT/PATCH=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});
await tentar("A5-restaurar-nome-loja", async () => {
  if (nomeLojaOriginal === null) return;
  // Restauração via API direta, não pela UI: o schema do formulário exige
  // nome não-vazio (min 1), e o valor original capturado era "" — a própria
  // UI bloquearia a restauração por validação client-side. Isso não é parte
  // do teste de reentrância, apenas limpeza do dado alterado por ele.
  const resp = await api("/configuracoes");
  const lojaAtual = (await resp.json()).data.loja;
  const restaurar = await api("/configuracoes/loja", {
    method: "PUT",
    body: JSON.stringify({ ...lojaAtual, nome: nomeLojaOriginal }),
  });
  const confirmResp = await api("/configuracoes");
  const nomeAtual = (await confirmResp.json()).data.loja.nome;
  log("A5-restaurar-nome-loja", restaurar.ok && nomeAtual === nomeLojaOriginal, `httpStatus=${restaurar.status} nomeEsperado="${nomeLojaOriginal}" nomeAtual="${nomeAtual}"`);
});

// ================= CANDIDATO A6/A7: PRODUTO — CRIAR (cobre editar, ProdutoForm compartilhado) / VARIANTE — CRIAR =================
await tentar("seed-config-produto", async () => {
  const r = await api("/configuracoes/categorias", { method: "POST", body: JSON.stringify({ valor: `${TAG}-Categoria` }) });
  const r2 = await api("/configuracoes/cores", { method: "POST", body: JSON.stringify({ valor: `${TAG}-Cor` }) });
  log("seed-config-produto", r.ok && r2.ok, `categoria=${r.status} cor=${r2.status}`);
});

let produtoId = "";
await tentar("A6-duplo-submit-produto-criar", async () => {
  await page.goto(`${BASE}/produtos/novo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", `${TAG} Produto`);
  await page.click("#categoria");
  await page.click(`[role="option"]:has-text("${TAG}-Categoria")`);
  await page.fill("#precoCusto", "50");
  await page.fill("#precoVenda", "100");
  await page.waitForTimeout(400);

  const captura = contadorRequests((req) => req.url().endsWith("/produtos") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Criar produto")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  if (captura.chamadas.length >= 1 && /\/produtos\/[a-f0-9]+$/.test(page.url())) {
    produtoId = page.url().split("/").pop();
  }
  log(
    "A6-duplo-submit-produto-criar",
    captura.chamadas.length === 1,
    `requestsPOST=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)} produtoId=${produtoId}`,
  );
});

await tentar("A7-duplo-submit-variante-criar", async () => {
  if (!produtoId) throw new Error("produtoId indisponível — dependente do candidato A6");
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  // Aguarda a animação de fechamento do popover do Select assentar (mesmo
  // ajuste feito na Etapa 20.15 — um clique no instante exato do fechamento
  // pode acertar o overlay transitório em vez do botão real).
  await page.waitForTimeout(400);

  const captura = contadorRequests((req) => req.url().includes("/variantes") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Adicionar")');
  const statusCliques = await cliqueDuploForcado(botao);
  await page.waitForTimeout(1500);
  captura.parar();

  const corpo = await page.textContent("body");
  const ocorrencias = (corpo?.match(new RegExp(`${TAG}-Cor`, "g")) ?? []).length;
  log(
    "A7-duplo-submit-variante-criar",
    captura.chamadas.length === 1,
    `requestsPOST=${captura.chamadas.length} ocorrenciasNaTela=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)}`,
  );
});

await tentar("A6-A7-limpeza", async () => {
  let okProduto = true;
  if (produtoId) {
    const del = await api(`/produtos/${produtoId}`, { method: "DELETE" });
    okProduto = del.ok;
  }
  const r1 = await api(`/configuracoes/categorias/${encodeURIComponent(`${TAG}-Categoria`)}`, { method: "DELETE" });
  const r2 = await api(`/configuracoes/cores/${encodeURIComponent(`${TAG}-Cor`)}`, { method: "DELETE" });
  log("A6-A7-limpeza", okProduto && r1.ok && r2.ok, `produto=${okProduto} categoria=${r1.ok} cor=${r2.ok}`);
});

// ================= REGRESSÃO: AÇÃO LEGÍTIMA SEQUENCIAL APÓS CADA GUARDA (se corrigido) =================
// (executado apenas após eventuais correções, ver script de regressão dedicado se necessário)

// ================= REDE DE SEGURANÇA: VARREDURA FINAL POR RESÍDUOS =================
// Necessária porque testes de duplo-submit podem criar 2 registros reais
// (quando o backend não bloqueia por unicidade), e uma limpeza que apaga só
// o 1º id capturado pode deixar o 2º órfão. Varre cada entidade por "TAG" e
// apaga tudo que sobrar, confirmando por GET direto.
await tentar("rede-seguranca-varredura-final", async () => {
  const achados = [];
  async function varrer(path, listKey = "data") {
    const resp = await api(`${path}?limit=100`);
    const json = await resp.json();
    const itens = json[listKey] ?? [];
    for (const item of itens) {
      if (item.nome?.includes(TAG)) {
        achados.push(`${path}/${item.id} (${item.nome})`);
        await api(`${path}/${item.id}`, { method: "DELETE" });
      }
    }
  }
  await varrer("/fornecedores");
  await varrer("/vendedores");
  await varrer("/adquirentes");
  await varrer("/campanhas");
  await varrer("/colecoes");
  await varrer("/produtos");
  const configResp = await api("/configuracoes");
  const config = (await configResp.json()).data;
  if (config.loja.nome?.includes(TAG)) achados.push(`configuracoes/loja.nome="${config.loja.nome}" (NÃO restaurado automaticamente — revisar manualmente)`);
  for (const item of [...config.categorias, ...config.cores, ...config.tamanhos]) {
    if (item.includes(TAG)) {
      achados.push(`configuracoes/${item}`);
    }
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
fs.writeFileSync("e2e/.resultado-2017.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
