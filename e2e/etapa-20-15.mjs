// Etapa 20.15 — validação dinâmica de loading/pending/duplo-submit (script
// ad-hoc, não é suíte permanente). Dirige o Chrome do sistema via Playwright
// contra o Backoffice real + backend real. Reutiliza a infraestrutura das
// Etapas 20.12/20.13/20.14 (login, seed/remoção de configurações, tokenAtual).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const API = "http://localhost:3000/api/v1";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const TAG = "E2E2015";

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

/** Dispara um clique duplo "forçado": ignora a espera de actionability do
 * Playwright (que naturalmente esperaria o botão sair do estado disabled),
 * simulando o pior caso real de um duplo clique humano rápido. Se a UI
 * realmente bloquear a segunda submissão, o segundo clique não deve produzir
 * uma nova requisição de mutation — e é isso que medimos, não o atributo
 * `disabled` em si. */
async function cliqueDuploForcado(locator) {
  const resultados = await Promise.allSettled([
    locator.click({ force: true, timeout: 3000 }),
    locator.click({ force: true, timeout: 3000 }),
  ]);
  return resultados.map((r) => r.status);
}

function contadorRequests(matcher) {
  const chamadas = [];
  const handler = (req) => {
    if (matcher(req)) chamadas.push({ url: req.url(), method: req.method(), body: req.postData() });
  };
  page.on("request", handler);
  return {
    chamadas,
    parar: () => page.off("request", handler),
  };
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

// ================= CENÁRIO A: FORMULÁRIO NÃO DESTRUTIVO (Configurações) =================
await tentar("cenarioA-duplo-submit-adicionar-config", async () => {
  await page.goto(`${BASE}/configuracoes`, { waitUntil: "networkidle" });
  await page.click('button[role="tab"]:has-text("Categorias")');
  await page.waitForTimeout(300);
  const valor = `${TAG}-DuploSubmit`;
  const input = page.locator('[aria-label="Adicionar em Categorias"]');
  await input.fill(valor);

  const captura = contadorRequests((req) => req.url().includes("/configuracoes/categorias") && req.method() === "POST");
  const botao = page.locator('button:has-text("Adicionar")').last();

  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  // Contagem por botão "Remover X" (1 por item real na lista) em vez de busca
  // textual bruta — texto solto pode aparecer também em toasts/mensagens de
  // erro e não reflete de forma confiável quantos itens existem de fato.
  const itensReais = await page.locator(`button[aria-label="Remover ${valor}"]`).count();

  log(
    "cenarioA-duplo-submit-adicionar-config",
    captura.chamadas.length === 1 && itensReais === 1,
    `requestsPOST=${captura.chamadas.length} itensRealNaLista=${itensReais} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

await tentar("cenarioA-limpeza", async () => {
  const removido = await removeItemLista("Categorias", `${TAG}-DuploSubmit`);
  log("cenarioA-limpeza", removido, `removido=${removido}`);
});

// ================= SEED PARA CENÁRIOS B e C =================
await tentar("seed-configuracoes", async () => {
  const c1 = await addItemLista("Categorias", "Categorias", `${TAG}-Categoria`);
  const c2 = await addItemLista("Cores", "Cores", `${TAG}-Cor`);
  const c3 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-M`);
  const c4 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-G`);
  log("seed-configuracoes", c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0, `categoria=${c1} cor=${c2} M=${c3} G=${c4}`);
});

let produtoId = "";
await tentar("seed-produto-variante", async () => {
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

  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  log("seed-produto-variante", produtoId !== "", `produtoId=${produtoId}`);
});

// ================= CENÁRIO B: VARIANTE/TAMANHO — ADICIONAR COM DUPLO CLIQUE =================
await tentar("cenarioB-duplo-submit-adicionar-tamanho", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-M")`);
  await page.fill("#quantidade", "5");
  // Aguarda a animação de fechamento do popover do Select assentar antes do
  // duplo clique: um clique disparado no instante exato em que o overlay do
  // popover ainda está recuando pode acertar esse overlay transitório em vez
  // do botão, o que não tem relação com o comportamento de duplo-submit sob
  // teste (confirmado via diagnóstico com elementFromPoint nesta etapa).
  await page.waitForTimeout(400);

  const captura = contadorRequests((req) => req.url().includes("/tamanhos") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Adicionar")');
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  // Contagem por botão "Excluir tamanho X" (1 por badge de tamanho real) em
  // vez de busca textual bruta — o <select> nativo oculto do Radix Select
  // também contém o texto da opção, inflando uma contagem ingênua mesmo sem
  // nenhum tamanho de fato adicionado.
  const badgesReais = await page.locator(`button[aria-label="Excluir tamanho ${TAG}-M"]`).count();

  log(
    "cenarioB-duplo-submit-adicionar-tamanho",
    captura.chamadas.length === 1 && badgesReais === 1,
    `requestsPOST=${captura.chamadas.length} badgesReais=${badgesReais} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

await tentar("cenarioB-tamanho-G-para-estoque", async () => {
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
  log("cenarioB-tamanho-G-para-estoque", resp.ok(), `httpStatus=${resp.status()}`);
});

// ================= CENÁRIO B: EXCLUIR TAMANHO COM DUPLO CLIQUE (ConfirmDialog) =================
await tentar("cenarioB-duplo-submit-excluir-tamanho", async () => {
  await page.click(`button[aria-label="Excluir tamanho ${TAG}-M"]`);
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });

  const captura = contadorRequests((req) => req.url().includes("/tamanhos/") && req.method() === "DELETE");
  const botao = page.locator('[role="alertdialog"] button:has-text("Excluir")');
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  const corpo = await page.textContent("body");
  const mSumiu = !(corpo?.includes(`${TAG}-M`) ?? true);
  const gPermanece = corpo?.includes(`${TAG}-G`) ?? false;

  log(
    "cenarioB-duplo-submit-excluir-tamanho",
    captura.chamadas.length === 1 && mSumiu && gPermanece,
    `requestsDELETE=${captura.chamadas.length} M-sumiu=${mSumiu} G-permanece=${gPermanece} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

fs.writeFileSync("e2e/.resultado-parcial-2015.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
console.log("--- checkpoint 1 salvo (cenários A e B) ---");

// ================= CENÁRIO C: ESTOQUE — ENTRADA COM DUPLO CLIQUE =================
await tentar("cenarioC-duplo-submit-estoque-entrada", async () => {
  await page.click('button:has-text("Entrada")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-G")`);
  await page.fill("#quantidade", "4");
  await page.waitForTimeout(400);

  const captura = contadorRequests((req) => req.url().includes("/estoque/entrada") && req.method() === "POST");
  const botao = page.locator('button[type="submit"]:has-text("Registrar entrada")');
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const quantidadeCorreta = corpo?.includes("7") ?? false; // 3 + 4 = 7 (não 11, se houvesse duplicidade)

  log(
    "cenarioC-duplo-submit-estoque-entrada",
    captura.chamadas.length === 1 && quantidadeCorreta,
    `requestsPOST=${captura.chamadas.length} quantidadeFinalCorreta(7)=${quantidadeCorreta} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

// ================= GROUND TRUTH: PRODUTO/VARIANTE/TAMANHO após A/B/C =================
await tentar("ground-truth-produto", async () => {
  const resp = await fetch(`${API}/produtos/${produtoId}`, { headers: { Authorization: `Bearer ${await tokenAtual()}` } });
  const json = await resp.json();
  const variante = json.data.variantes[0];
  const tamanhoG = variante.tamanhos.find((t) => t.tamanho === `${TAG}-G`);
  const temM = variante.tamanhos.some((t) => t.tamanho === `${TAG}-M`);
  log(
    "ground-truth-produto",
    !temM && tamanhoG?.quantidade === 7,
    `M-ausente=${!temM} G-quantidade=${tamanhoG?.quantidade}`,
  );
});

fs.writeFileSync("e2e/.resultado-parcial-2015.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
console.log("--- checkpoint 2 salvo (cenário C) ---");

// ================= CENÁRIO D: CAIXA — ABRIR / ENTRADA / FECHAR COM DUPLO CLIQUE =================
await tentar("cenarioD-caixa-nenhum-aberto-antes", async () => {
  await page.goto(`${BASE}/caixa`, { waitUntil: "networkidle" });
  const temCaixaAberto = await page.locator('text="Caixa aberto"').count();
  log("cenarioD-caixa-nenhum-aberto-antes", temCaixaAberto === 0, `ausente=${temCaixaAberto === 0}`);
});

await tentar("cenarioD-duplo-submit-caixa-abrir", async () => {
  await page.locator('button:has-text("Abrir caixa")').first().click();
  await page.waitForSelector("#abertura-valor", { timeout: 5000 });
  await page.fill("#abertura-valor", "100");

  const captura = contadorRequests((req) => req.url().endsWith("/caixas") && req.method() === "POST");
  const botao = page.locator('button:has-text("Abrir caixa")').last();
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  const sucessos = captura.chamadas.length;
  await page.waitForSelector("#abertura-valor", { state: "hidden", timeout: 5000 }).catch(() => {});
  await page.waitForSelector('a:has-text("Ver caixa")', { timeout: 8000 }).catch(() => {});
  await Promise.all([
    page.waitForURL(/\/caixa\/[a-f0-9]+/, { timeout: 8000 }).catch(() => {}),
    page.click('a:has-text("Ver caixa")').catch(() => {}),
  ]);

  log(
    "cenarioD-duplo-submit-caixa-abrir",
    sucessos === 1,
    `requestsPOST=${sucessos} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos} url=${page.url()}`,
  );
});

await tentar("cenarioD-duplo-submit-caixa-entrada", async () => {
  await page.click('button:has-text("Entrada")');
  await page.waitForSelector("#mov-descricao", { timeout: 5000 });
  await page.fill("#mov-descricao", "Entrada duplo-submit E2E 20.15");
  await page.fill("#mov-valor", "40");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);

  const captura = contadorRequests((req) => req.url().includes("/entrada") && req.method() === "POST");
  const botao = page.locator('button:has-text("Confirmar")');
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const ocorrencias = (corpo?.match(/Entrada duplo-submit E2E 20\.15/g) ?? []).length;

  log(
    "cenarioD-duplo-submit-caixa-entrada",
    captura.chamadas.length === 1 && ocorrencias === 1,
    `requestsPOST=${captura.chamadas.length} ocorrenciasNaTabela=${ocorrencias} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

await tentar("cenarioD-duplo-submit-caixa-fechar", async () => {
  // Saldo esperado: 100 (abertura) + 40 (entrada) = 140
  await page.click('button:has-text("Fechar caixa")');
  await page.waitForSelector("#fechamento-valor", { timeout: 5000 });
  await page.fill("#fechamento-valor", "140");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);

  const captura = contadorRequests((req) => req.url().includes("/fechamento") && req.method() === "POST");
  const botao = page.locator('button:has-text("Confirmar fechamento")');
  const statusCliques = await cliqueDuploForcado(botao);
  const desabilitadoLogoApos = await botao.isDisabled().catch(() => false);
  await page.waitForTimeout(1500);
  captura.parar();

  log(
    "cenarioD-duplo-submit-caixa-fechar",
    captura.chamadas.length === 1,
    `requestsPOST=${captura.chamadas.length} statusCliques=${JSON.stringify(statusCliques)} disabledLogoAposClique=${desabilitadoLogoApos}`,
  );
});

// Rede de segurança: se qualquer passo acima do Cenário D falhou de um jeito
// que impediu o fechamento pela UI (ex.: navegação não concluída), fecha o
// caixa diretamente pela API antes de prosseguir — nunca deixar um caixa
// aberto ao final da etapa, independentemente do resultado dos testes de UI.
await tentar("cenarioD-rede-seguranca-fechar-se-necessario", async () => {
  const token = await tokenAtual();
  const atualResp = await fetch(`${API}/caixas/atual`, { headers: { Authorization: `Bearer ${token}` } });
  const atual = (await atualResp.json()).data;
  if (!atual) {
    log("cenarioD-rede-seguranca-fechar-se-necessario", true, "nenhum caixa aberto — nada a fazer");
    return;
  }
  const fech = await fetch(`${API}/caixas/${atual.id}/fechamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ valorInformado: atual.resumo.saldoEsperado }),
  });
  log(
    "cenarioD-rede-seguranca-fechar-se-necessario",
    fech.ok,
    `caixa ${atual.codigo} estava aberto e foi fechado via API (fallback) — httpStatus=${fech.status}`,
  );
});

await tentar("cenarioD-caixa-nenhum-aberto-depois", async () => {
  const resp = await fetch(`${API}/caixas/atual`, { headers: { Authorization: `Bearer ${await tokenAtual()}` } });
  const json = await resp.json();
  log("cenarioD-caixa-nenhum-aberto-depois", json.data === null, `caixas/atual=${JSON.stringify(json.data)}`);
});

// ================= LIMPEZA =================
await tentar("limpeza-produto", async () => {
  const token = await tokenAtual();
  const resp = await fetch(`${API}/produtos/${produtoId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  log("limpeza-produto", resp.ok, `httpStatus=${resp.status}`);
});

await tentar("limpeza-configuracoes", async () => {
  const r1 = await removeItemLista("Categorias", `${TAG}-Categoria`);
  const r2 = await removeItemLista("Cores", `${TAG}-Cor`);
  const r3 = await removeItemLista("Tamanhos", `${TAG}-G`);
  const r4 = await removeItemLista("Tamanhos", `${TAG}-M`);
  log("limpeza-configuracoes", r1 && r2 && r3 && r4, `categoria=${r1} cor=${r2} G=${r3} M=${r4}`);
});

console.log("--- console errors capturados:", consoleErros.length, JSON.stringify(consoleErros));
console.log("--- erros de rede (>=500 ou requestfailed):", redeErros.length, JSON.stringify(redeErros));
console.log("--- respostas 4xx (diagnóstico):", respostas4xx.length, JSON.stringify(respostas4xx, null, 2));
fs.writeFileSync("e2e/.resultado-2015.json", JSON.stringify({ resultados, consoleErros, redeErros, respostas4xx }, null, 2));
await browser.close();
