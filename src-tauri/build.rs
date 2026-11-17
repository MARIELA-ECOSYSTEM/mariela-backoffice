// Fase 22.8.8.7 (M7) — as identidades e as travas de build são compartilhadas com o crate, pelo caminho.
#[path = "build_ambiente.rs"]
mod build_ambiente;
#[path = "src/identidades.rs"]
#[allow(dead_code)]
mod identidades;

fn main() {
    // Fase 22.8.8.7 (M7) — PRIMEIRO, antes de qualquer outra etapa do build: feature, perfil e identidade efetiva
    // precisam corresponder. Qualquer divergência interrompe o build (nunca segue com a identidade oficial).
    verificar_ambiente();

    // Fase 22.8.8.2 (M2) — declara os comandos do app no manifesto de ACL do Tauri 2. Com isso, eles passam a exigir
    // permissão EXPLÍCITA numa capability (geradas como `allow-sessao-carregar` etc.); nenhuma janela os acessa por
    // padrão. A permissão é concedida só à janela `main`, em `capabilities/sessao.json`.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "sessao_carregar",
            "sessao_gravar",
            "sessao_apagar",
            // Fase 22.8.9.5 — operações incertas de cancelamento/devolução (`capabilities/operacoes.json`).
            "operacao_ler",
            "operacao_gravar",
            "operacao_remover",
        ]),
    ))
    .expect("falha ao executar o tauri-build");

    // Fase 22.8.8.5 (M5) — SOMENTE executáveis de teste de integração (`tests/`): o `tauri-build` embute o manifesto
    // do aplicativo (que declara Common Controls v6) apenas no binário do app. O harness de ACL (`tests/acl.rs`) liga o
    // runtime de testes do Tauri, que importa `TaskDialogIndirect` (só existe no comctl32 v6); sem a dependência no
    // manifesto, o executável de teste não carrega (STATUS_ENTRYPOINT_NOT_FOUND). Não afeta o binário de produção nem
    // a ACL.
    let alvo_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if alvo_msvc {
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
        );
    }
}

/// Recalcula a configuração efetiva (`tauri.conf.json` + `TAURI_CONFIG`, como o `tauri-build`/`tauri-codegen`) e
/// aplica as regras de `build_ambiente.rs`. Falha com mensagem clara; nunca imprime variáveis de ambiente.
fn verificar_ambiente() {
    println!("cargo:rerun-if-env-changed=TAURI_CONFIG");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=build_ambiente.rs");
    println!("cargo:rerun-if-changed=src/identidades.rs");

    let raiz =
        std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let presentes = build_ambiente::arquivos_automaticos_presentes(|nome| raiz.join(nome).exists());
    if !presentes.is_empty() {
        panic!(
            "\n\nAMBIENTE INVÁLIDO: arquivo(s) de configuração do Tauri que seriam lidos/mesclados automaticamente: \
             {presentes:?}. A identidade precisa ser explícita (tauri.conf.json + --config).\n"
        );
    }

    let isolado = std::env::var_os("CARGO_FEATURE_AMBIENTE_ISOLADO").is_some();
    let depuracao = std::env::var_os("CARGO_CFG_DEBUG_ASSERTIONS").is_some();
    let base = std::fs::read_to_string(raiz.join("tauri.conf.json")).expect("tauri.conf.json");
    let tauri_config = std::env::var("TAURI_CONFIG").ok();

    let resultado = build_ambiente::configuracao_efetiva(&base, tauri_config.as_deref())
        .and_then(|efetiva| build_ambiente::verificar(isolado, depuracao, &efetiva));
    if let Err(motivo) = resultado {
        panic!("\n\nAMBIENTE INVÁLIDO: {motivo}\n");
    }
}
