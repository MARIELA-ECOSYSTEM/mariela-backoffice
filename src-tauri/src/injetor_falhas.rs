//! Fase 22.8.8.8.2 (M8.2) — INJETOR DE FALHAS do cofre, exclusivo do ambiente isolado de desenvolvimento.
//!
//! Este módulo só existe quando o crate é compilado com a feature `ambiente-isolado` (`lib.rs` o declara sob `cfg`, e
//! a feature não compila em release — `ambiente.rs`). O build oficial não contém este código, o arquivo de controle
//! nem qualquer comando/endpoint para ativá-lo.
//!
//! Controle: `%LOCALAPPDATA%\com.mariela.backoffice.isolado\falhas-cofre.json`, consultado a CADA operação (liga e
//! desliga durante um cenário, sem reiniciar). Formato estrito — um objeto JSON só com as chaves `ler`, `gravar` e
//! `apagar`, todas booleanas, no máximo 256 bytes. Arquivo ausente, ilegível ou fora do formato ⇒ comportamento
//! NORMAL (nenhuma falha é inventada).
//!
//! Uma falha injetada devolve exatamente o erro real do cofre ([`FalhaCofre::Indisponivel`] → `COFRE_INDISPONIVEL`
//! no contrato dos comandos) e acontece no MESMO ponto de uma falha do Windows: depois de o serviço de sessão já ter
//! consumido o `seq` (gravação/exclusão), antes de qualquer chamada ao Credential Manager.

use crate::cofre::{Cofre, FalhaCofre};
use std::path::{Path, PathBuf};

/// Nome do arquivo de controle, dentro do diretório de dados do ambiente isolado.
pub const ARQUIVO_CONTROLE: &str = "falhas-cofre.json";
const TAMANHO_MAXIMO_CONTROLE: u64 = 256;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Falhas {
    pub ler: bool,
    pub gravar: bool,
    pub apagar: bool,
}

/// Interpreta o conteúdo do arquivo de controle. Qualquer desvio do formato ⇒ nenhuma falha.
pub fn interpretar(conteudo: &[u8]) -> Falhas {
    let Ok(texto) = std::str::from_utf8(conteudo) else {
        return Falhas::default();
    };
    let Ok(serde_json::Value::Object(campos)) = serde_json::from_str(texto) else {
        return Falhas::default();
    };
    let mut falhas = Falhas::default();
    for (chave, valor) in &campos {
        let Some(ligado) = valor.as_bool() else {
            return Falhas::default();
        };
        match chave.as_str() {
            "ler" => falhas.ler = ligado,
            "gravar" => falhas.gravar = ligado,
            "apagar" => falhas.apagar = ligado,
            _ => return Falhas::default(),
        }
    }
    falhas
}

/// Caminho do controle: SEMPRE dentro do diretório do ambiente isolado (o `identifier` vem da identidade isolada,
/// nunca de entrada externa). Sem `LOCALAPPDATA`, não há controle (comportamento normal).
pub fn caminho_controle() -> Option<PathBuf> {
    caminho_controle_em(
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .as_deref(),
    )
}

pub fn caminho_controle_em(local_app_data: Option<&Path>) -> Option<PathBuf> {
    Some(
        local_app_data?
            .join(crate::ambiente::ISOLADO.identifier)
            .join(ARQUIVO_CONTROLE),
    )
}

/// Lê o controle a cada chamada. Só arquivo regular e pequeno; qualquer erro ⇒ nenhuma falha.
fn ler_controle(caminho: Option<&Path>) -> Falhas {
    let Some(caminho) = caminho else {
        return Falhas::default();
    };
    match std::fs::symlink_metadata(caminho) {
        Ok(meta) if meta.is_file() && meta.len() <= TAMANHO_MAXIMO_CONTROLE => {
            std::fs::read(caminho)
                .map(|b| interpretar(&b))
                .unwrap_or_default()
        }
        _ => Falhas::default(),
    }
}

/// Cofre que consulta o controle antes de cada operação e, se pedido, falha como o Credential Manager falharia.
pub struct CofreComFalhas {
    interno: Box<dyn Cofre>,
    controle: Option<PathBuf>,
}

impl CofreComFalhas {
    pub fn novo(interno: Box<dyn Cofre>, controle: Option<PathBuf>) -> Self {
        Self { interno, controle }
    }
}

impl Cofre for CofreComFalhas {
    fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre> {
        if ler_controle(self.controle.as_deref()).ler {
            return Err(FalhaCofre::Indisponivel);
        }
        self.interno.ler()
    }
    fn gravar(&self, conteudo: &[u8]) -> Result<(), FalhaCofre> {
        if ler_controle(self.controle.as_deref()).gravar {
            return Err(FalhaCofre::Indisponivel);
        }
        self.interno.gravar(conteudo)
    }
    fn apagar(&self) -> Result<(), FalhaCofre> {
        if ler_controle(self.controle.as_deref()).apagar {
            return Err(FalhaCofre::Indisponivel);
        }
        self.interno.apagar()
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::sessao::testes_comuns::{conteudo_com_pendencia, conteudo_valido};
    use crate::sessao::{ErroSessao, ServicoSessao};
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct Memoria(Mutex<Option<Vec<u8>>>, Mutex<usize>);
    impl Cofre for Arc<Memoria> {
        fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre> {
            *self.1.lock().unwrap() += 1;
            Ok(self.0.lock().unwrap().clone())
        }
        fn gravar(&self, c: &[u8]) -> Result<(), FalhaCofre> {
            *self.1.lock().unwrap() += 1;
            *self.0.lock().unwrap() = Some(c.to_vec());
            Ok(())
        }
        fn apagar(&self) -> Result<(), FalhaCofre> {
            *self.1.lock().unwrap() += 1;
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    /// Arquivo de controle temporário (dentro do `target` dos testes, nunca no diretório real do app).
    struct Controle(PathBuf);
    impl Controle {
        fn novo(rotulo: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "mariela-m82-injetor-{rotulo}-{}",
                std::process::id()
            ));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir.join(ARQUIVO_CONTROLE))
        }
        fn escrever(&self, texto: &str) {
            std::fs::write(&self.0, texto).unwrap();
        }
    }
    impl Drop for Controle {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.0.parent().unwrap());
        }
    }

    fn servico(controle: &Controle) -> (ServicoSessao, Arc<Memoria>) {
        let memoria = Arc::new(Memoria::default());
        let cofre = CofreComFalhas::novo(Box::new(memoria.clone()), Some(controle.0.clone()));
        (ServicoSessao::com_cofre(Box::new(cofre)), memoria)
    }

    #[test]
    fn formato_estrito_e_desvio_significa_comportamento_normal() {
        assert_eq!(
            interpretar(br#"{"ler":true,"gravar":false,"apagar":true}"#),
            Falhas {
                ler: true,
                gravar: false,
                apagar: true
            }
        );
        assert_eq!(
            interpretar(br#"{"gravar":true}"#),
            Falhas {
                gravar: true,
                ..Falhas::default()
            }
        );
        for invalido in [
            &b""[..],
            b"nao json",
            b"[]",
            b"true",
            br#"{"ler":"true"}"#,
            br#"{"ler":1}"#,
            br#"{"ler":true,"extra":true}"#,
            br#"{"LER":true}"#,
            &[0xff, 0xfe],
        ] {
            assert_eq!(interpretar(invalido), Falhas::default(), "{invalido:?}");
        }
    }

    #[test]
    fn controle_fica_sempre_no_diretorio_isolado() {
        let base = Path::new(r"C:\Users\x\AppData\Local");
        let caminho = caminho_controle_em(Some(base)).unwrap();
        assert_eq!(
            caminho,
            base.join("com.mariela.backoffice.isolado")
                .join("falhas-cofre.json")
        );
        // `starts_with` compara COMPONENTES: o controle nunca fica no diretório oficial.
        assert!(!caminho.starts_with(base.join(crate::ambiente::OFICIAL.identifier)));
        assert_eq!(caminho_controle_em(None), None);
    }

    #[test]
    fn sem_controle_valido_tudo_funciona_normalmente() {
        let controle = Controle::novo("normal");
        let (s, _) = servico(&controle); // arquivo ausente
        s.gravar(conteudo_valido(), 1).unwrap();
        assert!(s.carregar().unwrap().conteudo.is_some());
        controle.escrever("{ quebrado");
        s.gravar(conteudo_com_pendencia(), 2).unwrap();
        controle.escrever(&format!(r#"{{"ler":true,"x":"{}"}}"#, "a".repeat(300))); // acima de 256 bytes
        assert!(s.carregar().unwrap().conteudo.is_some());
        s.apagar(3).unwrap();
    }

    #[test]
    fn falha_de_leitura_e_ligada_e_desligada_durante_a_execucao() {
        let controle = Controle::novo("ler");
        let (s, memoria) = servico(&controle);
        s.gravar(conteudo_valido(), 1).unwrap();
        let chamadas = *memoria.1.lock().unwrap();
        controle.escrever(r#"{"ler":true}"#);
        assert_eq!(s.carregar().err(), Some(ErroSessao::CofreIndisponivel));
        assert_eq!(
            *memoria.1.lock().unwrap(),
            chamadas,
            "o cofre real não foi chamado"
        );
        controle.escrever(r#"{"ler":false}"#);
        assert!(s.carregar().unwrap().conteudo.is_some());
    }

    #[test]
    fn falha_de_gravacao_consome_o_seq_como_a_falha_real_e_preserva_o_conteudo() {
        let controle = Controle::novo("gravar");
        let (s, memoria) = servico(&controle);
        s.gravar(conteudo_valido(), 1).unwrap();
        controle.escrever(r#"{"gravar":true}"#);
        assert_eq!(
            s.gravar(conteudo_com_pendencia(), 2),
            Err(ErroSessao::CofreIndisponivel)
        );
        assert_eq!(
            memoria.0.lock().unwrap().as_deref(),
            Some(conteudo_valido().as_bytes())
        );
        // Igual ao Windows falhando: o seq 2 foi consumido.
        assert_eq!(s.carregar().unwrap().seq, 2);
        assert_eq!(
            s.gravar(conteudo_com_pendencia(), 2),
            Err(ErroSessao::GravacaoObsoleta)
        );
        std::fs::remove_file(&controle.0).unwrap();
        assert_eq!(s.gravar(conteudo_com_pendencia(), 3), Ok(()));
    }

    #[test]
    fn falha_de_exclusao_preserva_a_credencial_e_consome_o_seq() {
        let controle = Controle::novo("apagar");
        let (s, memoria) = servico(&controle);
        s.gravar(conteudo_valido(), 1).unwrap();
        controle.escrever(r#"{"apagar":true}"#);
        assert_eq!(s.apagar(2), Err(ErroSessao::CofreIndisponivel));
        assert!(memoria.0.lock().unwrap().is_some());
        assert_eq!(s.carregar().unwrap().seq, 2);
        controle.escrever("{}");
        assert_eq!(s.apagar(3), Ok(()));
        assert!(memoria.0.lock().unwrap().is_none());
    }

    #[test]
    fn controle_que_nao_e_arquivo_regular_e_ignorado() {
        let controle = Controle::novo("diretorio");
        std::fs::create_dir_all(&controle.0).unwrap(); // um DIRETÓRIO com o nome do controle
        let (s, _) = servico(&controle);
        assert_eq!(s.gravar(conteudo_valido(), 1), Ok(()));
    }
}
