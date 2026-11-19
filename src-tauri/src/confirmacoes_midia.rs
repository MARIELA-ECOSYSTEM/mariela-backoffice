//! Fase 22.8.9.9.3 — armazenamento DURÁVEL das confirmações de upload de mídia ainda não concluídas.
//!
//! Mesmo padrão da Fase 22.8.9.5 (`operacoes.rs`: um arquivo por registro, gravação atômica com `fsync`, diretório
//! da identidade vigente), mas um armazenamento SEPARADO: outro diretório, outros comandos, outra capability. Nada
//! aqui lê ou altera os registros de cancelamento/devolução, e nada toca no Credential Manager.
//!
//! ## Onde
//! `%LOCALAPPDATA%\<identifier>\confirmacoes-midia\c-<hex do uploadId>.json` — um arquivo por `uploadId` (a
//! identidade idempotente da confirmação no backend), então pendências do mesmo produto são independentes. Diretório
//! de outra identidade = INDISPONÍVEL (falha fechada).
//!
//! ## Contrato
//! - `midia_confirmacao_listar() -> [{ uploadId, conteudo }]` — todos os registros como gravados; arquivos de nome
//!   inválido são ignorados; o conteúdo ilegível é devolvido assim mesmo (o frontend o mostra como corrompido e só o
//!   descarte explícito o remove).
//! - `midia_confirmacao_gravar({ uploadId, conteudo })` — grava se não houver registro, ou se o existente for da MESMA
//!   operação (mesmos `produtoId`, `kind` e `confirmacao`); só o `estado` pode mudar. Outro conteúdo ou registro
//!   ilegível: `CONFLITO`, nada muda.
//! - `midia_confirmacao_remover({ uploadId })` — remove só o arquivo desse `uploadId`; ausente = sucesso.
//! - Erros: os mesmos códigos de `operacoes.rs` (`INDISPONIVEL`, `FORMATO_INVALIDO`, `TAMANHO_EXCEDIDO`, `CONFLITO`).
//!
//! ## Formato v1 (JSON, no máximo 1.024 bytes; exatamente estes campos)
//! ```json
//! { "versao": 1, "produtoId": "…", "uploadId": "…", "kind": "image" | "video",
//!   "confirmacao": { "varianteId"?: "…", "principal"?: true, "substituiMidiaId"?: "…" },
//!   "estado": "confirmando" | "pendente", "criadoEm": "<ISO>" }
//! ```
//! Campos desconhecidos são recusados — não há onde caber URL assinada, token, credencial ou o arquivo.

use crate::operacoes::ErroOperacoes;
use serde::Serialize;
use serde_json::{Map, Value};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const VERSAO_FORMATO: u64 = 1;
pub const TAMANHO_MAXIMO_CONTEUDO: usize = 1024;
pub const SUBDIRETORIO: &str = "confirmacoes-midia";
const CAMPOS: [&str; 7] = [
    "versao",
    "produtoId",
    "uploadId",
    "kind",
    "confirmacao",
    "estado",
    "criadoEm",
];
const CAMPOS_CONFIRMACAO: [&str; 3] = ["varianteId", "principal", "substituiMidiaId"];

/// Identificadores do backend (ObjectId, UUID) e do mock (`upl_12`): 1 a 64 de `[A-Za-z0-9_-]`.
fn id_valido(id: &str) -> bool {
    (1..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn data_valida(valor: &Value) -> bool {
    matches!(valor.as_str(), Some(t) if (1..=40).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_alphanumeric() || b"-:.+Z".contains(&b)))
}

fn confirmacao_valida(valor: &Value) -> bool {
    let Some(objeto) = valor.as_object() else {
        return false;
    };
    objeto
        .keys()
        .all(|k| CAMPOS_CONFIRMACAO.contains(&k.as_str()))
        && objeto
            .get("varianteId")
            .map_or(true, |v| v.as_str().is_some_and(id_valido))
        && objeto
            .get("substituiMidiaId")
            .map_or(true, |v| v.as_str().is_some_and(id_valido))
        && objeto.get("principal").map_or(true, Value::is_boolean)
}

/// Valida o conteúdo v1 para ESTE `uploadId` e devolve o objeto.
pub fn validar(upload_id: &str, conteudo: &str) -> Result<Map<String, Value>, ErroOperacoes> {
    if conteudo.len() > TAMANHO_MAXIMO_CONTEUDO {
        return Err(ErroOperacoes::TamanhoExcedido);
    }
    let valor: Value =
        serde_json::from_str(conteudo).map_err(|_| ErroOperacoes::FormatoInvalido)?;
    let Value::Object(objeto) = valor else {
        return Err(ErroOperacoes::FormatoInvalido);
    };
    let ok = objeto.len() == CAMPOS.len()
        && CAMPOS.iter().all(|c| objeto.contains_key(*c))
        && objeto["versao"].as_u64() == Some(VERSAO_FORMATO)
        && objeto["uploadId"].as_str() == Some(upload_id)
        && objeto["produtoId"].as_str().is_some_and(id_valido)
        && matches!(objeto["kind"].as_str(), Some("image" | "video"))
        && confirmacao_valida(&objeto["confirmacao"])
        && matches!(objeto["estado"].as_str(), Some("confirmando" | "pendente"))
        && data_valida(&objeto["criadoEm"]);
    if ok {
        Ok(objeto)
    } else {
        Err(ErroOperacoes::FormatoInvalido)
    }
}

/// Mesma operação = mesmo produto, tipo, corpo da confirmação e criação (só o `estado` pode mudar).
fn mesma_operacao(a: &Map<String, Value>, b: &Map<String, Value>) -> bool {
    ["produtoId", "kind", "confirmacao", "criadoEm"]
        .iter()
        .all(|c| a.get(*c) == b.get(*c))
}

pub fn nome_do_arquivo(upload_id: &str) -> String {
    let hex: String = upload_id.bytes().map(|b| format!("{b:02x}")).collect();
    format!("c-{hex}.json")
}

/// `uploadId` a partir do nome do arquivo (`None` se o nome não for de um registro válido).
fn upload_id_do_arquivo(nome: &str) -> Option<String> {
    let hex = nome.strip_prefix("c-")?.strip_suffix(".json")?;
    if hex.is_empty() || hex.len() % 2 != 0 {
        return None;
    }
    let bytes: Option<Vec<u8>> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect();
    let id = String::from_utf8(bytes?).ok()?;
    id_valido(&id).then_some(id)
}

/// Diretório das confirmações para o diretório de dados do app — SOMENTE se ele for o da identidade vigente.
pub fn diretorio_para(dados_do_app: &Path, identifier: &str) -> Option<PathBuf> {
    let ultimo = dados_do_app.file_name()?.to_str()?;
    (ultimo == identifier).then(|| dados_do_app.join(SUBDIRETORIO))
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RegistroListado {
    pub upload_id: String,
    pub conteudo: String,
}

pub struct Armazenamento {
    diretorio: PathBuf,
}

impl Armazenamento {
    pub fn em(diretorio: PathBuf) -> Self {
        Armazenamento { diretorio }
    }

    fn caminho(&self, upload_id: &str) -> PathBuf {
        self.diretorio.join(nome_do_arquivo(upload_id))
    }

    fn ler_bruto(&self, upload_id: &str) -> Result<Option<String>, ErroOperacoes> {
        match fs::read(self.caminho(upload_id)) {
            Ok(bytes) => Ok(Some(
                String::from_utf8(bytes).unwrap_or_else(|_| "\u{fffd}".to_owned()),
            )),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
            Err(_) => Err(ErroOperacoes::Indisponivel),
        }
    }

    pub fn listar(&self) -> Result<Vec<RegistroListado>, ErroOperacoes> {
        let entradas = match fs::read_dir(&self.diretorio) {
            Ok(e) => e,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(_) => return Err(ErroOperacoes::Indisponivel),
        };
        let mut registros = Vec::new();
        for entrada in entradas.flatten() {
            let nome = entrada.file_name();
            let Some(upload_id) = nome.to_str().and_then(upload_id_do_arquivo) else {
                continue; // temporários (`.tmp`) e arquivos alheios
            };
            if let Some(conteudo) = self.ler_bruto(&upload_id)? {
                registros.push(RegistroListado {
                    upload_id,
                    conteudo,
                });
            }
        }
        registros.sort_by(|a, b| a.upload_id.cmp(&b.upload_id));
        Ok(registros)
    }

    pub fn gravar(&self, upload_id: &str, conteudo: &str) -> Result<(), ErroOperacoes> {
        if !id_valido(upload_id) {
            return Err(ErroOperacoes::FormatoInvalido);
        }
        let novo = validar(upload_id, conteudo)?;
        if let Some(existente) = self.ler_bruto(upload_id)? {
            let igual = validar(upload_id, &existente)
                .map(|antigo| mesma_operacao(&antigo, &novo))
                .unwrap_or(false);
            if !igual {
                return Err(ErroOperacoes::Conflito);
            }
        }
        fs::create_dir_all(&self.diretorio)?;
        let definitivo = self.caminho(upload_id);
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

    pub fn remover(&self, upload_id: &str) -> Result<(), ErroOperacoes> {
        if !id_valido(upload_id) {
            return Err(ErroOperacoes::FormatoInvalido);
        }
        match fs::remove_file(self.caminho(upload_id)) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err(ErroOperacoes::Indisponivel),
        }
    }
}

/// Estado gerenciado pelo Tauri: `None` = indisponível. O `Mutex` serializa as operações do processo.
pub struct ServicoConfirmacoesMidia(Mutex<Option<Armazenamento>>);

impl ServicoConfirmacoesMidia {
    pub fn novo(dados_do_app: Option<PathBuf>, identifier: &str) -> Self {
        let armazenamento = dados_do_app
            .and_then(|d| diretorio_para(&d, identifier))
            .map(Armazenamento::em);
        ServicoConfirmacoesMidia(Mutex::new(armazenamento))
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
pub fn midia_confirmacao_listar(
    servico: tauri::State<'_, ServicoConfirmacoesMidia>,
) -> Result<Vec<RegistroListado>, ErroOperacoes> {
    servico.com(|a| a.listar())
}

#[tauri::command]
pub fn midia_confirmacao_gravar(
    servico: tauri::State<'_, ServicoConfirmacoesMidia>,
    upload_id: String,
    conteudo: String,
) -> Result<(), ErroOperacoes> {
    servico.com(|a| a.gravar(&upload_id, &conteudo))
}

#[tauri::command]
pub fn midia_confirmacao_remover(
    servico: tauri::State<'_, ServicoConfirmacoesMidia>,
    upload_id: String,
) -> Result<(), ErroOperacoes> {
    servico.com(|a| a.remover(&upload_id))
}

// ─── Testes (diretório temporário próprio; nunca o diretório do app) ─────────────────────────────────────────────

#[cfg(test)]
mod testes {
    use super::*;
    use crate::identidades::{ISOLADO, OFICIAL};
    use std::time::{SystemTime, UNIX_EPOCH};

    const PRODUTO: &str = "665f1c2b9a1e4b0012345678";
    const UPLOAD_A: &str = "0f8b4c2e-1d3a-4b5c-8e9f-112233445566";
    const UPLOAD_B: &str = "1f8b4c2e-1d3a-4b5c-8e9f-112233445566";

    fn registro(upload: &str, estado: &str) -> String {
        serde_json::json!({
            "versao": 1, "produtoId": PRODUTO, "uploadId": upload, "kind": "image",
            "confirmacao": { "principal": true }, "estado": estado, "criadoEm": "2026-11-19T12:00:00.000Z",
        })
        .to_string()
    }

    struct DirTemp(PathBuf);
    impl DirTemp {
        fn novo(nome: &str) -> Self {
            let n = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            DirTemp(std::env::temp_dir().join(format!(
                "mariela-teste-confirmacoes-{nome}-{}-{n}",
                std::process::id()
            )))
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
    fn grava_lista_e_reabre_em_outra_instancia() {
        let d = DirTemp::novo("reabrir");
        assert_eq!(d.armazenamento().listar().unwrap(), vec![]);
        d.armazenamento()
            .gravar(UPLOAD_A, &registro(UPLOAD_A, "confirmando"))
            .unwrap();
        let lidos = d.armazenamento().listar().unwrap();
        assert_eq!(
            lidos,
            vec![RegistroListado {
                upload_id: UPLOAD_A.into(),
                conteudo: registro(UPLOAD_A, "confirmando")
            }]
        );
    }

    #[test]
    fn mesma_operacao_so_muda_o_estado_e_outra_operacao_e_conflito() {
        let d = DirTemp::novo("conflito");
        let a = d.armazenamento();
        a.gravar(UPLOAD_A, &registro(UPLOAD_A, "confirmando"))
            .unwrap();
        a.gravar(UPLOAD_A, &registro(UPLOAD_A, "pendente")).unwrap();
        let mut outro: Value = serde_json::from_str(&registro(UPLOAD_A, "pendente")).unwrap();
        outro["confirmacao"] = serde_json::json!({ "principal": false });
        assert_eq!(
            a.gravar(UPLOAD_A, &outro.to_string()),
            Err(ErroOperacoes::Conflito)
        );
        assert!(a.listar().unwrap()[0].conteudo.contains("\"pendente\""));
    }

    #[test]
    fn corrompido_e_listado_nao_e_sobrescrito_e_nao_afeta_os_demais() {
        let d = DirTemp::novo("corrompido");
        let a = d.armazenamento();
        a.gravar(UPLOAD_B, &registro(UPLOAD_B, "pendente")).unwrap();
        fs::write(
            d.0.join(SUBDIRETORIO).join(nome_do_arquivo(UPLOAD_A)),
            b"{lixo",
        )
        .unwrap();
        fs::write(d.0.join(SUBDIRETORIO).join("qualquer.txt"), b"x").unwrap();
        fs::write(
            d.0.join(SUBDIRETORIO)
                .join(nome_do_arquivo(UPLOAD_A))
                .with_extension("json.tmp"),
            b"{\"versao\":1",
        )
        .unwrap();
        let lidos = a.listar().unwrap();
        assert_eq!(lidos.len(), 2);
        assert_eq!(lidos[0].conteudo, "{lixo");
        assert!(lidos[1].conteudo.contains(UPLOAD_B));
        assert_eq!(
            a.gravar(UPLOAD_A, &registro(UPLOAD_A, "confirmando")),
            Err(ErroOperacoes::Conflito)
        );
        a.remover(UPLOAD_A).unwrap();
        assert_eq!(a.listar().unwrap().len(), 1);
    }

    #[test]
    fn remover_so_o_proprio_upload_e_idempotente() {
        let d = DirTemp::novo("remover");
        let a = d.armazenamento();
        a.gravar(UPLOAD_A, &registro(UPLOAD_A, "pendente")).unwrap();
        a.gravar(UPLOAD_B, &registro(UPLOAD_B, "pendente")).unwrap();
        a.remover(UPLOAD_A).unwrap();
        a.remover(UPLOAD_A).unwrap();
        let ids: Vec<_> = a
            .listar()
            .unwrap()
            .into_iter()
            .map(|r| r.upload_id)
            .collect();
        assert_eq!(ids, vec![UPLOAD_B.to_owned()]);
    }

    #[test]
    fn queda_no_meio_da_gravacao_preserva_o_anterior() {
        let d = DirTemp::novo("queda");
        let a = d.armazenamento();
        a.gravar(UPLOAD_A, &registro(UPLOAD_A, "confirmando"))
            .unwrap();
        let tmp =
            d.0.join(SUBDIRETORIO)
                .join(nome_do_arquivo(UPLOAD_A))
                .with_extension("json.tmp");
        fs::write(&tmp, b"{\"versao\":1,\"prod").unwrap();
        let reaberto = d.armazenamento();
        assert_eq!(
            reaberto.listar().unwrap()[0].conteudo,
            registro(UPLOAD_A, "confirmando")
        );
        reaberto
            .gravar(UPLOAD_A, &registro(UPLOAD_A, "pendente"))
            .unwrap();
        assert!(!tmp.exists());
    }

    #[test]
    fn conteudo_proibido_e_recusado_antes_de_tocar_no_disco() {
        let d = DirTemp::novo("invalido");
        let a = d.armazenamento();
        let base: Value = serde_json::from_str(&registro(UPLOAD_A, "pendente")).unwrap();
        let mut com_url = base.clone();
        com_url["uploadUrl"] =
            Value::from("https://conta.r2.cloudflarestorage.com/x?X-Amz-Signature=y");
        let mut com_token = base.clone();
        com_token["confirmacao"]["authorization"] = Value::from("Bearer eyJ.a.b");
        let mut outro_upload = base.clone();
        outro_upload["uploadId"] = Value::from(UPLOAD_B);
        let mut estado_ruim = base.clone();
        estado_ruim["estado"] = Value::from("confirmado");
        for (conteudo, erro) in [
            (com_url.to_string(), ErroOperacoes::FormatoInvalido),
            (com_token.to_string(), ErroOperacoes::FormatoInvalido),
            (outro_upload.to_string(), ErroOperacoes::FormatoInvalido),
            (estado_ruim.to_string(), ErroOperacoes::FormatoInvalido),
            (
                "x".repeat(TAMANHO_MAXIMO_CONTEUDO + 1),
                ErroOperacoes::TamanhoExcedido,
            ),
        ] {
            assert_eq!(a.gravar(UPLOAD_A, &conteudo), Err(erro));
        }
        for invalido in ["", "../x", "a/b", "a.b", &"a".repeat(65)] {
            assert_eq!(a.remover(invalido), Err(ErroOperacoes::FormatoInvalido));
        }
        assert!(!d.0.exists(), "nada pode ter sido criado no disco");
    }

    #[test]
    fn nome_do_arquivo_e_reversivel_e_sem_colisao_de_caixa() {
        assert_eq!(
            upload_id_do_arquivo(&nome_do_arquivo(UPLOAD_A)).as_deref(),
            Some(UPLOAD_A)
        );
        assert_ne!(nome_do_arquivo("abc"), nome_do_arquivo("ABC"));
        assert_eq!(upload_id_do_arquivo("c-.json"), None);
        assert_eq!(upload_id_do_arquivo("c-2e2e2f78.json"), None); // "../x"
        assert_eq!(upload_id_do_arquivo("v-6162.json"), None); // arquivo de operações de cancelamento
    }

    #[test]
    fn diretorio_separado_por_identidade_e_dos_cancelamentos() {
        let base = PathBuf::from(r"C:\Users\x\AppData\Local");
        let oficial = diretorio_para(&base.join(OFICIAL.identifier), OFICIAL.identifier).unwrap();
        let isolado = diretorio_para(&base.join(ISOLADO.identifier), ISOLADO.identifier).unwrap();
        assert_ne!(oficial, isolado);
        assert!(oficial.ends_with(r"com.mariela.backoffice\confirmacoes-midia"));
        assert_ne!(
            oficial,
            crate::operacoes::diretorio_para(&base.join(OFICIAL.identifier), OFICIAL.identifier)
                .unwrap()
        );
        assert_eq!(
            diretorio_para(&base.join(OFICIAL.identifier), ISOLADO.identifier),
            None
        );
        let servico =
            ServicoConfirmacoesMidia::novo(Some(base.join(OFICIAL.identifier)), ISOLADO.identifier);
        assert_eq!(
            servico.com(|a| a.listar()),
            Err(ErroOperacoes::Indisponivel)
        );
    }
}
