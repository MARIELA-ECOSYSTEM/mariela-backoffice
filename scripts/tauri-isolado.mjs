/**
 * Fase 22.8.8.7 (M7) — executa o Backoffice desktop no AMBIENTE ISOLADO de desenvolvimento.
 *
 *   bun run tauri:isolado        (a partir da raiz de um clone LIMPO, sem arquivos .env*)
 *
 * O que garante:
 *   1. Recusa iniciar se houver qualquer arquivo `.env*` na raiz (exceto o modelo versionado `.env.example`). Só os
 *      NOMES dos arquivos são verificados — o conteúdo nunca é lido.
 *   2. Nenhuma variável `VITE_*` herdada do terminal chega ao frontend; define `VITE_USE_MOCK_API=true` (Mock API
 *      obrigatória). Nenhuma URL de backend é definida.
 *   3. Sempre `tauri dev` (perfil debug, sem instalador) com a configuração isolada (`--config`) e a feature
 *      `ambiente-isolado`. Não aceita argumentos extras (ex.: `--release`).
 *
 * As travas do Rust (`src-tauri/build.rs` e `src-tauri/src/ambiente.rs`) continuam valendo por conta própria: este
 * script é a forma CORRETA de iniciar, não a única proteção.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const CONFIG_ISOLADA = "src-tauri/tauri.isolado.conf.json";
export const FEATURE_ISOLADA = "ambiente-isolado";
/** Único arquivo `.env*` tolerado: o modelo versionado, que o Vite não carrega. */
const ENV_PERMITIDOS = new Set([".env.example"]);

/** Arquivos `.env*` que impedem a execução (o Vite carregaria `.env`, `.env.local`, `.env.<modo>`…). */
export function arquivosEnvProibidos(nomes) {
  return nomes
    .filter((nome) => nome.toLowerCase().startsWith(".env") && !ENV_PERMITIDOS.has(nome))
    .sort();
}

/** Ambiente do processo do Tauri/Vite: sem nenhuma `VITE_*` herdada, sem `TAURI_CONFIG` herdado, Mock API ligada. */
export function ambienteDoProcesso(base) {
  const env = {};
  for (const [chave, valor] of Object.entries(base)) {
    const k = chave.toUpperCase();
    if (k.startsWith("VITE_") || k === "TAURI_CONFIG") continue;
    env[chave] = valor;
  }
  env.VITE_USE_MOCK_API = "true";
  return env;
}

/** Argumentos do CLI: sempre `dev` (debug, nunca empacota), configuração isolada e a feature. */
export function argumentosTauri() {
  return ["run", "tauri", "dev", "--config", CONFIG_ISOLADA, "--features", FEATURE_ISOLADA];
}

function recusar(motivo) {
  console.error(`\n[tauri:isolado] RECUSADO: ${motivo}\n`);
  process.exit(1);
}

function main() {
  if (process.argv.length > 2) {
    recusar(
      "este comando não aceita argumentos (o ambiente isolado é sempre `tauri dev` em perfil debug).",
    );
  }
  const raiz = process.cwd();
  if (
    !existsSync(path.join(raiz, "package.json")) ||
    !existsSync(path.join(raiz, CONFIG_ISOLADA))
  ) {
    recusar(`execute a partir da raiz do mariela-backoffice (não encontrei ${CONFIG_ISOLADA}).`);
  }
  const proibidos = arquivosEnvProibidos(readdirSync(raiz));
  if (proibidos.length > 0) {
    recusar(
      `arquivo(s) de ambiente na raiz: ${proibidos.join(", ")}. O ambiente isolado roda só a partir de um ` +
        "clone limpo, sem .env (eles nunca são lidos nem copiados).",
    );
  }
  console.log(
    "[tauri:isolado] Ambiente ISOLADO: identidade com.mariela.backoffice.isolado, Mock API, sem instalador.",
  );
  const filho = spawn("bun", argumentosTauri(), {
    cwd: raiz,
    env: ambienteDoProcesso(process.env),
    stdio: "inherit",
  });
  filho.on("exit", (codigo) => process.exit(codigo ?? 1));
  filho.on("error", () => recusar("não foi possível iniciar o Tauri CLI (`bun run tauri`)."));
}

const executadoDiretamente =
  import.meta.main ??
  (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (executadoDiretamente) main();
