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
// Fase 22.8.9.9.3 — confirmações de upload de mídia pendentes (armazenamento durável SEPARADO de `operacoes.rs`;
// `capabilities/confirmacoes-midia.json`).
mod confirmacoes_midia;
mod identidades;
// Fase 22.8.8.8.2 (M8.2) — injetor de falhas do cofre: SOMENTE no ambiente isolado (inexistente no build oficial).
#[cfg(feature = "ambiente-isolado")]
mod injetor_falhas;
mod instancia;
// Fase 22.8.9.5 — registro DURÁVEL das operações incertas de cancelamento/devolução (dados operacionais, separados da
// sessão; `capabilities/operacoes.json`).
mod operacoes;
mod sessao;

use tauri::Manager;

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
        // Fase 22.8.9.5 — o diretório vem do `identifier` da configuração compilada; só vale se for o da identidade
        // deste binário (`operacoes::diretorio_para`). Sem ele, os comandos respondem `INDISPONIVEL`.
        .setup(|app| {
            let dados = app.path().app_local_data_dir().ok();
            app.manage(operacoes::ServicoOperacoes::novo(
                dados.clone(),
                ambiente::ATUAL.identifier,
            ));
            app.manage(confirmacoes_midia::ServicoConfirmacoesMidia::novo(
                dados,
                ambiente::ATUAL.identifier,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sessao::sessao_carregar,
            sessao::sessao_gravar,
            sessao::sessao_apagar,
            operacoes::operacao_ler,
            operacoes::operacao_gravar,
            operacoes::operacao_remover,
            confirmacoes_midia::midia_confirmacao_listar,
            confirmacoes_midia::midia_confirmacao_gravar,
            confirmacoes_midia::midia_confirmacao_remover
        ])
        .run(contexto)
        .expect("erro ao iniciar a aplicação MARIELA Backoffice");
}
