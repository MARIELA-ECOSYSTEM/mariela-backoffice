// O Tauri é apenas a casca desktop do frontend React.
// Nenhuma lógica de negócio, banco de dados ou API vive aqui:
// os dados oficiais vêm da API remota configurada em VITE_API_URL.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar a aplicação MARIELA Backoffice");
}
