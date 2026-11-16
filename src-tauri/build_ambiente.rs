//! Fase 22.8.8.7 (M7) — travas de BUILD do ambiente (incluído pelo caminho em `build.rs` e nos testes da lib).
//!
//! Recalcula a configuração EFETIVA do Tauri exatamente como o `tauri-build` 2.7.4 e o `tauri-codegen` 2.7.4 fazem
//! (`tauri.conf.json` + JSON Merge Patch (RFC 7386) do conteúdo da variável `TAURI_CONFIG`, que o CLI preenche com o
//! `--config`) e recusa o build quando feature, perfil e identidade não correspondem. Não lê nenhum `.env`.

use serde_json::Value;

/// Arquivos que o Tauri leria ou mesclaria AUTOMATICAMENTE (sem `--config`): a configuração isolada nunca pode ter
/// um desses nomes, e a existência de qualquer um deles impede o build (a identidade deixaria de ser explícita).
pub const ARQUIVOS_AUTOMATICOS_PROIBIDOS: [&str; 11] = [
    "tauri.conf.json5",
    "Tauri.toml",
    "tauri.windows.conf.json",
    "tauri.windows.conf.json5",
    "Tauri.windows.toml",
    "tauri.macos.conf.json",
    "tauri.macos.conf.json5",
    "Tauri.macos.toml",
    "tauri.linux.conf.json",
    "tauri.linux.conf.json5",
    "Tauri.linux.toml",
];

/// JSON Merge Patch (RFC 7386) — mesma semântica do crate `json-patch` usado pelo Tauri: objetos são mesclados
/// recursivamente, `null` remove a chave, qualquer outro valor (inclusive arrays) substitui.
pub fn mesclar(alvo: &mut Value, patch: &Value) {
    if let Value::Object(campos) = patch {
        if !alvo.is_object() {
            *alvo = Value::Object(Default::default());
        }
        let objeto = alvo.as_object_mut().expect("objeto");
        for (chave, valor) in campos {
            if valor.is_null() {
                objeto.remove(chave);
            } else {
                mesclar(objeto.entry(chave.clone()).or_insert(Value::Null), valor);
            }
        }
    } else {
        *alvo = patch.clone();
    }
}

/// Configuração efetiva: base (`tauri.conf.json`) + `TAURI_CONFIG` (JSON inline, como no Tauri).
pub fn configuracao_efetiva(base: &str, tauri_config: Option<&str>) -> Result<Value, String> {
    let mut efetiva: Value =
        serde_json::from_str(base).map_err(|e| format!("tauri.conf.json inválido: {e}"))?;
    if let Some(inline) = tauri_config {
        let patch: Value = serde_json::from_str(inline)
            .map_err(|e| format!("TAURI_CONFIG não é um JSON válido: {e}"))?;
        mesclar(&mut efetiva, &patch);
    }
    Ok(efetiva)
}

fn definido(objeto: &Value, chaves: &[&str]) -> bool {
    chaves
        .iter()
        .any(|c| objeto.get(*c).is_some_and(|v| !v.is_null()))
}

/// Regras de build. `isolado` = feature `ambiente-isolado`; `depuracao` = `debug_assertions` do alvo.
pub fn verificar(isolado: bool, depuracao: bool, efetiva: &Value) -> Result<(), String> {
    use crate::identidades::{ISOLADO, OFICIAL};

    if isolado && !depuracao {
        return Err("a feature `ambiente-isolado` é exclusiva de desenvolvimento: não pode ser compilada em perfil \
             release (sem debug_assertions)"
            .into());
    }

    let identifier = efetiva
        .get("identifier")
        .and_then(Value::as_str)
        .unwrap_or("");
    match (isolado, identifier) {
        (true, id) if id == ISOLADO.identifier => {}
        (false, id) if id == OFICIAL.identifier => {}
        (true, _) => {
            return Err(format!(
                "feature `ambiente-isolado` ativa sem a configuração isolada (identifier efetivo `{identifier}`; \
                 esperado `{}`). Use: bun run tauri:isolado",
                ISOLADO.identifier
            ))
        }
        (false, _) => {
            return Err(format!(
                "configuração com identifier `{identifier}` sem a feature correspondente (o build oficial exige \
                 `{}`; a configuração isolada exige `--features ambiente-isolado`)",
                OFICIAL.identifier
            ))
        }
    }

    // O diretório de dados do WebView2 precisa derivar SOMENTE do identifier.
    let app = efetiva.get("app").cloned().unwrap_or(Value::Null);
    if definido(
        &app,
        &["appDirectoriesOverride", "app-directories-override"],
    ) {
        return Err("a configuração redefine `app.appDirectoriesOverride`: proibido".into());
    }
    let janelas = app
        .get("windows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if janelas
        .iter()
        .any(|j| definido(j, &["dataDirectory", "data-directory"]))
    {
        return Err("uma janela redefine `dataDirectory`: proibido".into());
    }

    if isolado {
        let bundle_ativo = efetiva
            .get("bundle")
            .and_then(|b| b.get("active"))
            .and_then(Value::as_bool);
        if bundle_ativo != Some(false) {
            return Err(
                "a configuração isolada precisa desabilitar o empacotamento (`bundle.active: false`)".into(),
            );
        }
    }
    Ok(())
}

/// Nomes de arquivos automáticos presentes (para o `build.rs` recusar).
pub fn arquivos_automaticos_presentes(existe: impl Fn(&str) -> bool) -> Vec<&'static str> {
    ARQUIVOS_AUTOMATICOS_PROIBIDOS
        .iter()
        .copied()
        .filter(|nome| existe(nome))
        .collect()
}
