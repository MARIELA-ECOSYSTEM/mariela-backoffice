//! Fase 22.8.8.7 (M7) — testes das travas de build (`build_ambiente.rs`) com os arquivos REAIS de configuração.
//! Complementam os testes negativos de compilação (o `build.rs` executado de verdade pelo cargo/CLI).

use crate::build_ambiente::{
    arquivos_automaticos_presentes, configuracao_efetiva, mesclar, verificar,
};
use crate::identidades::{ISOLADO, OFICIAL};
use serde_json::{json, Value};

fn ler(nome: &str) -> String {
    std::fs::read_to_string(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(nome))
        .expect(nome)
}
fn oficial() -> Value {
    configuracao_efetiva(&ler("tauri.conf.json"), None).unwrap()
}
fn isolada() -> Value {
    configuracao_efetiva(
        &ler("tauri.conf.json"),
        Some(&ler("tauri.isolado.conf.json")),
    )
    .unwrap()
}

#[test]
fn producao_compila_em_release_e_debug_sem_a_feature() {
    assert_eq!(verificar(false, false, &oficial()), Ok(()));
    assert_eq!(verificar(false, true, &oficial()), Ok(())); // `cargo check/test`; o `tauri dev` é barrado em `run`
}

#[test]
fn isolado_compila_somente_com_feature_configuracao_e_debug() {
    assert_eq!(verificar(true, true, &isolada()), Ok(()));
}

#[test]
fn feature_sem_configuracao_isolada_falha() {
    let erro = verificar(true, true, &oficial()).unwrap_err();
    assert!(erro.contains("sem a configuração isolada"), "{erro}");
}

#[test]
fn configuracao_isolada_sem_feature_falha() {
    for depuracao in [true, false] {
        let erro = verificar(false, depuracao, &isolada()).unwrap_err();
        assert!(erro.contains("sem a feature"), "{erro}");
    }
}

#[test]
fn feature_em_perfil_release_falha_mesmo_com_a_configuracao_isolada() {
    let erro = verificar(true, false, &isolada()).unwrap_err();
    assert!(erro.contains("perfil release"), "{erro}");
}

#[test]
fn bundle_do_ambiente_isolado_precisa_estar_desabilitado() {
    let mut sem_bundle = isolada();
    sem_bundle["bundle"]["active"] = json!(true);
    assert!(verificar(true, true, &sem_bundle).is_err());
    sem_bundle["bundle"]
        .as_object_mut()
        .unwrap()
        .remove("active");
    assert!(verificar(true, true, &sem_bundle).is_err());
}

#[test]
fn redefinir_o_diretorio_de_dados_falha_nos_dois_ambientes() {
    for (isolado, base) in [(false, oficial()), (true, isolada())] {
        for patch in [
            json!({ "app": { "appDirectoriesOverride": "./app-data" } }),
            json!({ "app": { "app-directories-override": { "localData": "$TEMP/x" } } }),
            json!({ "app": { "windows": [{ "label": "main", "dataDirectory": "x" }] } }),
            json!({ "app": { "windows": [{ "label": "main", "data-directory": "x" }] } }),
        ] {
            let mut efetiva = base.clone();
            mesclar(&mut efetiva, &patch);
            assert!(verificar(isolado, true, &efetiva).is_err(), "{patch}");
        }
    }
}

#[test]
fn configuracao_isolada_efetiva_tem_exatamente_a_identidade_e_a_janela_esperadas() {
    let efetiva = isolada();
    assert_eq!(efetiva["identifier"], json!(ISOLADO.identifier));
    assert_eq!(efetiva["bundle"]["active"], json!(false));
    let janelas = efetiva["app"]["windows"].as_array().unwrap();
    assert_eq!(janelas.len(), 1);
    assert_eq!(janelas[0]["label"], json!("main"));
    assert!(janelas[0]["title"]
        .as_str()
        .unwrap()
        .starts_with("[ISOLADO – TESTE]"));
    // A política de segurança (CSP) é herdada da oficial, sem alteração.
    assert_eq!(efetiva["app"]["security"], oficial()["app"]["security"]);
}

#[test]
fn configuracao_isolada_so_toca_identidade_janela_e_empacotamento() {
    let patch: Value = serde_json::from_str(&ler("tauri.isolado.conf.json")).unwrap();
    let mut chaves: Vec<&str> = patch
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    chaves.sort_unstable();
    assert_eq!(chaves, ["app", "bundle", "identifier"]);
    let app: Vec<&str> = patch["app"]
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(app, ["windows"]); // nada de security, withGlobalTauri, diretórios…
    let texto = ler("tauri.isolado.conf.json");
    for proibido in [
        "http://",
        "https://",
        "remote",
        "permissions",
        "capabilities",
    ] {
        assert!(!texto.contains(proibido), "{proibido}");
    }
}

#[test]
fn configuracao_oficial_permanece_intacta() {
    let efetiva = oficial();
    assert_eq!(efetiva["identifier"], json!(OFICIAL.identifier));
    assert_eq!(efetiva["productName"], json!("MARIELA Backoffice"));
    assert_eq!(efetiva["bundle"]["active"], json!(true));
    assert_eq!(
        efetiva["app"]["windows"][0]["title"],
        json!("MARIELA Backoffice")
    );
    assert!(efetiva["app"].get("appDirectoriesOverride").is_none());
    assert!(efetiva["app"]["windows"][0].get("dataDirectory").is_none());
    assert_eq!(
        efetiva["build"]["beforeBuildCommand"],
        json!("bun run build:desktop")
    );
}

#[test]
fn nenhum_arquivo_de_configuracao_automatico_existe() {
    let raiz = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    assert!(arquivos_automaticos_presentes(|n| raiz.join(n).exists()).is_empty());
    // A configuração isolada não tem nome de arquivo mesclado automaticamente.
    assert_eq!(
        arquivos_automaticos_presentes(|n| n == "tauri.isolado.conf.json"),
        Vec::<&str>::new()
    );
    assert_eq!(
        arquivos_automaticos_presentes(|n| n == "tauri.windows.conf.json"),
        ["tauri.windows.conf.json"]
    );
}

#[test]
fn mescla_segue_a_rfc_7386() {
    let mut alvo = json!({ "a": 1, "b": { "c": 2, "d": 3 }, "l": [1, 2] });
    mesclar(
        &mut alvo,
        &json!({ "a": null, "b": { "c": 9 }, "l": [7], "n": "x" }),
    );
    assert_eq!(alvo, json!({ "b": { "c": 9, "d": 3 }, "l": [7], "n": "x" }));
}

#[test]
fn tauri_config_invalido_falha() {
    assert!(configuracao_efetiva(&ler("tauri.conf.json"), Some("{nao json")).is_err());
}
