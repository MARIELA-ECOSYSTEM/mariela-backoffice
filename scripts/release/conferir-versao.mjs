/**
 * Fase 22.8.9.9.11 — confere que a tag `vX.Y.Z` corresponde à versão declarada nos arquivos OFICIAIS do aplicativo:
 * `src-tauri/tauri.conf.json` (`version`), `src-tauri/Cargo.toml` (`[package] version`) e `src-tauri/Cargo.lock`
 * (pacote `mariela-backoffice`). O `package.json` não declara a versão do aplicativo e não entra na conferência.
 *
 *   node scripts/release/conferir-versao.mjs v0.1.5
 *
 * Sai com código 1 (e uma mensagem `::error::`) se a tag for inválida ou se qualquer arquivo divergir.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const NOME_DO_PACOTE = "mariela-backoffice";
const SEMVER = /^v(\d+\.\d+\.\d+)$/;

/** `v0.1.5` → `0.1.5`; qualquer outro formato → `null`. */
export function versaoDaTag(tag) {
  return SEMVER.exec(String(tag ?? "").trim())?.[1] ?? null;
}

/** `version` da seção `[package]` do `Cargo.toml` (não a de dependências). */
export function versaoDoCargoToml(conteudo) {
  const secao = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(
    conteudo.replace(/\r\n?/g, "\n"),
  );
  return secao ? (/^version\s*=\s*"([^"]+)"\s*$/m.exec(secao[1])?.[1] ?? null) : null;
}

/** Versão do pacote `nome` no `Cargo.lock` (o bloco `[[package]]` cujo `name` é exatamente esse). */
export function versaoDoCargoLock(conteudo, nome = NOME_DO_PACOTE) {
  for (const bloco of conteudo.replace(/\r\n?/g, "\n").split(/^\[\[package\]\]\s*$/m)) {
    if (/^name\s*=\s*"([^"]+)"\s*$/m.exec(bloco)?.[1] === nome) {
      return /^version\s*=\s*"([^"]+)"\s*$/m.exec(bloco)?.[1] ?? null;
    }
  }
  return null;
}

/**
 * Compara a tag com as versões dos três arquivos. Devolve a lista de divergências (vazia = tudo certo).
 * `arquivos`: `{ tauriConf, cargoToml, cargoLock }` com o CONTEÚDO de cada arquivo.
 */
export function conferirVersao(tag, { tauriConf, cargoToml, cargoLock }) {
  const esperada = versaoDaTag(tag);
  if (!esperada) return [`A tag "${tag}" não está no formato vX.Y.Z.`];
  let versaoTauri = null;
  try {
    versaoTauri = JSON.parse(tauriConf).version ?? null;
  } catch {
    return ["src-tauri/tauri.conf.json não é um JSON válido."];
  }
  const encontradas = {
    "src-tauri/tauri.conf.json": versaoTauri,
    "src-tauri/Cargo.toml": versaoDoCargoToml(cargoToml),
    "src-tauri/Cargo.lock": versaoDoCargoLock(cargoLock),
  };
  return Object.entries(encontradas)
    .filter(([, v]) => v !== esperada)
    .map(([arquivo, v]) =>
      v === null
        ? `${arquivo}: versão não encontrada (esperada ${esperada}).`
        : `${arquivo}: versão ${v}, mas a tag é v${esperada}.`,
    );
}

function main() {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  const raiz = process.cwd();
  const ler = (relativo) => readFileSync(path.join(raiz, relativo), "utf8");
  const erros = conferirVersao(tag, {
    tauriConf: ler("src-tauri/tauri.conf.json"),
    cargoToml: ler("src-tauri/Cargo.toml"),
    cargoLock: ler("src-tauri/Cargo.lock"),
  });
  if (erros.length > 0) {
    for (const e of erros) console.log(`::error::${e}`);
    console.log(
      "Atualize a versão em src-tauri/tauri.conf.json, src-tauri/Cargo.toml e src-tauri/Cargo.lock e crie a tag de novo.",
    );
    process.exit(1);
  }
  console.log(`Tag ${tag}: versão ${versaoDaTag(tag)} confere nos três arquivos oficiais.`);
}

const executadoDiretamente =
  import.meta.main ??
  (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (executadoDiretamente) main();
