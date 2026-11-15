fn main() {
    // Fase 22.8.8.2 (M2) — declara os comandos do app no manifesto de ACL do Tauri 2. Com isso, eles passam a exigir
    // permissão EXPLÍCITA numa capability (geradas como `allow-sessao-carregar` etc.); nenhuma janela os acessa por
    // padrão. A permissão é concedida só à janela `main`, em `capabilities/sessao.json`.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "sessao_carregar",
            "sessao_gravar",
            "sessao_apagar",
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
