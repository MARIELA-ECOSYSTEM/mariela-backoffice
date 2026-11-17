//! Fase 22.8.9.5 — armazenamento DURÁVEL das operações incertas de cancelamento/devolução.
//!
//! Antes desta fase o registro vivia no `sessionStorage` do WebView: sobrevivia a recarregar a tela, mas não a fechar
//! o aplicativo. Aqui ele vira um arquivo por venda, gravado de forma atômica e com `fsync` ANTES de o frontend enviar
//! a operação ao backend — sobrevive a fechamento, encerramento inesperado do processo e reinício do Windows.
//!
//! É um armazenamento de DADOS OPERACIONAIS, separado da sessão: nada aqui toca no Credential Manager, e o conteúdo
//! nunca tem token, senha ou credencial (o formato é validado; campos desconhecidos são recusados).
//!
//! ## Onde
//! `%LOCALAPPDATA%\<identifier>\operacoes-pendentes\v-<hex do vendaId>.json`. O `identifier` é o da identidade
//! compilada (`ambiente.rs`): oficial e isolado nunca compartilham registros. Se o diretório de dados do app não
//! terminar exatamente no `identifier` da identidade vigente, o armazenamento fica INDISPONÍVEL (falha fechada).
//!
//! ## Contrato
//! - `operacao_ler({ vendaId }) -> string | null` — o conteúdo como gravado (o frontend valida de novo).
//! - `operacao_gravar({ vendaId, conteudo })` — grava se não houver registro da venda, ou se o existente for da MESMA
//!   operação (mesma `chave`). Registro de OUTRA operação, ou ilegível, nunca é substituído: `CONFLITO`.
//! - `operacao_remover({ vendaId, chave })` — `chave` = só remove se o registro for desta operação (registro de outra
//!   operação: `CONFLITO`, nada muda); `null` = descarte explícito do operador (remove o que houver, inclusive ilegível).
//!   Ausente = sucesso (idempotente).
//! - Erros: SOMENTE `INDISPONIVEL`, `FORMATO_INVALIDO`, `TAMANHO_EXCEDIDO`, `CONFLITO`. Nunca caminhos, mensagens do
//!   Windows ou trechos do conteúdo.
//!
//! ## Formato v3 (JSON UTF-8, no máximo 2.048 bytes; exatamente estes campos)
//! ```json
//! { "versao": 3, "vendaId": "…", "chave": "…", "assinatura": "{\"tipo\":…,\"itens\":[…]}",
//!   "iniciadaEm": "<ISO>", "gravadaEm": "<ISO>", "estado": "em_andamento" | "incerta" }
//! ```
//!
//! ## Atomicidade
//! Escreve num temporário ao lado (`.tmp`), `fsync` do temporário, renomeia por cima do definitivo (substituição
//! atômica do NTFS) e `fsync` do definitivo. Um encerramento no meio deixa o registro ANTERIOR intacto (o temporário é
//! ignorado na leitura e sobrescrito na próxima gravação). Um único `Mutex` serializa as operações do processo; o
//! mutex de instância única (`instancia.rs`) impede um segundo processo.

use serde::{Serialize, Serializer};
use serde_json::{Map, Value};
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Erros expostos ao frontend — só códigos estáveis, sem nenhum dado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErroOperacoes {
    Indisponivel,
    FormatoInvalido,
    TamanhoExcedido,
    Conflito,
}

impl ErroOperacoes {
    pub fn codigo(self) -> &'static str {
        match self {
            ErroOperacoes::Indisponivel => "INDISPONIVEL",
            ErroOperacoes::FormatoInvalido => "FORMATO_INVALIDO",
            ErroOperacoes::TamanhoExcedido => "TAMANHO_EXCEDIDO",
            ErroOperacoes::Conflito => "CONFLITO",
        }
    }
}

impl fmt::Display for ErroOperacoes {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.codigo())
    }
}

impl Serialize for ErroOperacoes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.codigo())
    }
}

impl From<std::io::Error> for ErroOperacoes {
    fn from(_: std::io::Error) -> Self {
        ErroOperacoes::Indisponivel
    }
}

// ─── Formato v3 ──────────────────────────────────────────────────────────────────────────────────────────────────

pub const VERSAO_FORMATO: u64 = 3;
pub const TAMANHO_MAXIMO_CONTEUDO: usize = 2048;
pub const SUBDIRETORIO: &str = "operacoes-pendentes";
const CAMPOS: [&str; 7] = [
    "versao",
    "vendaId",
    "chave",
    "assinatura",
    "iniciadaEm",
    "gravadaEm",
    "estado",
];

/// `vendaId` aceito: o identificador do backend (ObjectId) com folga — 1 a 64 de `[A-Za-z0-9_-]`.
fn venda_id_valido(venda_id: &str) -> bool {
    (1..=64).contains(&venda_id.len())
        && venda_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// A mesma regra do TypeScript (`FORMATO_CHAVE`): 8 a 128 de `[A-Za-z0-9-]`.
fn chave_valida(chave: &str) -> bool {
    (8..=128).contains(&chave.len())
        && chave
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// Texto curto sem caracteres de controle (datas ISO e a assinatura canônica — esta é validada a fundo no TypeScript).
fn texto_valido(valor: &Value, maximo: usize) -> bool {
    matches!(valor.as_str(), Some(t) if !t.is_empty() && t.len() <= maximo && !t.chars().any(char::is_control))
}

/// Valida o conteúdo v3 para ESTA venda e devolve a `chave` da operação.
pub fn validar(venda_id: &str, conteudo: &str) -> Result<String, ErroOperacoes> {
    if conteudo.len() > TAMANHO_MAXIMO_CONTEUDO {
        return Err(ErroOperacoes::TamanhoExcedido);
    }
    let valor: Value =
        serde_json::from_str(conteudo).map_err(|_| ErroOperacoes::FormatoInvalido)?;
    let objeto: &Map<String, Value> = valor.as_object().ok_or(ErroOperacoes::FormatoInvalido)?;
    let campos_exatos =
        objeto.len() == CAMPOS.len() && CAMPOS.iter().all(|c| objeto.contains_key(*c));
    let estado_valido = matches!(objeto["estado"].as_str(), Some("em_andamento" | "incerta"));
    let ok = campos_exatos
        && objeto["versao"].as_u64() == Some(VERSAO_FORMATO)
        && objeto["vendaId"].as_str() == Some(venda_id)
        && objeto["chave"].as_str().is_some_and(chave_valida)
        && texto_valido(&objeto["assinatura"], 1024)
        && texto_valido(&objeto["iniciadaEm"], 40)
        && texto_valido(&objeto["gravadaEm"], 40)
        && estado_valido;
    if !ok {
        return Err(ErroOperacoes::FormatoInvalido);
    }
    Ok(objeto["chave"].as_str().unwrap_or_default().to_owned())
}

/// `chave` de um registro já gravado, ou `None` se ilegível (nunca é tratado como "ausente").
fn chave_do_registro(venda_id: &str, conteudo: &str) -> Option<String> {
    validar(venda_id, conteudo).ok()
}

/// Nome do arquivo: hexadecimal do `vendaId` (o NTFS não diferencia maiúsculas; o hex evita colisões).
pub fn nome_do_arquivo(venda_id: &str) -> String {
    let hex: String = venda_id.bytes().map(|b| format!("{b:02x}")).collect();
    format!("v-{hex}.json")
}

/// Diretório das operações para o diretório de dados do app — SOMENTE se ele for o da identidade vigente.
pub fn diretorio_para(dados_do_app: &Path, identifier: &str) -> Option<PathBuf> {
    let ultimo = dados_do_app.file_name()?.to_str()?;
    (ultimo == identifier).then(|| dados_do_app.join(SUBDIRETORIO))
}

// ─── Armazenamento em disco ──────────────────────────────────────────────────────────────────────────────────────

pub struct Armazenamento {
    diretorio: PathBuf,
}

impl Armazenamento {
    pub fn em(diretorio: PathBuf) -> Self {
        Armazenamento { diretorio }
    }

    fn caminho(&self, venda_id: &str) -> PathBuf {
        self.diretorio.join(nome_do_arquivo(venda_id))
    }

    fn ler_bruto(&self, venda_id: &str) -> Result<Option<String>, ErroOperacoes> {
        match fs::read(self.caminho(venda_id)) {
            // Conteúdo que não é UTF-8 é devolvido como texto inválido (o frontend o trata como ILEGÍVEL), nunca como
            // ausente.
            Ok(bytes) => Ok(Some(
                String::from_utf8(bytes).unwrap_or_else(|_| "\u{fffd}".to_owned()),
            )),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(_) => Err(ErroOperacoes::Indisponivel),
        }
    }

    pub fn ler(&self, venda_id: &str) -> Result<Option<String>, ErroOperacoes> {
        if !venda_id_valido(venda_id) {
            return Err(ErroOperacoes::FormatoInvalido);
        }
        self.ler_bruto(venda_id)
    }

    pub fn gravar(&self, venda_id: &str, conteudo: &str) -> Result<(), ErroOperacoes> {
        if !venda_id_valido(venda_id) {
            return Err(ErroOperacoes::FormatoInvalido);
        }
        let chave = validar(venda_id, conteudo)?;
        if let Some(existente) = self.ler_bruto(venda_id)? {
            // Outra operação (ou registro ilegível) nunca é substituída em silêncio.
            if chave_do_registro(venda_id, &existente).as_deref() != Some(chave.as_str()) {
                return Err(ErroOperacoes::Conflito);
            }
        }
        fs::create_dir_all(&self.diretorio)?;
        let definitivo = self.caminho(venda_id);
        let temporario = definitivo.with_extension("json.tmp");
        {
            let mut arquivo = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&temporario)?;
            arquivo.write_all(conteudo.as_bytes())?;
            arquivo.sync_all()?;
        }
        fs::rename(&temporario, &definitivo)?;
        // `sync_all` = `FlushFileBuffers`, que no Windows exige um handle com acesso de escrita.
        OpenOptions::new()
            .write(true)
            .open(&definitivo)?
            .sync_all()?;
        Ok(())
    }

    pub fn remover(&self, venda_id: &str, chave: Option<&str>) -> Result<(), ErroOperacoes> {
        if !venda_id_valido(venda_id) || chave.is_some_and(|c| !chave_valida(c)) {
            return Err(ErroOperacoes::FormatoInvalido);
        }
        let Some(existente) = self.ler_bruto(venda_id)? else {
            return Ok(());
        };
        if let Some(chave) = chave {
            if chave_do_registro(venda_id, &existente).as_deref() != Some(chave) {
                return Err(ErroOperacoes::Conflito);
            }
        }
        match fs::remove_file(self.caminho(venda_id)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err(ErroOperacoes::Indisponivel),
        }
    }
}

// ─── Serviço e comandos ──────────────────────────────────────────────────────────────────────────────────────────

/// Estado gerenciado pelo Tauri: `None` = armazenamento indisponível (diretório de dados ausente ou de outra
/// identidade). O `Mutex` serializa todas as operações do processo.
pub struct ServicoOperacoes(Mutex<Option<Armazenamento>>);

impl ServicoOperacoes {
    pub fn novo(dados_do_app: Option<PathBuf>, identifier: &str) -> Self {
        let armazenamento = dados_do_app
            .and_then(|d| diretorio_para(&d, identifier))
            .map(Armazenamento::em);
        ServicoOperacoes(Mutex::new(armazenamento))
    }

    fn com<T>(
        &self,
        f: impl FnOnce(&Armazenamento) -> Result<T, ErroOperacoes>,
    ) -> Result<T, ErroOperacoes> {
        let guarda = self.0.lock().map_err(|_| ErroOperacoes::Indisponivel)?;
        let armazenamento = guarda.as_ref().ok_or(ErroOperacoes::Indisponivel)?;
        f(armazenamento)
    }
}

#[tauri::command]
pub fn operacao_ler(
    servico: tauri::State<'_, ServicoOperacoes>,
    venda_id: String,
) -> Result<Option<String>, ErroOperacoes> {
    servico.com(|a| a.ler(&venda_id))
}

#[tauri::command]
pub fn operacao_gravar(
    servico: tauri::State<'_, ServicoOperacoes>,
    venda_id: String,
    conteudo: String,
) -> Result<(), ErroOperacoes> {
    servico.com(|a| a.gravar(&venda_id, &conteudo))
}

#[tauri::command]
pub fn operacao_remover(
    servico: tauri::State<'_, ServicoOperacoes>,
    venda_id: String,
    chave: Option<String>,
) -> Result<(), ErroOperacoes> {
    servico.com(|a| a.remover(&venda_id, chave.as_deref()))
}

// ─── Testes (diretório temporário próprio; nunca o diretório do app) ─────────────────────────────────────────────

#[cfg(test)]
mod testes {
    use super::*;
    use crate::identidades::{ISOLADO, OFICIAL};
    use std::time::{SystemTime, UNIX_EPOCH};

    const VENDA: &str = "665f1c2b9a1e4b0012345678";
    const CHAVE_A: &str = "11111111-1111-4111-8111-111111111111";
    const CHAVE_B: &str = "22222222-2222-4222-8222-222222222222";

    fn registro(venda: &str, chave: &str, estado: &str) -> String {
        serde_json::json!({
            "versao": 3, "vendaId": venda, "chave": chave,
            "assinatura": "{\"tipo\":\"integral\",\"itens\":[]}",
            "iniciadaEm": "2026-11-16T12:00:00.000Z", "gravadaEm": "2026-11-16T12:00:01.000Z", "estado": estado,
        })
        .to_string()
    }

    /// Diretório temporário exclusivo do teste, removido no fim.
    struct DirTemp(PathBuf);
    impl DirTemp {
        fn novo(nome: &str) -> Self {
            let n = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let d = std::env::temp_dir().join(format!(
                "mariela-teste-operacoes-{nome}-{}-{n}",
                std::process::id()
            ));
            DirTemp(d)
        }
        fn armazenamento(&self) -> Armazenamento {
            Armazenamento::em(self.0.join(SUBDIRETORIO))
        }
    }
    impl Drop for DirTemp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn grava_le_e_reabre_em_outra_instancia() {
        let d = DirTemp::novo("reabrir");
        d.armazenamento()
            .gravar(VENDA, &registro(VENDA, CHAVE_A, "em_andamento"))
            .unwrap();
        // "Fechar e reabrir": uma instância nova sobre o mesmo diretório.
        let lido = d.armazenamento().ler(VENDA).unwrap();
        assert_eq!(
            lido.as_deref(),
            Some(registro(VENDA, CHAVE_A, "em_andamento").as_str())
        );
        assert_eq!(d.armazenamento().ler("outra-venda").unwrap(), None);
    }

    #[test]
    fn mesma_operacao_atualiza_o_estado() {
        let d = DirTemp::novo("atualiza");
        let a = d.armazenamento();
        a.gravar(VENDA, &registro(VENDA, CHAVE_A, "em_andamento"))
            .unwrap();
        a.gravar(VENDA, &registro(VENDA, CHAVE_A, "incerta"))
            .unwrap();
        assert!(a.ler(VENDA).unwrap().unwrap().contains("\"incerta\""));
    }

    #[test]
    fn outra_operacao_nunca_substitui_em_silencio() {
        let d = DirTemp::novo("conflito");
        let a = d.armazenamento();
        a.gravar(VENDA, &registro(VENDA, CHAVE_A, "incerta"))
            .unwrap();
        assert_eq!(
            a.gravar(VENDA, &registro(VENDA, CHAVE_B, "em_andamento")),
            Err(ErroOperacoes::Conflito)
        );
        assert!(a.ler(VENDA).unwrap().unwrap().contains(CHAVE_A));
    }

    #[test]
    fn registro_ilegivel_nao_e_sobrescrito_e_so_sai_por_descarte_explicito() {
        let d = DirTemp::novo("ilegivel");
        let a = d.armazenamento();
        fs::create_dir_all(d.0.join(SUBDIRETORIO)).unwrap();
        fs::write(
            d.0.join(SUBDIRETORIO).join(nome_do_arquivo(VENDA)),
            b"{corrompido",
        )
        .unwrap();
        assert_eq!(a.ler(VENDA).unwrap().as_deref(), Some("{corrompido"));
        assert_eq!(
            a.gravar(VENDA, &registro(VENDA, CHAVE_A, "em_andamento")),
            Err(ErroOperacoes::Conflito)
        );
        assert_eq!(
            a.remover(VENDA, Some(CHAVE_A)),
            Err(ErroOperacoes::Conflito)
        );
        a.remover(VENDA, None).unwrap();
        assert_eq!(a.ler(VENDA).unwrap(), None);
    }

    #[test]
    fn registros_de_vendas_diferentes_sao_independentes() {
        let d = DirTemp::novo("independentes");
        let a = d.armazenamento();
        a.gravar(VENDA, &registro(VENDA, CHAVE_A, "incerta"))
            .unwrap();
        a.gravar("venda-b", &registro("venda-b", CHAVE_B, "incerta"))
            .unwrap();
        fs::write(
            d.0.join(SUBDIRETORIO).join(nome_do_arquivo("venda-c")),
            b"lixo",
        )
        .unwrap();
        a.remover(VENDA, Some(CHAVE_A)).unwrap();
        assert_eq!(a.ler(VENDA).unwrap(), None);
        assert!(a.ler("venda-b").unwrap().unwrap().contains(CHAVE_B));
        assert_eq!(a.ler("venda-c").unwrap().as_deref(), Some("lixo"));
    }

    #[test]
    fn remover_exige_a_mesma_operacao_e_e_idempotente() {
        let d = DirTemp::novo("remover");
        let a = d.armazenamento();
        a.remover(VENDA, Some(CHAVE_A)).unwrap(); // ausente: sucesso
        a.gravar(VENDA, &registro(VENDA, CHAVE_A, "incerta"))
            .unwrap();
        assert_eq!(
            a.remover(VENDA, Some(CHAVE_B)),
            Err(ErroOperacoes::Conflito)
        );
        assert!(a.ler(VENDA).unwrap().is_some());
        a.remover(VENDA, Some(CHAVE_A)).unwrap();
        assert_eq!(a.ler(VENDA).unwrap(), None);
    }

    #[test]
    fn encerramento_no_meio_da_gravacao_preserva_o_registro_anterior() {
        let d = DirTemp::novo("queda");
        let a = d.armazenamento();
        a.gravar(VENDA, &registro(VENDA, CHAVE_A, "em_andamento"))
            .unwrap();
        // Simula a queda depois de escrever o temporário e antes de renomear: temporário truncado no disco.
        let temporario =
            d.0.join(SUBDIRETORIO)
                .join(nome_do_arquivo(VENDA))
                .with_extension("json.tmp");
        fs::write(&temporario, b"{\"versao\":3,\"vend").unwrap();
        // Reabertura: lê o registro anterior, íntegro; o temporário é ignorado e sobrescrito na próxima gravação.
        let reaberto = d.armazenamento();
        assert_eq!(
            reaberto.ler(VENDA).unwrap().as_deref(),
            Some(registro(VENDA, CHAVE_A, "em_andamento").as_str())
        );
        reaberto
            .gravar(VENDA, &registro(VENDA, CHAVE_A, "incerta"))
            .unwrap();
        assert!(!temporario.exists());
        assert!(reaberto
            .ler(VENDA)
            .unwrap()
            .unwrap()
            .contains("\"incerta\""));
    }

    #[test]
    fn conteudo_invalido_e_recusado_antes_de_tocar_no_disco() {
        let d = DirTemp::novo("invalido");
        let a = d.armazenamento();
        let mut com_token: Value =
            serde_json::from_str(&registro(VENDA, CHAVE_A, "incerta")).unwrap();
        com_token["accessToken"] = Value::from("eyJ.fake.token");
        let mut outra_venda: Value =
            serde_json::from_str(&registro(VENDA, CHAVE_A, "incerta")).unwrap();
        outra_venda["vendaId"] = Value::from("outra");
        for (conteudo, erro) in [
            ("nao-json".to_owned(), ErroOperacoes::FormatoInvalido),
            (com_token.to_string(), ErroOperacoes::FormatoInvalido), // campo extra (ex.: token) recusado
            (outra_venda.to_string(), ErroOperacoes::FormatoInvalido),
            (
                registro(VENDA, "curta", "incerta"),
                ErroOperacoes::FormatoInvalido,
            ),
            (
                registro(VENDA, CHAVE_A, "concluida"),
                ErroOperacoes::FormatoInvalido,
            ),
            (
                "x".repeat(TAMANHO_MAXIMO_CONTEUDO + 1),
                ErroOperacoes::TamanhoExcedido,
            ),
        ] {
            assert_eq!(a.gravar(VENDA, &conteudo), Err(erro));
        }
        assert!(!d.0.exists(), "nada pode ter sido criado no disco");
        for invalido in ["", "../x", "a/b", "a\\b", "a.b", &"a".repeat(65)] {
            assert_eq!(a.ler(invalido), Err(ErroOperacoes::FormatoInvalido));
        }
    }

    #[test]
    fn nome_do_arquivo_nao_colide_entre_maiusculas_e_minusculas() {
        assert_ne!(nome_do_arquivo("abc"), nome_do_arquivo("ABC"));
        assert_eq!(nome_do_arquivo("ab"), "v-6162.json");
    }

    #[test]
    fn diretorio_so_existe_para_a_identidade_vigente_e_separa_oficial_de_isolado() {
        let base = PathBuf::from(r"C:\Users\x\AppData\Local");
        let oficial = diretorio_para(&base.join(OFICIAL.identifier), OFICIAL.identifier).unwrap();
        let isolado = diretorio_para(&base.join(ISOLADO.identifier), ISOLADO.identifier).unwrap();
        assert_ne!(oficial, isolado);
        assert!(oficial.ends_with(r"com.mariela.backoffice\operacoes-pendentes"));
        // Diretório de dados de OUTRA identidade: indisponível (falha fechada).
        assert_eq!(
            diretorio_para(&base.join(OFICIAL.identifier), ISOLADO.identifier),
            None
        );
        assert_eq!(
            diretorio_para(&base.join(ISOLADO.identifier), OFICIAL.identifier),
            None
        );
        let servico =
            ServicoOperacoes::novo(Some(base.join(OFICIAL.identifier)), ISOLADO.identifier);
        assert_eq!(
            servico.com(|a| a.ler(VENDA)),
            Err(ErroOperacoes::Indisponivel)
        );
        assert_eq!(
            ServicoOperacoes::novo(None, OFICIAL.identifier).com(|a| a.ler(VENDA)),
            Err(ErroOperacoes::Indisponivel)
        );
    }

    #[test]
    fn erros_sao_so_codigos() {
        assert_eq!(
            serde_json::to_string(&ErroOperacoes::Conflito).unwrap(),
            "\"CONFLITO\""
        );
        assert_eq!(ErroOperacoes::Indisponivel.to_string(), "INDISPONIVEL");
    }
}
