/**
 * Fase 22.8.9.9.11 — a publicação só segue se a CI (`.github/workflows/ci.yml`) concluiu com SUCESSO para o MESMO
 * commit da tag, num `push` para `main`.
 *
 *   GITHUB_REPOSITORY=dono/repo GITHUB_TOKEN=... node scripts/release/verificar-ci-do-commit.mjs <sha completo>
 *
 * Regras (nenhuma outra execução autoriza a publicação):
 *   - só execuções do workflow `.github/workflows/ci.yml`, evento `push`, branch `main` e `head_sha` IDÊNTICO ao da tag
 *     (a API é filtrada por `head_sha`, e cada execução é conferida de novo aqui — nunca "qualquer execução verde");
 *   - vale a execução MAIS RECENTE desse commit: concluída com `success` ⇒ aprovado; ainda em andamento ⇒ aguarda;
 *     concluída com qualquer outro resultado ⇒ reprovado (uma falha posterior não é mascarada por um sucesso antigo);
 *   - nenhuma execução ainda ⇒ aguarda um prazo curto (a CI pode não ter começado) e então reprova.
 *
 * Só leitura (`actions: read`). Nenhum segredo além do `GITHUB_TOKEN` do próprio workflow; nada é impresso dele.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ARQUIVO_CI = ".github/workflows/ci.yml";
const SHA_COMPLETO = /^[0-9a-f]{40}$/;

/**
 * Decide a partir da lista de execuções devolvida pela API (`workflow_runs`).
 * @returns {{ estado: "aprovado" | "aguardar" | "reprovado" | "ausente", execucao?: object, motivo: string }}
 */
export function avaliarExecucoes(execucoes, sha) {
  if (!SHA_COMPLETO.test(String(sha))) {
    return {
      estado: "reprovado",
      motivo: `SHA inválido: "${sha}" (esperado SHA completo, 40 hex).`,
    };
  }
  const doCommit = (execucoes ?? [])
    .filter(
      (r) =>
        r?.head_sha === sha &&
        r.event === "push" &&
        r.head_branch === "main" &&
        r.path === ARQUIVO_CI,
    )
    .sort((a, b) => (b.run_number ?? 0) - (a.run_number ?? 0));
  if (doCommit.length === 0) {
    return {
      estado: "ausente",
      motivo: `Nenhuma execução da CI (${ARQUIVO_CI}, push em main) para ${sha}.`,
    };
  }
  const recente = doCommit[0];
  const id = `#${recente.run_number} (id ${recente.id})`;
  if (recente.status !== "completed") {
    return {
      estado: "aguardar",
      execucao: recente,
      motivo: `CI ${id} ainda em andamento (${recente.status}).`,
    };
  }
  if (recente.conclusion === "success") {
    return {
      estado: "aprovado",
      execucao: recente,
      motivo: `CI ${id} concluída com sucesso para ${sha}.`,
    };
  }
  return {
    estado: "reprovado",
    execucao: recente,
    motivo: `CI ${id} do commit ${sha} terminou com "${recente.conclusion}".`,
  };
}

/** Consulta a API do GitHub (só execuções do `ci.yml`, filtradas por SHA, evento e branch). */
export async function buscarExecucoes({ repositorio, sha, token, fetchImpl = fetch }) {
  const url =
    `https://api.github.com/repos/${repositorio}/actions/workflows/ci.yml/runs` +
    `?head_sha=${sha}&event=push&branch=main&per_page=50`;
  const resposta = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!resposta.ok)
    throw new Error(`API do GitHub respondeu ${resposta.status} ao listar as execuções da CI.`);
  return (await resposta.json()).workflow_runs ?? [];
}

/**
 * Espera a decisão: `aguardar` repete até `prazoMs`; `ausente` repete até `prazoAusenteMs` (a CI pode demorar a
 * aparecer logo depois do push). Erros transitórios da API também são repetidos dentro do prazo.
 */
export async function aguardarCiVerde({
  repositorio,
  sha,
  token,
  fetchImpl = fetch,
  agora = () => Date.now(),
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
  intervaloMs = 30_000,
  prazoMs = 40 * 60_000,
  prazoAusenteMs = 10 * 60_000,
  log = console.log,
}) {
  const inicio = agora();
  for (;;) {
    let r;
    try {
      r = avaliarExecucoes(await buscarExecucoes({ repositorio, sha, token, fetchImpl }), sha);
    } catch (erro) {
      r = { estado: "aguardar", motivo: String(erro?.message ?? erro) };
    }
    log(r.motivo);
    if (r.estado === "aprovado" || r.estado === "reprovado") return r;
    const decorrido = agora() - inicio;
    if (r.estado === "ausente" && decorrido >= prazoAusenteMs) {
      return { estado: "reprovado", motivo: `${r.motivo} Prazo de espera esgotado.` };
    }
    if (decorrido >= prazoMs) {
      return { estado: "reprovado", motivo: `${r.motivo} Prazo de espera esgotado.` };
    }
    await dormir(intervaloMs);
  }
}

async function main() {
  const sha = process.argv[2] ?? process.env.GITHUB_SHA;
  const repositorio = process.env.GITHUB_REPOSITORY;
  if (!repositorio) {
    console.log("::error::GITHUB_REPOSITORY não definido.");
    process.exit(1);
  }
  const r = await aguardarCiVerde({ repositorio, sha, token: process.env.GITHUB_TOKEN });
  if (r.estado !== "aprovado") {
    console.log(`::error::Publicação bloqueada: ${r.motivo}`);
    process.exit(1);
  }
  console.log(`Publicação autorizada: ${r.motivo}`);
}

const executadoDiretamente =
  import.meta.main ??
  (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (executadoDiretamente) await main();
