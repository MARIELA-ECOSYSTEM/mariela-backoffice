//! Fase 22.8.8.5 (M5) — validação da ACL do Tauri para os comandos de sessão (SOMENTE testes; nada daqui entra no
//! binário de produção).
//!
//! Duas camadas de evidência:
//! 1. **Configuração** — as capabilities em disco e o manifesto de ACL gerado pelo `tauri-build` concedem os três
//!    comandos só à janela `main`, só a conteúdo local, sem permissão padrão implícita.
//! 2. **Resolução em execução** — um app com o runtime de testes do Tauri (`tauri::test::mock_builder`) e o contexto
//!    REAL do projeto (`generate_context!`: mesma configuração e mesma ACL resolvida que o binário embute). As
//!    invocações passam pelo mesmo `Webview::on_message` que verifica a autoridade em produção.
//!
//! O serviço de sessão usa um cofre EM MEMÓRIA: o harness nunca toca o Windows Credential Manager. A janela extra
//! (`intrusa`) existe só no runtime de testes — nenhuma janela de produção é criada ou alterada.
//!
//! É um teste de INTEGRAÇÃO (executável próprio) por dois motivos: o runtime de testes do Tauri importa
//! `TaskDialogIndirect` (Common Controls v6), e só alvos de teste de integração recebem o manifesto correspondente
//! (`build.rs`, `rustc-link-arg-tests`); e o executável dos testes unitários da lib continua intacto. Os módulos de
//! produção `sessao.rs` e `cofre.rs` são incluídos pelo CAMINHO — o código testado é exatamente o dos comandos reais,
//! sem tornar nada público na lib.

// Fase 22.8.8.7 (M7) — `cofre.rs` usa a identidade do binário (`ambiente.rs` → `identidades.rs`).
#[allow(dead_code)]
#[path = "../src/ambiente.rs"]
mod ambiente;
#[allow(dead_code)]
#[path = "../src/cofre.rs"]
mod cofre;
#[allow(dead_code)]
#[path = "../src/identidades.rs"]
mod identidades;
#[allow(dead_code)]
#[path = "../src/sessao.rs"]
mod sessao;

use cofre::{Cofre, FalhaCofre};
use serde_json::{json, Value};
use sessao::{testes_comuns::conteudo_valido, ServicoSessao};
use std::sync::Mutex;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const COMANDOS: [&str; 3] = ["sessao_carregar", "sessao_gravar", "sessao_apagar"];
const PERMISSOES: [&str; 3] = [
    "allow-sessao-carregar",
    "allow-sessao-gravar",
    "allow-sessao-apagar",
];

/// Origem do conteúdo local empacotado no Windows (a mesma que o Tauri usa para `'self'`).
const URL_LOCAL: &str = "http://tauri.localhost/";
const URL_REMOTA: &str = "https://exemplo.invalid/";

struct CofreMemoria(Mutex<Option<Vec<u8>>>);

impl Cofre for CofreMemoria {
    fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn gravar(&self, conteudo: &[u8]) -> Result<(), FalhaCofre> {
        *self.0.lock().unwrap() = Some(conteudo.to_vec());
        Ok(())
    }
    fn apagar(&self) -> Result<(), FalhaCofre> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

/// Configuração REAL compilada (tauri.conf.json + TAURI_CONFIG), intocada — para as asserções de configuração.
fn contexto_real() -> tauri::Context<MockRuntime> {
    tauri::generate_context!()
}

/// Diretório de dados do WebView dos testes: dentro de `target` (Fase 22.8.8.7, M7). Ao criar uma janela sem
/// `data_directory`, o Tauri cria `%LOCALAPPDATA%\<identifier>` (`manager/webview.rs`) — o diretório REAL do app
/// instalado (ou do isolado). Os testes nunca devem tocá-lo.
fn diretorio_de_dados_de_teste() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_TARGET_TMPDIR")).join("acl-webview")
}

/// Mesmo registro de `lib.rs::run` (estado + os três comandos), com a ACL real e o cofre em memória. As janelas da
/// configuração NÃO são criadas automaticamente (criariam o diretório de dados real); `janela` as cria com o
/// diretório de teste. A ACL resolvida (capabilities da janela `main`) é a mesma do contexto real.
fn app() -> App<MockRuntime> {
    let mut contexto = contexto_real();
    contexto.config_mut().app.windows.clear();
    mock_builder()
        .manage(ServicoSessao::com_cofre(Box::new(CofreMemoria(
            Mutex::new(None),
        ))))
        .invoke_handler(tauri::generate_handler![
            sessao::sessao_carregar,
            sessao::sessao_gravar,
            sessao::sessao_apagar
        ])
        .build(contexto)
        .expect("app de teste")
}

fn janela(app: &App<MockRuntime>, rotulo: &str) -> WebviewWindow<MockRuntime> {
    app.get_webview_window(rotulo).unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, rotulo, WebviewUrl::default())
            .data_directory(diretorio_de_dados_de_teste())
            .build()
            .expect("janela de teste")
    })
}

fn invocar(
    janela: &WebviewWindow<MockRuntime>,
    comando: &str,
    url: &str,
    corpo: Value,
) -> Result<Value, Value> {
    get_ipc_response(
        janela,
        InvokeRequest {
            cmd: comando.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: url.parse().unwrap(),
            body: InvokeBody::Json(corpo),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|r| r.deserialize::<Value>().unwrap_or(Value::Null))
}

fn corpo(comando: &str, seq: u64) -> Value {
    match comando {
        "sessao_gravar" => json!({ "conteudo": conteudo_valido(), "seq": seq }),
        "sessao_apagar" => json!({ "seq": seq }),
        _ => json!({}),
    }
}

/// Recusa da ACL: erro do Tauri ("not allowed"), nunca um código do serviço — prova que o comando NÃO executou.
fn assert_recusado_pela_acl(resultado: Result<Value, Value>, contexto: &str) {
    let erro = resultado.expect_err(contexto);
    let texto = erro.to_string();
    assert!(
        texto.contains("not allowed"),
        "{contexto}: esperado erro de ACL, veio {texto}"
    );
    for codigo in [
        "COFRE_INDISPONIVEL",
        "FORMATO_INVALIDO",
        "GRAVACAO_OBSOLETA",
        "TAMANHO_EXCEDIDO",
    ] {
        assert!(!texto.contains(codigo), "{contexto}: o comando executou");
    }
}

// ─── Resolução em execução ───────────────────────────────────────────────────────────────────────────────────────

#[test]
fn janela_main_com_conteudo_local_executa_os_tres_comandos() {
    let app = app();
    let main = janela(&app, "main");
    let vazio = invocar(&main, "sessao_carregar", URL_LOCAL, json!({})).expect("carregar");
    assert_eq!(vazio, json!({ "conteudo": null, "seq": 0 }));
    invocar(&main, "sessao_gravar", URL_LOCAL, corpo("sessao_gravar", 1)).expect("gravar");
    let lido = invocar(&main, "sessao_carregar", URL_LOCAL, json!({})).expect("carregar");
    assert_eq!(lido, json!({ "conteudo": conteudo_valido(), "seq": 1 }));
    invocar(&main, "sessao_apagar", URL_LOCAL, corpo("sessao_apagar", 2)).expect("apagar");
    let apagado = invocar(&main, "sessao_carregar", URL_LOCAL, json!({})).expect("carregar");
    assert_eq!(apagado, json!({ "conteudo": null, "seq": 2 }));
}

#[test]
fn outra_janela_nao_executa_nenhum_comando_de_sessao() {
    let app = app();
    let main = janela(&app, "main");
    let intrusa = janela(&app, "intrusa");
    for (i, comando) in COMANDOS.iter().enumerate() {
        assert_recusado_pela_acl(
            invocar(&intrusa, comando, URL_LOCAL, corpo(comando, 10 + i as u64)),
            &format!("janela 'intrusa' → {comando}"),
        );
    }
    // Nada executou: nem gravação, nem consumo de `seq`.
    let estado = invocar(&main, "sessao_carregar", URL_LOCAL, json!({})).expect("carregar");
    assert_eq!(estado, json!({ "conteudo": null, "seq": 0 }));
}

#[test]
fn conteudo_remoto_na_janela_main_nao_executa_nenhum_comando_de_sessao() {
    let app = app();
    let main = janela(&app, "main");
    for (i, comando) in COMANDOS.iter().enumerate() {
        assert_recusado_pela_acl(
            invocar(&main, comando, URL_REMOTA, corpo(comando, 10 + i as u64)),
            &format!("origem remota → {comando}"),
        );
    }
    let estado = invocar(&main, "sessao_carregar", URL_LOCAL, json!({})).expect("carregar");
    assert_eq!(estado, json!({ "conteudo": null, "seq": 0 }));
}

// ─── Configuração ────────────────────────────────────────────────────────────────────────────────────────────────

fn json_do_projeto(caminho: &str) -> Value {
    let completo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(caminho);
    serde_json::from_str(&std::fs::read_to_string(&completo).expect(caminho)).expect(caminho)
}

fn identificadores(capability: &Value) -> Vec<String> {
    capability["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| {
            p.as_str()
                .or_else(|| p["identifier"].as_str())
                .unwrap()
                .to_string()
        })
        .collect()
}

#[test]
fn capabilities_concedem_a_sessao_so_a_janela_main_e_so_localmente() {
    let mut com_sessao = Vec::new();
    for arquivo in ["default.json", "desktop.json", "sessao.json"] {
        let cap = json_do_projeto(&format!("capabilities/{arquivo}"));
        // Nenhuma capability usa curinga de janela/webview nem libera conteúdo remoto.
        assert_eq!(cap["windows"], json!(["main"]), "{arquivo}: janelas");
        assert!(cap.get("webviews").is_none(), "{arquivo}: webviews");
        assert!(cap.get("remote").is_none(), "{arquivo}: remote");
        let ids = identificadores(&cap);
        if ids.iter().any(|id| id.contains("sessao")) {
            com_sessao.push(arquivo);
            assert_eq!(ids, PERMISSOES, "{arquivo}: exatamente as três permissões");
        }
    }
    assert_eq!(com_sessao, ["sessao.json"]);

    // O que o build embute (capabilities resolvidas pelo tauri-build) é o mesmo conjunto.
    let geradas = json_do_projeto("gen/schemas/capabilities.json");
    let geradas = geradas.as_object().unwrap();
    assert_eq!(geradas.len(), 3);
    for (id, cap) in geradas {
        assert_eq!(cap["windows"], json!(["main"]), "{id}");
        assert_eq!(cap["local"], json!(true), "{id}");
        assert!(cap.get("remote").is_none(), "{id}");
    }
    assert_eq!(identificadores(&geradas["sessao-nativa"]), PERMISSOES);
}

#[test]
fn manifesto_do_app_nao_tem_permissao_padrao_e_mapeia_um_comando_por_permissao() {
    let manifesto = json_do_projeto("gen/schemas/acl-manifests.json");
    let app = &manifesto["__app-acl__"];
    assert!(
        app["default_permission"].is_null(),
        "nenhuma concessão implícita"
    );
    for (permissao, comando) in PERMISSOES.iter().zip(COMANDOS) {
        let p = &app["permissions"][*permissao]["commands"];
        assert_eq!(p["allow"], json!([comando]), "{permissao}");
        assert_eq!(p["deny"], json!([]), "{permissao}");
    }
}

// ─── Fase 22.8.8.7 (M7): identidade da configuração REALMENTE compilada ──────────────────────────────────────────

#[test]
fn configuracao_compilada_corresponde_a_identidade_do_binario() {
    // `generate_context!` = tauri.conf.json + TAURI_CONFIG (o mesmo cálculo do `build.rs`). Sem criar app/janelas.
    let contexto = contexto_real();
    let config = contexto.config();
    assert_eq!(config.identifier, ambiente::ATUAL.identifier);
    assert!(config.app.app_directories_override.is_none());
    assert!(config
        .app
        .windows
        .iter()
        .all(|j| j.data_directory.is_none()));
    assert!(config.app.windows.iter().any(|j| j.label == "main"));
    let resultado = ambiente::validar(config);
    if ambiente::ISOLADO_ATIVO {
        assert_eq!(resultado, Ok(()));
        assert!(!config.bundle.active, "ambiente isolado sem empacotamento");
        assert!(config.app.windows[0].title.starts_with("[ISOLADO – TESTE]"));
    } else {
        // Executáveis de teste têm debug_assertions: oficial + debug é exatamente o `tauri dev` comum, bloqueado.
        assert_eq!(
            resultado,
            Err(ambiente::ErroAmbiente::DesenvolvimentoComIdentidadeOficial)
        );
        assert!(config.bundle.active);
    }
}

#[test]
fn diretorio_de_dados_do_webview2_deriva_do_identifier_do_ambiente() {
    // O Tauri 2.12.5 força, no Windows, `data_directory = app_local_data_dir()` (`manager/webview.rs`), que é
    // `%LOCALAPPDATA%\<identifier>` (`path/desktop.rs`) quando não há `appDirectoriesOverride`. Só RESOLVE o caminho:
    // nada é criado, lido ou listado.
    let app = app();
    let dir = app
        .path()
        .app_local_data_dir()
        .expect("diretório de dados local");
    assert_eq!(
        dir.file_name().and_then(|n| n.to_str()),
        Some(ambiente::ATUAL.identifier)
    );
    if ambiente::ISOLADO_ATIVO {
        assert_ne!(
            dir.file_name().and_then(|n| n.to_str()),
            Some(ambiente::OFICIAL.identifier)
        );
    }
}

#[test]
fn harness_nao_cria_janelas_automaticas_com_o_diretorio_de_dados_real() {
    // As janelas do harness são criadas só por `janela`, sempre com o diretório de teste (dentro de `target`).
    let app = app();
    assert!(
        app.webview_windows().is_empty(),
        "nenhuma janela automática"
    );
    janela(&app, "main");
    assert!(diretorio_de_dados_de_teste().exists());
}
