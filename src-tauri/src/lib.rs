// O Tauri é apenas a casca desktop do frontend React.
// Nenhuma lógica de negócio, banco de dados ou API vive aqui:
// os dados oficiais vêm da API remota configurada em VITE_API_URL.
//
// Fase 22.8.8.2 (M2) — única exceção: o armazenamento da sessão administrativa no Windows Credential Manager
// (`cofre.rs` + `sessao.rs`), exposto por três comandos restritos à janela `main` (`capabilities/sessao.json`).
// Nesta fase o frontend ainda não os usa.
mod cofre;
mod sessao;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sessao::ServicoSessao::nativo())
        .invoke_handler(tauri::generate_handler![
            sessao::sessao_carregar,
            sessao::sessao_gravar,
            sessao::sessao_apagar
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação MARIELA Backoffice");
}
