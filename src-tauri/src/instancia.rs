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

/// Nome estável e específico do MARIELA Backoffice. Fase 22.8.8.7 (M7): vem da identidade do binário
/// (`ambiente.rs`) — o oficial sem a feature, o isolado com ela; os dois nunca se bloqueiam mutuamente.
pub const NOME_MUTEX: &str = crate::ambiente::ATUAL.mutex;

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
pub use windows_nativo::{adquirir, avisar, avisar_texto};

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
        avisar_texto(erro.mensagem());
    }

    /// Caixa de mensagem nativa com um texto fixo do app (também usada pela validação de ambiente, M7).
    pub fn avisar_texto(mensagem: &str) {
        let texto = utf16_com_nul(mensagem);
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

#[cfg(not(windows))]
pub fn avisar_texto(_mensagem: &str) {}

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

    // ── Fase 22.8.8.5 (M5): entre PROCESSOS e sem vazamento de handles ──

    /// Variável que transforma o executável de testes num processo filho que segura o mutex.
    const VAR_FILHO: &str = "MARIELA_M5_MUTEX_FILHO";
    const TESTE_AUXILIAR: &str = "instancia::testes::auxiliar_processo_que_segura_o_mutex";

    #[test]
    #[ignore = "auxiliar: executado só como processo filho por `outro_processo_bloqueia_e_o_fim_do_processo_libera`"]
    fn auxiliar_processo_que_segura_o_mutex() {
        use std::io::Write;
        let Ok(nome) = std::env::var(VAR_FILHO) else {
            return; // fora do papel de filho, não faz nada
        };
        let _guarda = adquirir(&nome).expect("o filho adquire o mutex");
        println!("MUTEX_ADQUIRIDO");
        std::io::stdout().flush().unwrap();
        // Segura o mutex até o pai fechar o stdin (saída normal) ou matar o processo (saída anormal). Prazo máximo de
        // 60 s: um teste com defeito nunca deixa um processo pendurado.
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut linha = String::new();
            let _ = std::io::stdin().read_line(&mut linha);
            let _ = tx.send(());
        });
        let _ = rx.recv_timeout(std::time::Duration::from_secs(60));
    }

    /// Inicia o filho (o próprio executável de testes) e espera ele confirmar que segura o mutex `nome`.
    fn filho_com_mutex(nome: &str) -> std::process::Child {
        use std::io::BufRead;
        use std::process::{Command, Stdio};
        let mut filho = Command::new(std::env::current_exe().unwrap())
            .args([
                TESTE_AUXILIAR,
                "--exact",
                "--ignored",
                "--nocapture",
                "--test-threads=1",
            ])
            .env(VAR_FILHO, nome)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("processo filho");
        // O libtest imprime "test <nome> ... " sem quebra de linha antes da saída do teste: procurar por `contains`.
        let mut linhas = std::io::BufReader::new(filho.stdout.take().unwrap()).lines();
        let confirmou = linhas
            .by_ref()
            .map_while(Result::ok)
            .any(|l| l.contains("MUTEX_ADQUIRIDO"));
        assert!(confirmou, "o processo filho não adquiriu o mutex");
        // Continua lendo o restante (resumo do libtest) para o filho não falhar escrevendo num pipe fechado.
        std::thread::spawn(move || linhas.for_each(drop));
        filho
    }

    #[test]
    fn outro_processo_bloqueia_e_o_fim_do_processo_libera() {
        // 1) Encerramento ANORMAL (TerminateProcess: nenhum `Drop` executa) — o Windows fecha o handle.
        let nome = nome_sintetico("processo-morto");
        let mut filho = filho_com_mutex(&nome);
        assert_eq!(adquirir(&nome).err(), Some(ErroInstancia::JaEmExecucao));
        filho.kill().unwrap();
        filho.wait().unwrap();
        let depois = adquirir(&nome).expect("após o fim do processo, uma nova instância adquire");
        drop(depois);

        // 2) Encerramento NORMAL (o filho sai e a guarda é liberada).
        let nome = nome_sintetico("processo-encerrado");
        let mut filho = filho_com_mutex(&nome);
        assert_eq!(adquirir(&nome).err(), Some(ErroInstancia::JaEmExecucao));
        drop(filho.stdin.take()); // EOF → o filho retorna
        assert!(filho.wait().unwrap().success());
        let depois = adquirir(&nome).expect("após o encerramento, uma nova instância adquire");
        drop(depois);
    }

    #[test]
    fn nenhum_caminho_vaza_handles() {
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetProcessHandleCount};
        fn handles() -> u32 {
            let mut n = 0u32;
            // SAFETY: pseudo-handle do processo atual e ponteiro de saída válido.
            assert_ne!(
                unsafe { GetProcessHandleCount(GetCurrentProcess(), &mut n) },
                0
            );
            n
        }
        const RODADAS: u32 = 500;
        let nome = nome_sintetico("handles");
        let invalido = format!("NamespaceInexistente\\{}", nome_sintetico("handles"));
        let antes = handles();
        for _ in 0..RODADAS {
            let guarda = adquirir(&nome).expect("aquisição"); // caminho Ok
            assert_eq!(adquirir(&nome).err(), Some(ErroInstancia::JaEmExecucao)); // caminho duplicado
            drop(guarda);
            // caminho de falha
            assert_eq!(adquirir(&invalido).err(), Some(ErroInstancia::Indisponivel));
        }
        let depois = handles();
        // Um vazamento somaria ≥ RODADAS handles. A folga cobre outros testes rodando em paralelo no mesmo processo.
        assert!(
            depois.saturating_sub(antes) < 100,
            "handles antes={antes} depois={depois}"
        );
    }

    // ── Fase 22.8.8.7 (M7): mutex por ambiente ──

    #[test]
    fn mutex_segue_a_identidade_do_binario_e_os_ambientes_nao_se_bloqueiam() {
        use crate::ambiente::{ATUAL, ISOLADO, OFICIAL};
        assert_eq!(NOME_MUTEX, ATUAL.mutex);
        if !cfg!(feature = "ambiente-isolado") {
            assert_eq!(NOME_MUTEX, "Local\\com.mariela.backoffice.instancia-unica");
        }
        // Nomes de objetos do kernel não diferenciam maiúsculas: precisam diferir de verdade.
        assert!(!ISOLADO.mutex.eq_ignore_ascii_case(OFICIAL.mutex));

        // Real (kernel), com nomes SINTÉTICOS no mesmo formato dos dois ambientes — o mutex oficial nunca é tocado
        // por testes: segurar um "oficial" não impede o "isolado", e vice-versa.
        let base = nome_sintetico("ambientes");
        let oficial = format!("{base}.instancia-unica");
        let isolado = format!("{base}.isolado.instancia-unica");
        let guarda_oficial = adquirir(&oficial).expect("oficial sintético");
        let guarda_isolado = adquirir(&isolado).expect("isolado coexiste com o oficial");
        assert_eq!(adquirir(&isolado).err(), Some(ErroInstancia::JaEmExecucao));
        assert_eq!(adquirir(&oficial).err(), Some(ErroInstancia::JaEmExecucao));
        drop(guarda_oficial);
        drop(guarda_isolado);
    }

    #[test]
    fn mensagens_nao_expoem_detalhes_internos() {
        for erro in [ErroInstancia::JaEmExecucao, ErroInstancia::Indisponivel] {
            let m = erro.mensagem();
            assert!(!m.contains("ERROR_") && !m.contains("0x") && !m.contains("Local\\"));
        }
    }
}
