//! Fase 22.8.8.4 (M4) — INSTÂNCIA ÚNICA por mutex nomeado do Windows.
//!
//! Duas instâncias do app concorreriam pela mesma credencial do Credential Manager (gravações, refresh, logout). A
//! primeira instância CRIA o mutex nomeado e mantém o handle aberto enquanto o processo vive; uma segunda recebe
//! `ERROR_ALREADY_EXISTS` e encerra ANTES de criar janelas ou registrar os comandos de sessão. Se o mutex não puder ser
//! criado, o app também não inicia (falha segura): nunca há duas instâncias operando em silêncio.
//!
//! O namespace `Local\` limita o mutex à sessão de logon do Windows (cada usuário do Windows tem a sua instância —
//! e o seu próprio cofre). Não há comunicação entre instâncias nesta fase.
//!
//! Todo `unsafe` fica no submódulo `windows_nativo`, documentado bloco a bloco. O handle é fechado no `Drop` da guarda;
//! se o processo terminar sem executar o `Drop` (ex.: `std::process::exit` do runtime), o Windows fecha o handle e o
//! mutex deixa de existir quando o último handle é fechado.

/// Nome estável e específico do MARIELA Backoffice.
pub const NOME_MUTEX: &str = "Local\\com.mariela.backoffice.instancia-unica";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErroInstancia {
    /// Outra instância já está em execução nesta sessão do Windows.
    JaEmExecucao,
    /// Não foi possível criar/abrir o mutex: não há como garantir instância única.
    Indisponivel,
}

impl ErroInstancia {
    /// Mensagem para o usuário (sem detalhes internos do Windows).
    pub fn mensagem(self) -> &'static str {
        match self {
            ErroInstancia::JaEmExecucao => {
                "O MARIELA Backoffice já está aberto neste computador.\n\nUse a janela que já está aberta."
            }
            ErroInstancia::Indisponivel => {
                "Não foi possível garantir que apenas uma janela do MARIELA Backoffice esteja aberta.\n\nPor segurança, o aplicativo não será iniciado. Tente abrir novamente; se o problema continuar, reinicie o computador."
            }
        }
    }
}

#[cfg(windows)]
pub use windows_nativo::{adquirir, avisar};

#[cfg(windows)]
mod windows_nativo {
    use super::ErroInstancia;
    use std::ptr;
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, SetLastError, ERROR_ALREADY_EXISTS, HANDLE,
    };
    use windows_sys::Win32::System::Threading::CreateMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONWARNING, MB_OK, MB_SETFOREGROUND,
    };

    fn utf16_com_nul(texto: &str) -> Vec<u16> {
        texto.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Mantém o mutex nomeado enquanto existir. Fecha o handle ao sair de escopo.
    pub struct GuardaInstancia(HANDLE);

    impl Drop for GuardaInstancia {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: handle válido obtido de `CreateMutexW` e fechado exatamente uma vez.
                unsafe { CloseHandle(self.0) };
            }
        }
    }

    // A guarda só carrega um handle de kernel (opaco); pode ser movida entre threads.
    unsafe impl Send for GuardaInstancia {}

    /// Cria o mutex nomeado `nome`. `Ok` = esta é a única instância; `Err(JaEmExecucao)` = outra já o criou.
    pub fn adquirir(nome: &str) -> Result<GuardaInstancia, ErroInstancia> {
        let nome = utf16_com_nul(nome);
        // SAFETY: zera o último erro da thread para que `GetLastError` reflita só a chamada abaixo.
        unsafe { SetLastError(0) };
        // SAFETY: atributos nulos (padrão), sem posse inicial (a existência do objeto nomeado é o sinal), e `nome` é
        // UTF-16 terminado em NUL que vive durante a chamada.
        let handle = unsafe { CreateMutexW(ptr::null(), 0, nome.as_ptr()) };
        if handle.is_null() {
            return Err(ErroInstancia::Indisponivel);
        }
        // SAFETY: leitura do último erro da thread logo após a chamada.
        let erro = unsafe { GetLastError() };
        if erro == ERROR_ALREADY_EXISTS {
            // SAFETY: handle válido devolvido acima; esta instância não o mantém.
            unsafe { CloseHandle(handle) };
            return Err(ErroInstancia::JaEmExecucao);
        }
        Ok(GuardaInstancia(handle))
    }

    /// Caixa de mensagem nativa (antes de existir qualquer janela do app).
    pub fn avisar(erro: ErroInstancia) {
        let texto = utf16_com_nul(erro.mensagem());
        let titulo = utf16_com_nul("MARIELA Backoffice");
        // SAFETY: sem janela-mãe (nula); textos UTF-16 terminados em NUL que vivem durante a chamada.
        unsafe {
            MessageBoxW(
                ptr::null_mut(),
                texto.as_ptr(),
                titulo.as_ptr(),
                MB_OK | MB_ICONWARNING | MB_SETFOREGROUND,
            )
        };
    }
}

/// Fora do Windows não há mutex nomeado nem Credential Manager (o cofre já fica indisponível): sem restrição aqui.
#[cfg(not(windows))]
pub struct GuardaInstancia;

#[cfg(not(windows))]
pub fn adquirir(_nome: &str) -> Result<GuardaInstancia, ErroInstancia> {
    Ok(GuardaInstancia)
}

#[cfg(not(windows))]
pub fn avisar(_erro: ErroInstancia) {}

/// Testes REAIS do mutex (objetos de kernel temporários, com nomes sintéticos exclusivos; nada persiste e nenhuma
/// credencial é tocada — seguros na máquina de uso diário).
#[cfg(all(test, windows))]
mod testes {
    use super::*;

    fn nome_sintetico(rotulo: &str) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!(
            "Local\\com.mariela.backoffice.teste-{rotulo}-{}-{nanos}",
            std::process::id()
        )
    }

    #[test]
    fn primeira_instancia_adquire_e_segunda_e_recusada() {
        let nome = nome_sintetico("dupla");
        let primeira = adquirir(&nome).expect("primeira instância");
        assert_eq!(adquirir(&nome).err(), Some(ErroInstancia::JaEmExecucao));
        assert_eq!(adquirir(&nome).err(), Some(ErroInstancia::JaEmExecucao));
        drop(primeira);
    }

    #[test]
    fn encerrar_a_primeira_libera_o_mutex() {
        let nome = nome_sintetico("liberacao");
        let primeira = adquirir(&nome).expect("primeira instância");
        drop(primeira); // último handle fechado: o objeto deixa de existir
        let de_novo = adquirir(&nome).expect("após o encerramento, uma nova instância adquire");
        drop(de_novo);
    }

    #[test]
    fn mutex_indisponivel_falha_de_forma_segura() {
        // Namespace inexistente: `CreateMutexW` falha (handle nulo) → `Indisponivel`, nunca `Ok`.
        let nome = format!("NamespaceInexistente\\{}", nome_sintetico("indisponivel"));
        assert_eq!(adquirir(&nome).err(), Some(ErroInstancia::Indisponivel));
    }

    #[test]
    fn mensagens_nao_expoem_detalhes_internos() {
        for erro in [ErroInstancia::JaEmExecucao, ErroInstancia::Indisponivel] {
            let m = erro.mensagem();
            assert!(!m.contains("ERROR_") && !m.contains("0x") && !m.contains("Local\\"));
        }
    }
}
