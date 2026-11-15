//! Fase 22.8.8.2 (M2) — acesso ao **Windows Credential Manager**, isolado atrás do trait [`Cofre`].
//!
//! Uma única credencial GENÉRICA (`CRED_TYPE_GENERIC`), persistência `CRED_PERSIST_LOCAL_MACHINE` (fica neste
//! computador, para este usuário do Windows; não acompanha perfis móveis de domínio), protegida pelo próprio Windows
//! (DPAPI) — nenhuma criptografia própria aqui. O alvo e o campo de usuário são FIXOS no código: o frontend nunca
//! escolhe qual credencial é lida, gravada ou apagada.
//!
//! O conteúdo (a credencial em si) é gravado como os BYTES UTF-8 recebidos, sem conversão. Só o alvo e o usuário
//! são UTF-16 (exigência das APIs `*W`).
//!
//! Todo código `unsafe` do projeto vive no submódulo `windows_nativo` abaixo, com as condições de segurança
//! documentadas em cada bloco. Nenhuma função daqui registra log, e nenhum erro carrega detalhe do sistema
//! operacional ou do conteúdo: há uma única falha genérica, [`FalhaCofre::Indisponivel`].

/// Alvo (`TargetName`) da credencial da sessão administrativa. Versionado: um formato futuro usa outro alvo.
pub const ALVO_SESSAO: &str = "com.mariela.backoffice:sessao:v1";

/// Campo `UserName` da credencial: fixo e sem dado pessoal (nunca o e-mail ou o nome do usuário do app).
pub const USUARIO_CREDENCIAL: &str = "mariela-backoffice";

/// Limite do Credential Manager para o conteúdo de uma credencial (`CRED_MAX_CREDENTIAL_BLOB_SIZE` = 5 × 512).
pub const TAMANHO_MAXIMO_CONTEUDO: usize = 2560;

/// Falha genérica do cofre. Deliberadamente sem detalhes (nem código do Windows): quem chama só precisa saber que
/// o cofre não pôde ser usado agora.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FalhaCofre {
    Indisponivel,
}

/// Operações sobre a ÚNICA credencial do cofre. Implementações: [`CofreWindows`] (real) e, nos testes, um cofre
/// falso em memória. `ler`/`gravar`/`apagar` não fazem validação de conteúdo — isso é responsabilidade da camada de
/// sessão (`sessao.rs`), que também serializa as chamadas.
pub trait Cofre: Send + Sync {
    /// `Ok(None)` quando a credencial não existe; `Err` para qualquer outra falha.
    fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre>;
    /// Substitui o conteúdo inteiro numa única gravação nativa.
    fn gravar(&self, conteudo: &[u8]) -> Result<(), FalhaCofre>;
    /// Apaga a credencial. Ausência não é erro (idempotente).
    fn apagar(&self) -> Result<(), FalhaCofre>;
}

#[cfg(windows)]
pub use windows_nativo::CofreWindows;

#[cfg(windows)]
mod windows_nativo {
    use super::{Cofre, FalhaCofre, ALVO_SESSAO, TAMANHO_MAXIMO_CONTEUDO, USUARIO_CREDENCIAL};
    use std::ptr;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND, FILETIME};
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_MAX_CREDENTIAL_BLOB_SIZE,
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    // O limite público precisa ser exatamente o do Windows.
    const _: () = assert!(TAMANHO_MAXIMO_CONTEUDO == CRED_MAX_CREDENTIAL_BLOB_SIZE as usize);

    /// Converte para UTF-16 terminado em NUL (formato `PCWSTR` exigido pelas APIs `*W`).
    fn utf16_com_nul(texto: &str) -> Vec<u16> {
        texto.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Credential Manager real. Guarda o alvo e o usuário já convertidos; os buffers vivem enquanto a struct viver,
    /// então os ponteiros passados às APIs são válidos durante cada chamada.
    pub struct CofreWindows {
        alvo: Vec<u16>,
        usuario: Vec<u16>,
    }

    impl CofreWindows {
        /// O cofre da sessão administrativa (alvo fixo [`ALVO_SESSAO`]). Único construtor fora dos testes.
        pub fn sessao() -> Self {
            Self::com_alvo(ALVO_SESSAO)
        }

        /// Alvo arbitrário — usado APENAS pelo teste real `#[ignore]`, com um alvo sintético próprio, para nunca
        /// tocar a credencial de sessão de quem roda o teste.
        pub(crate) fn com_alvo(alvo: &str) -> Self {
            Self {
                alvo: utf16_com_nul(alvo),
                usuario: utf16_com_nul(USUARIO_CREDENCIAL),
            }
        }
    }

    /// Dono de um `CREDENTIALW` alocado pelo `CredReadW`: libera com `CredFree` ao sair de escopo — inclusive em
    /// todos os caminhos de erro e de `return` antecipado.
    struct CredencialLida(*mut CREDENTIALW);

    impl Drop for CredencialLida {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: o ponteiro veio de um `CredReadW` bem-sucedido e é liberado exatamente uma vez aqui.
                unsafe { CredFree(self.0 as *const core::ffi::c_void) };
            }
        }
    }

    impl Cofre for CofreWindows {
        fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre> {
            let mut saida: *mut CREDENTIALW = ptr::null_mut();
            // SAFETY: `self.alvo` é UTF-16 terminado em NUL e vive durante a chamada; `saida` é um ponteiro de saída
            // válido. Flags = 0 (nenhuma opção). A API não retém nossos buffers.
            let ok = unsafe { CredReadW(self.alvo.as_ptr(), CRED_TYPE_GENERIC, 0, &mut saida) };
            if ok == 0 {
                // SAFETY: leitura do último erro da thread, logo após a chamada que falhou.
                let erro = unsafe { GetLastError() };
                return if erro == ERROR_NOT_FOUND {
                    Ok(None)
                } else {
                    Err(FalhaCofre::Indisponivel)
                };
            }
            let lida = CredencialLida(saida);
            if lida.0.is_null() {
                return Err(FalhaCofre::Indisponivel);
            }
            // SAFETY: após sucesso, `lida.0` aponta para um `CREDENTIALW` válido, alocado pelo sistema, que só é
            // liberado no `Drop` de `lida` — depois da cópia abaixo.
            let credencial = unsafe { &*lida.0 };
            let tamanho = credencial.CredentialBlobSize as usize;
            if tamanho > TAMANHO_MAXIMO_CONTEUDO {
                return Err(FalhaCofre::Indisponivel);
            }
            if tamanho == 0 || credencial.CredentialBlob.is_null() {
                return Ok(Some(Vec::new()));
            }
            // SAFETY: o Windows garante `CredentialBlobSize` bytes válidos em `CredentialBlob` enquanto a estrutura
            // não for liberada; o tamanho foi limitado acima. Copiamos para memória nossa antes do `CredFree`.
            let bytes =
                unsafe { std::slice::from_raw_parts(credencial.CredentialBlob, tamanho) }.to_vec();
            Ok(Some(bytes))
        }

        fn gravar(&self, conteudo: &[u8]) -> Result<(), FalhaCofre> {
            if conteudo.len() > TAMANHO_MAXIMO_CONTEUDO {
                return Err(FalhaCofre::Indisponivel); // a camada de sessão já recusa antes; defesa extra
            }
            let credencial = CREDENTIALW {
                Flags: 0,
                Type: CRED_TYPE_GENERIC,
                TargetName: self.alvo.as_ptr() as *mut u16,
                Comment: ptr::null_mut(),
                LastWritten: FILETIME {
                    dwLowDateTime: 0,
                    dwHighDateTime: 0,
                },
                CredentialBlobSize: conteudo.len() as u32,
                CredentialBlob: conteudo.as_ptr() as *mut u8,
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                AttributeCount: 0,
                Attributes: ptr::null_mut(),
                TargetAlias: ptr::null_mut(),
                UserName: self.usuario.as_ptr() as *mut u16,
            };
            // SAFETY: `CredWriteW` só LÊ a estrutura e os buffers apontados (os `*mut` são exigência da assinatura;
            // nada é escrito neles). Todos os ponteiros (alvo, usuário, conteúdo) são válidos durante a chamada e o
            // tamanho do conteúdo é o real. A gravação substitui a credencial inteira de uma vez.
            let ok = unsafe { CredWriteW(&credencial, 0) };
            if ok == 0 {
                Err(FalhaCofre::Indisponivel)
            } else {
                Ok(())
            }
        }

        fn apagar(&self) -> Result<(), FalhaCofre> {
            // SAFETY: `self.alvo` é UTF-16 terminado em NUL e vive durante a chamada. Apaga só este alvo genérico.
            let ok = unsafe { CredDeleteW(self.alvo.as_ptr(), CRED_TYPE_GENERIC, 0) };
            if ok != 0 {
                return Ok(());
            }
            // SAFETY: leitura do último erro da thread, logo após a chamada que falhou.
            let erro = unsafe { GetLastError() };
            if erro == ERROR_NOT_FOUND {
                Ok(())
            } else {
                Err(FalhaCofre::Indisponivel)
            }
        }
    }
}

/// Plataformas sem Credential Manager (o app é distribuído só para Windows): o cofre está sempre indisponível —
/// nunca há armazenamento alternativo silencioso.
#[cfg(not(windows))]
pub struct CofreIndisponivel;

#[cfg(not(windows))]
impl Cofre for CofreIndisponivel {
    fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre> {
        Err(FalhaCofre::Indisponivel)
    }
    fn gravar(&self, _conteudo: &[u8]) -> Result<(), FalhaCofre> {
        Err(FalhaCofre::Indisponivel)
    }
    fn apagar(&self) -> Result<(), FalhaCofre> {
        Err(FalhaCofre::Indisponivel)
    }
}

/// Teste REAL do Credential Manager — `#[ignore]`: rodar só manualmente, numa máquina Windows de TESTE (nunca no
/// computador de uso diário), com:
///
/// ```text
/// cargo test --manifest-path src-tauri/Cargo.toml credential_manager_real -- --ignored --nocapture
/// ```
///
/// Usa um alvo sintético exclusivo (`...:teste-m2-<pid>-<nanos>`), nunca o alvo da sessão, e dados sintéticos; a
/// credencial é apagada ao final mesmo se uma asserção falhar (guarda com `Drop`).
#[cfg(all(test, windows))]
mod teste_real {
    use super::{Cofre, CofreWindows};
    use crate::sessao::ServicoSessao;

    struct ApagarAoSair(String);
    impl Drop for ApagarAoSair {
        fn drop(&mut self) {
            let _ = CofreWindows::com_alvo(&self.0).apagar();
        }
    }

    #[test]
    #[ignore = "usa o Credential Manager real: só numa máquina Windows de teste"]
    fn credential_manager_real() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let alvo = format!(
            "com.mariela.backoffice:sessao:teste-m2-{}-{}",
            std::process::id(),
            nanos
        );
        let _limpeza = ApagarAoSair(alvo.clone());
        let cofre = CofreWindows::com_alvo(&alvo);

        // Cofre direto: ausência, gravação, leitura, comparação, exclusão, ausência.
        assert_eq!(cofre.ler(), Ok(None));
        let conteudo = crate::sessao::testes_comuns::conteudo_valido();
        cofre.gravar(conteudo.as_bytes()).expect("gravação real");
        assert_eq!(cofre.ler(), Ok(Some(conteudo.as_bytes().to_vec())));
        cofre.apagar().expect("exclusão real");
        assert_eq!(cofre.ler(), Ok(None));
        cofre.apagar().expect("exclusão repetida é idempotente");

        // Pelo serviço (validação + seq), no mesmo alvo sintético.
        let servico = ServicoSessao::com_cofre(Box::new(CofreWindows::com_alvo(&alvo)));
        servico
            .gravar(conteudo.clone(), 1)
            .expect("gravação real via serviço");
        let lida = servico.carregar().expect("leitura real via serviço");
        assert_eq!(lida.conteudo.as_deref(), Some(conteudo.as_str()));
        servico.apagar(2).expect("exclusão real via serviço");
        assert!(servico
            .carregar()
            .expect("leitura após exclusão")
            .conteudo
            .is_none());
    }
}
