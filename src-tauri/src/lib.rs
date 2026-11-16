// O Tauri é apenas a casca desktop do frontend React.
// Nenhuma lógica de negócio, banco de dados ou API vive aqui:
// os dados oficiais vêm da API remota configurada em VITE_API_URL.
//
// Fase 22.8.8.2 (M2) — única exceção: o armazenamento da sessão administrativa no Windows Credential Manager
// (`cofre.rs` + `sessao.rs`), exposto por três comandos restritos à janela `main` (`capabilities/sessao.json`).
// Fase 22.8.8.4 (M4) — o frontend passa a usá-los (`src/services/auth/sessao-nativa.ts`), e o app só inicia como
// INSTÂNCIA ÚNICA (`instancia.rs`): duas instâncias nunca concorrem pela mesma sessão.
// Fase 22.8.8.7 (M7) — identidade por ambiente (`ambiente.rs`): oficial por padrão; ISOLADA só com a feature
// `ambiente-isolado` (desenvolvimento), validada antes de qualquer outra coisa.
mod ambiente;
mod cofre;
mod identidades;
mod instancia;
mod sessao;

// Fase 22.8.8.7 (M7) — testes das travas de build (o mesmo código que o `build.rs` executa).
#[cfg(test)]
#[path = "../build_ambiente.rs"]
mod build_ambiente;
#[cfg(test)]
mod testes_build_ambiente;

pub fn run() {
    // 1º — a identidade compilada (configuração efetiva do Tauri) precisa corresponder à deste binário, ANTES do
    // mutex, de janelas, estados e comandos. Inclui o bloqueio do `tauri dev` comum (debug com identidade oficial).
    let contexto = tauri::generate_context!();
    if let Err(erro) = ambiente::validar(contexto.config()) {
        instancia::avisar_texto(erro.mensagem());
        return;
    }

    // 2º — instância única. A guarda vive até o fim de `run` (o processo).
    let _instancia = match instancia::adquirir(instancia::NOME_MUTEX) {
        Ok(guarda) => guarda,
        Err(erro) => {
            instancia::avisar(erro);
            return;
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sessao::ServicoSessao::nativo())
        .invoke_handler(tauri::generate_handler![
            sessao::sessao_carregar,
            sessao::sessao_gravar,
            sessao::sessao_apagar
        ])
        .run(contexto)
        .expect("erro ao iniciar a aplicação MARIELA Backoffice");
}
