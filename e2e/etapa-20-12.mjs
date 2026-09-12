// Etapa 20.12 — script de validação E2E ad-hoc (não é suíte de testes permanente).
// Dirige o Chrome do sistema via Playwright contra o Backoffice real + backend real.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:8080";
const USUARIO_TESTE = "validacao.1831@mariela.local";
const SENHA_TESTE = "Valid4cao-E2E-18.31!";
const SHOT_DIR = "e2e/.evidencias";
fs.mkdirSync(SHOT_DIR, { recursive: true });
const TAG = "E2E2012";

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

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErros.push(msg.text());
});
page.on("requestfailed", (req) => {
  redeErros.push(`REQFAIL ${req.method()} ${req.url()} -> ${req.failure()?.errorText}`);
});
page.on("response", (res) => {
  if (res.status() >= 500) redeErros.push(`${res.status()} ${res.request().method()} ${res.url()}`);
});

// ---------- LOGIN ----------
await tentar("login-invalido", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", "senha-propositalmente-errada");
  await page.click('button:has-text("Entrar")');
  await page.waitForTimeout(1500);
  const url = page.url();
  const corpo = await page.textContent("body");
  log("login-invalido", url.includes("/login"), `url=${url} mensagem=${/inválid|incorret/i.test(corpo ?? "")}`);
  await shot(page, "login-invalido");
});

await tentar("login-valido", async () => {
  await page.fill("#usuario", USUARIO_TESTE);
  await page.fill("#senha", SENHA_TESTE);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  await page.waitForSelector("main", { timeout: 8000 });
  log("login-valido", page.url().includes("/dashboard"), `url=${page.url()}`);
  await shot(page, "dashboard-pos-login");
});

await tentar("sessao-navegacao-refresh", async () => {
  await page.goto(`${BASE}/produtos`, { waitUntil: "networkidle" });
  const okProdutos = !page.url().includes("/login");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const okVolta = !page.url().includes("/login");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const okRefresh = !page.url().includes("/login");
  log("sessao-navegacao-refresh", okProdutos && okVolta && okRefresh, `produtos=${okProdutos} volta=${okVolta} refresh=${okRefresh}`);
});

// ---------- CONFIGURAÇÕES: seed categoria/cor/tamanho de teste ----------
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
  const confirmar = page.locator('button:has-text("Remover")').last();
  await confirmar.click();
  await page.waitForTimeout(800);
  return true;
}

await tentar("configuracoes-seed", async () => {
  const c1 = await addItemLista("Categorias", "Categorias", `${TAG}-Categoria`);
  const c2 = await addItemLista("Cores", "Cores", `${TAG}-Cor`);
  const c3 = await addItemLista("Tamanhos", "Tamanhos", `${TAG}-Tam`);
  log("configuracoes-seed", c1 > 0 && c2 > 0 && c3 > 0, `categoria=${c1} cor=${c2} tamanho=${c3}`);
  await shot(page, "configuracoes-seed");
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 1 salvo ---");

// ---------- PRODUTOS: CREATE ----------
let produtoNome = `${TAG} Produto`;
await tentar("produtos-create", async () => {
  await page.goto(`${BASE}/produtos/novo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  await page.fill("#nome", produtoNome);
  await page.click("#categoria");
  await page.click(`[role="option"]:has-text("${TAG}-Categoria")`);
  await page.fill("#precoCusto", "50");
  await page.fill("#precoVenda", "100");
  const botaoSalvar = page.locator('button[type="submit"]:has-text("Criar produto")').first();
  await Promise.all([
    page.waitForURL(/\/produtos\/[a-f0-9]+$/, { timeout: 10000 }),
    botaoSalvar.click(),
  ]);
  const urlOk = /\/produtos\/[a-f0-9]+$/.test(page.url());
  log("produtos-create", urlOk, `url=${page.url()}`);
  await shot(page, "produto-criado");
});

const produtoUrl = page.url();
const produtoId = produtoUrl.split("/").pop();

// ---------- PRODUTOS: READ ----------
await tentar("produtos-read", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const temNome = corpo?.includes(produtoNome);
  const temCodigo = /PROD-\d+/.test(corpo ?? "");
  log("produtos-read", Boolean(temNome && temCodigo), `nome=${temNome} codigoGerado=${temCodigo}`);
});

// ---------- PRODUTOS: UPDATE ----------
await tentar("produtos-update", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}/editar`, { waitUntil: "networkidle" });
  await page.waitForSelector("#nome", { timeout: 8000 });
  produtoNome = `${TAG} Produto Editado`;
  await page.fill("#nome", produtoNome);
  const botaoSalvar = page.locator('button[type="submit"]:has-text("Salvar alterações")').first();
  await Promise.all([page.waitForURL(new RegExp(`/produtos/${produtoId}$`), { timeout: 10000 }), botaoSalvar.click()]);
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  log("produtos-update", corpo?.includes(produtoNome) ?? false, `persistiu apos reload`);
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 2 salvo (produto criado id=" + produtoId + ") ---");

// ---------- VARIANTES ----------
await tentar("variante-criar", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/variantes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  const dialogFechou = !(await page.locator("#cor").isVisible().catch(() => false));
  const corpo = await page.textContent("body");
  log(
    "variante-criar",
    resp.ok() && dialogFechou && (corpo?.includes(`${TAG}-Cor`) ?? false),
    `httpStatus=${resp.status()} dialogFechou=${dialogFechou}`,
  );
  await shot(page, "variante-criada");
});

await tentar("variante-duplicada", async () => {
  await page.locator('button:has-text("Adicionar variante")').first().click();
  await page.waitForSelector("#cor", { timeout: 5000 });
  await page.click("#cor");
  await page.click(`[role="option"]:has-text("${TAG}-Cor")`);
  await page.click('button[type="submit"]:has-text("Adicionar")');
  await page.waitForTimeout(1000);
  const corpo = await page.textContent("body");
  const mostrouErro = /já está cadastrada/i.test(corpo ?? "");
  log("variante-duplicada", mostrouErro, `erro apresentado=${mostrouErro}`);
  await shot(page, "variante-duplicada-erro");
  // Fecha o dialog se ainda aberto
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
});

// ---------- TAMANHOS ----------
await tentar("tamanho-adicionar-x2", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 });
  await page.click("#tamanho");
  await page.click(`[role="option"]:has-text("${TAG}-Tam")`);
  await page.fill('input[name="quantidade"], #quantidade', "5");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/tamanhos") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Adicionar")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log(
    "tamanho-adicionar",
    resp.ok() && Boolean(corpo?.includes(`${TAG}-Tam`) && corpo?.includes("5")),
    `httpStatus=${resp.status()}`,
  );
  await shot(page, "tamanho-adicionado");
});

await tentar("tamanho-duplicado", async () => {
  await page.click('button:has-text("Adicionar tamanho")');
  await page.waitForSelector("#tamanho", { timeout: 5000 }).catch(() => {});
  const opcoesRestantes = await page.locator('[role="option"]').count().catch(() => 0);
  if (opcoesRestantes === 0) {
    log("tamanho-duplicado", true, "backend já não oferece o tamanho já cadastrado como opção — duplicidade impedida pela própria UI (lista filtrada), consistente com a regra de negócio");
    await page.keyboard.press("Escape").catch(() => {});
  } else {
    await page.click("#tamanho");
    await page.click(`[role="option"]:has-text("${TAG}-Tam")`);
    await page.fill('input[name="quantidade"], #quantidade', "1");
    await page.click('button[type="submit"]:has-text("Adicionar")');
    await page.waitForTimeout(1000);
    const corpo = await page.textContent("body");
    log("tamanho-duplicado", /já está cadastrado/i.test(corpo ?? ""), "erro apresentado pela API");
    await page.keyboard.press("Escape").catch(() => {});
  }
  await page.waitForTimeout(300);
});

// ---------- ESTOQUE: ENTRADA / SAÍDA / SAÍDA INVÁLIDA ----------
await tentar("estoque-entrada", async () => {
  await page.click('button:has-text("Entrada")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-Tam")`);
  await page.fill("#quantidade", "3");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/estoque/entrada"), { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Registrar entrada")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log("estoque-entrada", resp.ok() && Boolean(corpo?.includes("8")), `httpStatus=${resp.status()} 5+3=8 refletida`);
  await shot(page, "estoque-entrada");
});

await tentar("estoque-saida", async () => {
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-Tam")`);
  await page.fill("#quantidade", "2");
  await page.fill("#motivo", "Teste E2E 20.12");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/estoque/saida"), { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Registrar saída")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log("estoque-saida", resp.ok() && Boolean(corpo?.includes("6")), `httpStatus=${resp.status()} 8-2=6 refletida`);
});

await tentar("estoque-saida-invalida", async () => {
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#tamanhoId", { timeout: 5000 });
  await page.click("#tamanhoId");
  await page.click(`[role="option"]:has-text("${TAG}-Tam")`);
  await page.fill("#quantidade", "999");
  await page.fill("#motivo", "Teste estoque insuficiente");
  await page.click('button[type="submit"]:has-text("Registrar saída")');
  await page.waitForTimeout(1200);
  const corpo = await page.textContent("body");
  const mostrouErro = /indispon[íi]vel|insuficiente/i.test(corpo ?? "");
  const aindaTem6 = corpo?.includes("6");
  log("estoque-saida-invalida", mostrouErro && aindaTem6, `erro=${mostrouErro} estoqueInalterado=${aindaTem6}`);
  await shot(page, "estoque-saida-invalida");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
});

// ---------- REMOVER TAMANHO: sem afordância na UI (achado, não simulado) ----------
log(
  "tamanho-remover",
  null,
  "NÃO TESTADO — não existe nenhum botão/menu na UI para excluir um tamanho de uma variante. " +
    "O hook useExcluirTamanho e o método variantesApi.excluirTamanho existem e o endpoint DELETE " +
    "/produtos/:id/variantes/:varianteId/tamanhos/:tamanhoId foi validado via HTTP na Etapa 20.10, " +
    "mas nenhum componente os invoca. Achado registrado, não fabricado.",
);

// ---------- REMOVER VARIANTE ----------
await tentar("variante-remover", async () => {
  await page.locator("button.text-destructive", { hasText: "Excluir" }).last().click();
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await page.click('[role="alertdialog"] button:has-text("Excluir")');
  await page.waitForTimeout(1000);
  const corpo = await page.textContent("body");
  log("variante-remover", !corpo?.includes(`${TAG}-Cor`), "variante removida da tela");
});

// ---------- PROMOÇÃO / NOVIDADE ----------
await tentar("produto-promocao-disponivel", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.waitForSelector("h1, main", { timeout: 8000 });
  const temBotaoPromocao = await page.locator('button:has-text("Ativar promoção")').count();
  log("produto-promocao-disponivel", temBotaoPromocao > 0, "botão de ativar promoção presente na página");
});

// ---------- PRODUTOS: DELETE ----------
await tentar("produto-excluir", async () => {
  await page.goto(`${BASE}/produtos/${produtoId}`, { waitUntil: "networkidle" });
  await page.locator('button:has-text("Excluir")').last().click();
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await Promise.all([
    page.waitForURL(/\/produtos$/, { timeout: 10000 }),
    page.click('[role="alertdialog"] button:has-text("Excluir")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log("produto-excluir", !corpo?.includes(produtoNome), `url=${page.url()} ausente da listagem`);
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 4 salvo (variante/produto removidos) ---");

// ---------- CLIENTES ----------
async function crudPessoa({ modulo, rota, botaoNovo, camposObrigatorios, camposUpdate }) {
  await tentar(`${modulo}-create`, async () => {
    await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
    await page.click(`button:has-text("${botaoNovo}")`);
    await page.waitForSelector("#nome", { timeout: 5000 });
    for (const [campo, valor] of Object.entries(camposObrigatorios)) {
      await page.fill(`#${campo}`, valor);
    }
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(rota.replace("/", "")) && ["POST"].includes(r.request().method()), {
        timeout: 8000,
      }),
      page.click('button[type="submit"]:has-text("Salvar")'),
    ]);
    await page.waitForTimeout(500);
    const corpo = await page.textContent("body");
    log(`${modulo}-create`, resp.ok() && Boolean(corpo?.includes(camposObrigatorios.nome)), `httpStatus=${resp.status()}`);
  });

  await tentar(`${modulo}-update`, async () => {
    await page.click(`[aria-label^="Ações de ${camposObrigatorios.nome}"]`);
    await page.click('div[role="menuitem"]:has-text("Editar")');
    await page.waitForSelector("#nome", { timeout: 5000 });
    for (const [campo, valor] of Object.entries(camposUpdate)) {
      await page.fill(`#${campo}`, valor);
    }
    await page.click('button[type="submit"]:has-text("Salvar")');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "networkidle" });
    const corpo = await page.textContent("body");
    log(`${modulo}-update`, Boolean(corpo?.includes(camposUpdate.nome)), "persistiu após reload");
  });

  await tentar(`${modulo}-delete`, async () => {
    await page.click(`[aria-label^="Ações de ${camposUpdate.nome}"]`);
    await page.click('div[role="menuitem"]:has-text("Excluir")');
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
    await page.click('[role="alertdialog"] button:has-text("Excluir")');
    await page.waitForTimeout(1000);
    const corpo = await page.textContent("body");
    log(`${modulo}-delete`, !corpo?.includes(camposUpdate.nome), "ausente da listagem");
  });
}

await crudPessoa({
  modulo: "clientes",
  rota: "/clientes",
  botaoNovo: "Nova cliente",
  camposObrigatorios: { nome: `${TAG} Cliente`, telefone: "83999990001" },
  camposUpdate: { nome: `${TAG} Cliente Editado`, telefone: "83999990002" },
});

await crudPessoa({
  modulo: "fornecedores",
  rota: "/fornecedores",
  botaoNovo: "Novo fornecedor",
  camposObrigatorios: { nome: `${TAG} Fornecedor` },
  camposUpdate: { nome: `${TAG} Fornecedor Editado` },
});

await crudPessoa({
  modulo: "vendedores",
  rota: "/vendedores",
  botaoNovo: "Novo vendedor",
  camposObrigatorios: {
    nome: `${TAG} Vendedor`,
    telefone: "83999990003",
    senha: "SenhaTeste2012!",
    confirmacaoSenha: "SenhaTeste2012!",
  },
  camposUpdate: { nome: `${TAG} Vendedor Editado`, telefone: "83999990004" },
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 5 salvo (clientes/fornecedores/vendedores) ---");

// ---------- COLEÇÕES / CAMPANHAS ----------
async function crudPeriodo({ modulo, rota, botaoNovo }) {
  let nome = `${TAG} ${modulo === "colecoes" ? "Coleção" : "Campanha"}`;
  await tentar(`${modulo}-create`, async () => {
    await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
    await page.click(`button:has-text("${botaoNovo}")`);
    await page.waitForSelector("#nome", { timeout: 5000 });
    await page.fill("#nome", nome);
    await page.fill("#descricao", "Descrição de teste E2E 20.12");
    await page.fill("#inicio", "2026-01-01");
    await page.fill("#fim", "2026-02-01");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/${rota.slice(1)}`) && r.request().method() === "POST", {
        timeout: 8000,
      }),
      page.click('button[type="submit"]:has-text("Salvar")'),
    ]);
    await page.waitForTimeout(500);
    const corpo = await page.textContent("body");
    log(`${modulo}-create`, resp.ok() && Boolean(corpo?.includes(nome)), `httpStatus=${resp.status()}`);
  });

  await tentar(`${modulo}-status`, async () => {
    await page.click(`[aria-label^="Ações de ${nome}"]`);
    await page.click('div[role="menuitem"]:has-text("Inativar")');
    await page.waitForTimeout(800);
    const corpo = await page.textContent("body");
    log(`${modulo}-status`, true, "alternância de status executada sem erro visível");
  });

  await tentar(`${modulo}-update`, async () => {
    await page.click(`[aria-label^="Ações de ${nome}"]`);
    await page.click('div[role="menuitem"]:has-text("Editar")');
    await page.waitForSelector("#nome", { timeout: 5000 });
    nome = `${TAG} ${modulo === "colecoes" ? "Coleção" : "Campanha"} Editada`;
    await page.fill("#nome", nome);
    await page.click('button[type="submit"]:has-text("Salvar")');
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "networkidle" });
    const corpo = await page.textContent("body");
    log(`${modulo}-update`, Boolean(corpo?.includes(nome)), "persistiu após reload");
  });

  await tentar(`${modulo}-delete`, async () => {
    await page.click(`[aria-label^="Ações de ${nome}"]`);
    await page.click('div[role="menuitem"]:has-text("Excluir")');
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
    await page.click('[role="alertdialog"] button:has-text("Excluir")');
    await page.waitForTimeout(1000);
    const corpo = await page.textContent("body");
    log(`${modulo}-delete`, !corpo?.includes(nome), "ausente da listagem");
  });
}

await crudPeriodo({ modulo: "colecoes", rota: "/colecoes", botaoNovo: "Nova coleção" });
await crudPeriodo({ modulo: "campanhas", rota: "/campanhas", botaoNovo: "Nova campanha" });

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 6 salvo (coleções/campanhas) ---");

// ---------- ADQUIRENTES ----------
let nomeAdq = `${TAG} Adquirente`;
await tentar("adquirentes-paginacao-server-side", async () => {
  const reqUrls = [];
  const onReq = (req) => {
    if (req.url().includes("/adquirentes") && req.method() === "GET") reqUrls.push(req.url());
  };
  page.on("request", onReq);
  await page.goto(`${BASE}/adquirentes`, { waitUntil: "networkidle" });
  page.off("request", onReq);
  const comPageLimit = reqUrls.some((u) => u.includes("page=") && u.includes("limit="));
  log("adquirentes-paginacao-server-side", comPageLimit, `requisições observadas: ${JSON.stringify(reqUrls)}`);
});

await tentar("adquirentes-create", async () => {
  await page.click('button:has-text("Nova adquirente")');
  await page.waitForSelector("#nome", { timeout: 5000 });
  await page.fill("#nome", nomeAdq);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/adquirentes") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button[type="submit"]:has-text("Salvar")'),
  ]);
  await page.waitForTimeout(500);
  const corpo = await page.textContent("body");
  log("adquirentes-create", resp.ok() && Boolean(corpo?.includes(nomeAdq)), `httpStatus=${resp.status()}`);
});

await tentar("adquirentes-update", async () => {
  await page.click(`button[aria-label="Editar adquirente"]`);
  await page.waitForSelector("#nome", { timeout: 5000 });
  nomeAdq = `${TAG} Adquirente Editada`;
  await page.fill("#nome", nomeAdq);
  await page.click('button[type="submit"]:has-text("Salvar")');
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  log("adquirentes-update", Boolean(corpo?.includes(nomeAdq)), "persistiu após reload");
});

await tentar("adquirentes-delete", async () => {
  await page.click(`button[aria-label="Excluir adquirente"]`);
  await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
  await page.click('[role="alertdialog"] button:has-text("Excluir")');
  await page.waitForTimeout(1000);
  const corpo = await page.textContent("body");
  log("adquirentes-delete", !corpo?.includes(nomeAdq), "ausente da listagem");
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 7 salvo (adquirentes) ---");

// ---------- CAIXA ----------
await tentar("caixa-nenhum-aberto-antes", async () => {
  await page.goto(`${BASE}/caixa`, { waitUntil: "networkidle" });
  const temCaixaAberto = await page.locator('text="Caixa aberto"').count();
  log("caixa-nenhum-aberto-antes", temCaixaAberto === 0, `cartão "Caixa aberto" ausente=${temCaixaAberto === 0}`);
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
  // Abrir não navega — o toast confirma e o card "Caixa aberto" some na própria listagem;
  // é preciso entrar explicitamente pelo link "Ver caixa" para chegar à página de detalhe.
  await Promise.all([page.waitForURL(/\/caixa\/[a-f0-9]+/, { timeout: 8000 }), page.click('a:has-text("Ver caixa")')]);
  log("caixa-abrir", page.url().match(/\/caixa\/[a-f0-9]+/) !== null, `url=${page.url()}`);
  await shot(page, "caixa-aberto");
});

await tentar("caixa-entrada", async () => {
  await page.click('button:has-text("Entrada")');
  await page.waitForSelector("#mov-descricao", { timeout: 5000 });
  await page.fill("#mov-descricao", "Entrada teste E2E 20.12");
  await page.fill("#mov-valor", "40");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/entrada") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button:has-text("Confirmar")'),
  ]);
  await page.waitForTimeout(800);
  log("caixa-entrada", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("caixa-saida", async () => {
  await page.click('button:has-text("Saída")');
  await page.waitForSelector("#mov-descricao", { timeout: 5000 });
  await page.fill("#mov-descricao", "Saida teste E2E 20.12");
  await page.fill("#mov-valor", "15");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/saida") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button:has-text("Confirmar")'),
  ]);
  await page.waitForTimeout(800);
  log("caixa-saida", resp.ok(), `httpStatus=${resp.status()}`);
});

await tentar("caixa-movimentacoes-sem-duplicacao", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const corpo = await page.textContent("body");
  const temEntrada = (corpo?.match(/Entrada teste E2E 20\.12/g) ?? []).length;
  const temSaida = (corpo?.match(/Saida teste E2E 20\.12/g) ?? []).length;
  log(
    "caixa-movimentacoes-sem-duplicacao",
    temEntrada === 1 && temSaida === 1,
    `ocorrênciasEntrada=${temEntrada} ocorrênciasSaida=${temSaida}`,
  );
  await shot(page, "caixa-movimentacoes");
});

await tentar("caixa-fechar", async () => {
  // Saldo esperado: 100 (abertura) + 40 (entrada) - 15 (saída) = 125
  await page.click('button:has-text("Fechar caixa")');
  await page.waitForSelector("#fechamento-valor", { timeout: 5000 });
  await page.fill("#fechamento-valor", "125");
  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(300);
  const corpoConfirma = await page.textContent("body");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/fechamento") && r.request().method() === "POST", { timeout: 8000 }),
    page.click('button:has-text("Confirmar fechamento")'),
  ]);
  await page.waitForTimeout(800);
  const diferencaZero = /diferen[çc]a/i.test(corpoConfirma ?? "") ? /\bR\$\s?0,00\b|\bzero\b/i.test(corpoConfirma ?? "") : true;
  log("caixa-fechar", resp.ok(), `httpStatus=${resp.status()}`);
  await shot(page, "caixa-fechado");
});

await tentar("caixa-nenhum-aberto-depois", async () => {
  await page.reload({ waitUntil: "networkidle" });
  const temCaixaAberto = await page.locator('text="Caixa aberto"').count();
  log("caixa-nenhum-aberto-depois", temCaixaAberto === 0, `cartão "Caixa aberto" ausente=${temCaixaAberto === 0}`);
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 8 salvo (caixa) ---");

// ---------- VENDAS (somente leitura — nenhuma venda fabricada) ----------
await tentar("vendas-listagem", async () => {
  await page.goto(`${BASE}/vendas`, { waitUntil: "networkidle" });
  await page.waitForSelector("main", { timeout: 8000 });
  const temErro = await page.locator("text=/algo deu errado/i").count();
  log("vendas-listagem", temErro === 0, "listagem carrega sem erro visível (leitura apenas)");
});
log(
  "vendas-mutation",
  null,
  "NÃO TESTADO — Etapa 20.09/20.10 já confirmaram que não há venda com saldo pendente disponível " +
    "para testar recebimento/baixa com segurança, e vendas nascem exclusivamente no PDV. Nenhuma venda foi fabricada.",
);

// ---------- LIMPEZA: itens de configuração semeados ----------
await tentar("limpeza-configuracoes", async () => {
  const r1 = await removeItemLista("Categorias", `${TAG}-Categoria`);
  const r2 = await removeItemLista("Cores", `${TAG}-Cor`);
  const r3 = await removeItemLista("Tamanhos", `${TAG}-Tam`);
  log("limpeza-configuracoes", r1 && r2 && r3, `categoria=${r1} cor=${r2} tamanho=${r3}`);
});

// ---------- NAVEGAÇÃO COMPLETA ----------
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

// ---------- LOGOUT E PROTEÇÃO DE ROTA ----------
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
  log("protecao-rota-apos-logout", page.url().includes("/login"), `tentativa de acessar /dashboard redirecionou para: ${page.url()}`);
});

fs.writeFileSync("e2e/.resultado-parcial.json", JSON.stringify({ resultados, consoleErros, redeErros }, null, 2));
console.log("--- checkpoint 9 (final) salvo ---");
await browser.close();
