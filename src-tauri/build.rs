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
}
