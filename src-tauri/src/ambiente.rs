//! Fase 22.8.8.7 (M7) — ambiente de execução: OFICIAL (produção) ou ISOLADO (desenvolvimento).
//!
//! A escolha depende EXCLUSIVAMENTE da feature de compilação `ambiente-isolado` — nunca de variável de ambiente,
//! arquivo ou dado vindo do frontend. Três camadas garantem que identidade, credencial, mutex e diretório de dados
//! andem sempre juntos:
//!
//! 1. **Compilação** — `compile_error!` abaixo: a feature não compila sem `debug_assertions` (perfil release).
//! 2. **Build** — `build.rs` recalcula a configuração efetiva do Tauri (a mesma que o `generate_context!` embute) e
//!    falha se feature e `identifier` não corresponderem, nos dois sentidos.
//! 3. **Inicialização** — [`validar`], chamada em `lib.rs::run` ANTES do mutex, de janelas, estados e comandos:
//!    confere a configuração compilada e bloqueia o `tauri dev` comum (debug com a identidade oficial). Em caso de
//!    erro o app mostra um aviso nativo e encerra — nunca recorre à identidade oficial.

pub use crate::identidades::{Identidade, ISOLADO, OFICIAL};

#[cfg(all(feature = "ambiente-isolado", not(debug_assertions)))]
compile_error!(
    "A feature `ambiente-isolado` é exclusiva de desenvolvimento e não pode ser compilada em perfil release \
     (sem debug_assertions). O build oficial de produção nunca a ativa."
);

/// Identidade efetiva deste binário.
#[cfg(not(feature = "ambiente-isolado"))]
pub const ATUAL: Identidade = OFICIAL;
#[cfg(feature = "ambiente-isolado")]
pub const ATUAL: Identidade = ISOLADO;

/// `true` somente quando compilado com a feature `ambiente-isolado`.
pub const ISOLADO_ATIVO: bool = cfg!(feature = "ambiente-isolado");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErroAmbiente {
    /// O `identifier` compilado não é o da identidade deste binário (feature e configuração dessincronizadas).
    IdentidadeDivergente,
    /// A configuração redefine o diretório de dados (`appDirectoriesOverride` ou `dataDirectory` de uma janela):
    /// o isolamento do WebView2 deixaria de depender só do `identifier`.
    DiretorioDeDadosRedefinido,
    /// Build de desenvolvimento com a identidade OFICIAL (`tauri dev` comum): usaria o diretório de dados e a
    /// credencial do aplicativo instalado.
    DesenvolvimentoComIdentidadeOficial,
}

impl ErroAmbiente {
    /// Mensagem para a caixa de aviso nativa (sem tokens, caminhos de dados ou detalhes do Windows).
    pub fn mensagem(self) -> &'static str {
        match self {
            ErroAmbiente::IdentidadeDivergente => {
                "A identidade deste build do MARIELA Backoffice não corresponde ao ambiente para o qual ele foi compilado.\n\nPor segurança, o aplicativo não será iniciado."
            }
            ErroAmbiente::DiretorioDeDadosRedefinido => {
                "A configuração deste build redefine o diretório de dados do aplicativo.\n\nPor segurança, o aplicativo não será iniciado."
            }
            ErroAmbiente::DesenvolvimentoComIdentidadeOficial => {
                "Build de desenvolvimento com a identidade oficial do MARIELA Backoffice.\n\nEle usaria os dados e a sessão do aplicativo instalado, por isso não será iniciado. Para desenvolver no desktop, use o ambiente isolado: bun run tauri:isolado"
            }
        }
    }
}

/// Regra pura (testável nas duas configurações sem recompilar): `isolado` = feature ativa; `depuracao` =
/// `debug_assertions`; `identifier` e `diretorio_redefinido` vêm da configuração compilada.
pub fn decidir(
    isolado: bool,
    depuracao: bool,
    identifier: &str,
    diretorio_redefinido: bool,
) -> Result<(), ErroAmbiente> {
    let esperada = if isolado { ISOLADO } else { OFICIAL };
    if identifier != esperada.identifier {
        return Err(ErroAmbiente::IdentidadeDivergente);
    }
    if diretorio_redefinido {
        return Err(ErroAmbiente::DiretorioDeDadosRedefinido);
    }
    if depuracao && !isolado {
        return Err(ErroAmbiente::DesenvolvimentoComIdentidadeOficial);
    }
    Ok(())
}

/// Valida a configuração efetivamente compilada no binário (`generate_context!`).
pub fn validar(config: &tauri::Config) -> Result<(), ErroAmbiente> {
    let diretorio_redefinido = config.app.app_directories_override.is_some()
        || config
            .app
            .windows
            .iter()
            .any(|janela| janela.data_directory.is_some());
    decidir(
        ISOLADO_ATIVO,
        cfg!(debug_assertions),
        &config.identifier,
        diretorio_redefinido,
    )
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn identidade_oficial_e_exatamente_a_anterior_a_m7() {
        assert_eq!(OFICIAL.identifier, "com.mariela.backoffice");
        assert_eq!(OFICIAL.alvo_credencial, "com.mariela.backoffice:sessao:v1");
        assert_eq!(OFICIAL.usuario_credencial, "mariela-backoffice");
        assert_eq!(
            OFICIAL.mutex,
            "Local\\com.mariela.backoffice.instancia-unica"
        );
    }

    #[test]
    fn identidade_isolada_e_a_aprovada_e_nao_compartilha_nada_com_a_oficial() {
        assert_eq!(ISOLADO.identifier, "com.mariela.backoffice.isolado");
        assert_eq!(
            ISOLADO.alvo_credencial,
            "com.mariela.backoffice.isolado:sessao:v1"
        );
        assert_eq!(ISOLADO.usuario_credencial, "mariela-backoffice-isolado");
        assert_eq!(
            ISOLADO.mutex,
            "Local\\com.mariela.backoffice.isolado.instancia-unica"
        );
        assert_ne!(ISOLADO.identifier, OFICIAL.identifier);
        assert_ne!(ISOLADO.alvo_credencial, OFICIAL.alvo_credencial);
        assert_ne!(ISOLADO.usuario_credencial, OFICIAL.usuario_credencial);
        assert_ne!(ISOLADO.mutex, OFICIAL.mutex);
        // Comparação sem diferenciar maiúsculas: o Credential Manager e os nomes de objetos do kernel não podem
        // confundir os dois ambientes.
        assert!(!ISOLADO
            .alvo_credencial
            .eq_ignore_ascii_case(OFICIAL.alvo_credencial));
        assert!(!ISOLADO.mutex.eq_ignore_ascii_case(OFICIAL.mutex));
    }

    #[test]
    fn identidade_atual_segue_somente_a_feature() {
        assert_eq!(ISOLADO_ATIVO, cfg!(feature = "ambiente-isolado"));
        if cfg!(feature = "ambiente-isolado") {
            assert_eq!(ATUAL, ISOLADO);
        } else {
            assert_eq!(ATUAL, OFICIAL);
        }
    }

    #[test]
    fn producao_release_com_identidade_oficial_inicia() {
        assert_eq!(decidir(false, false, OFICIAL.identifier, false), Ok(()));
    }

    #[test]
    fn isolado_com_identidade_isolada_inicia() {
        assert_eq!(decidir(true, true, ISOLADO.identifier, false), Ok(()));
    }

    #[test]
    fn tauri_dev_comum_com_identidade_oficial_e_bloqueado() {
        assert_eq!(
            decidir(false, true, OFICIAL.identifier, false),
            Err(ErroAmbiente::DesenvolvimentoComIdentidadeOficial)
        );
    }

    #[test]
    fn identidade_incorreta_impede_a_inicializacao_nos_dois_sentidos() {
        // Feature ativa, mas configuração oficial (ou qualquer outra): nunca cai para a identidade oficial.
        for id in [
            OFICIAL.identifier,
            "com.mariela.backoffice.outro",
            "",
            "COM.MARIELA.BACKOFFICE.ISOLADO",
        ] {
            assert_eq!(
                decidir(true, true, id, false),
                Err(ErroAmbiente::IdentidadeDivergente),
                "{id}"
            );
        }
        // Sem a feature, mas configuração isolada: o app oficial nunca roda com o diretório isolado.
        for depuracao in [true, false] {
            assert_eq!(
                decidir(false, depuracao, ISOLADO.identifier, false),
                Err(ErroAmbiente::IdentidadeDivergente)
            );
        }
    }

    #[test]
    fn diretorio_de_dados_redefinido_impede_a_inicializacao() {
        assert_eq!(
            decidir(true, true, ISOLADO.identifier, true),
            Err(ErroAmbiente::DiretorioDeDadosRedefinido)
        );
        assert_eq!(
            decidir(false, false, OFICIAL.identifier, true),
            Err(ErroAmbiente::DiretorioDeDadosRedefinido)
        );
    }

    // A validação da configuração REAL compilada (`generate_context!`) fica em `tests/acl.rs`: o executável de testes
    // de integração é o que recebe o manifesto do Common Controls v6 exigido pelo runtime do Tauri (ver `build.rs`).

    #[test]
    fn mensagens_nao_expoem_detalhes_internos() {
        for erro in [
            ErroAmbiente::IdentidadeDivergente,
            ErroAmbiente::DiretorioDeDadosRedefinido,
            ErroAmbiente::DesenvolvimentoComIdentidadeOficial,
        ] {
            let m = erro.mensagem();
            for proibido in ["sessao:v1", "Local\\", "LOCALAPPDATA", "0x", "ERROR_"] {
                assert!(!m.contains(proibido), "{proibido}");
            }
        }
    }
}
