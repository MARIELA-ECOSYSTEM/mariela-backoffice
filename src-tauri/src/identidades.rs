//! Fase 22.8.8.7 (M7) — as DUAS identidades do aplicativo, como dados puros (sem `cfg`, sem dependências).
//!
//! Este arquivo é compartilhado, pelo caminho, entre o crate (`ambiente.rs`) e o script de build (`build.rs`), para
//! que as travas de compilação e as de inicialização comparem exatamente os mesmos valores. Qual identidade vale no
//! binário é decidido SOMENTE pela feature `ambiente-isolado`, em `ambiente.rs`.
//!
//! Os valores OFICIAIS são exatamente os anteriores à M7 (`tauri.conf.json`, `cofre.rs`, `instancia.rs`): mudá-los
//! faria o app instalado perder o acesso à sessão e aos dados já gravados.

/// Tudo o que identifica um ambiente no Windows: o diretório de dados do WebView2 deriva do `identifier`
/// (`%LOCALAPPDATA%\<identifier>`); o alvo/usuário da credencial e o mutex são fixos no Rust.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Identidade {
    /// `identifier` do Tauri (configuração efetiva compilada no binário).
    pub identifier: &'static str,
    /// `TargetName` da credencial genérica da sessão no Windows Credential Manager.
    pub alvo_credencial: &'static str,
    /// `UserName` da credencial (fixo, sem dado pessoal).
    pub usuario_credencial: &'static str,
    /// Nome do mutex de instância única (namespace da sessão de logon).
    pub mutex: &'static str,
}

/// Produção — o aplicativo instalado.
pub const OFICIAL: Identidade = Identidade {
    identifier: "com.mariela.backoffice",
    alvo_credencial: "com.mariela.backoffice:sessao:v1",
    usuario_credencial: "mariela-backoffice",
    mutex: "Local\\com.mariela.backoffice.instancia-unica",
};

/// Ambiente de desenvolvimento ISOLADO (`bun run tauri:isolado`): nada em comum com a produção.
pub const ISOLADO: Identidade = Identidade {
    identifier: "com.mariela.backoffice.isolado",
    alvo_credencial: "com.mariela.backoffice.isolado:sessao:v1",
    usuario_credencial: "mariela-backoffice-isolado",
    mutex: "Local\\com.mariela.backoffice.isolado.instancia-unica",
};
