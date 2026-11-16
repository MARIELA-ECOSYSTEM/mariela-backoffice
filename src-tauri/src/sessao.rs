//! Fase 22.8.8.2 (M2) — armazenamento nativo da SESSÃO administrativa: validação estrita do formato v1, controle de
//! sequência e serialização das operações sobre o [`Cofre`], expostos ao frontend por três comandos Tauri.
//!
//! Nesta fase NADA no frontend chama estes comandos (a ligação com o TypeScript é da fase M4).
//!
//! ## Contrato
//! - `sessao_carregar() -> { conteudo: string | null, seq: number }`
//! - `sessao_gravar({ conteudo, seq })`
//! - `sessao_apagar({ seq })`
//! - Erros: SOMENTE os códigos `COFRE_INDISPONIVEL`, `FORMATO_INVALIDO`, `GRAVACAO_OBSOLETA`, `TAMANHO_EXCEDIDO`.
//!   Nunca mensagens do Windows, nunca trechos do conteúdo.
//!
//! ## Sequência (`seq`)
//! - Escopo: o PROCESSO do aplicativo. Começa em 0 a cada abertura e não é persistido.
//! - `sessao_carregar` devolve o `seq` vigente; o frontend continua a partir dele (inclusive após recarregar a página
//!   dentro do mesmo processo, quando o contador do JavaScript recomeça).
//! - `gravar`/`apagar` exigem `seq` ESTRITAMENTE maior que o último aceito; senão `GRAVACAO_OBSOLETA` e nada muda.
//! - O `seq` é consumido quando a operação é tentada no cofre — mesmo que o Windows falhe. Assim, uma operação mais
//!   antiga que chegue depois nunca prevalece sobre uma mais nova, nem quando a mais nova falhou (a credencial fica
//!   como estava; o frontend repete com um `seq` novo). Conteúdo inválido ou grande demais é recusado ANTES e não
//!   consome `seq`.
//! - Um único `Mutex` guarda o `seq` E serializa o acesso ao cofre: duas operações nunca se intercalam.
//!   (Isto não impede DUAS INSTÂNCIAS do app — o mutex nomeado de instância única é da fase M4.)
//!
//! ## Formato v1 (JSON UTF-8, no máximo 2.560 bytes)
//! ```json
//! { "v": 1, "accessToken": "…", "refreshToken": "…", "expiresAt": 1700000000000,
//!   "pendencia": null | { "vinculo": "<64 hex>", "chave": "<uuid>", "criadaEm": "2026-11-14T12:00:00.000Z" } }
//! ```
//! Todos os cinco campos são obrigatórios (`pendencia` pode ser `null`); campos desconhecidos são recusados.

use crate::cofre::{Cofre, FalhaCofre, TAMANHO_MAXIMO_CONTEUDO};
use serde::{Serialize, Serializer};
use serde_json::{Map, Value};
use std::fmt;
use std::sync::Mutex;

/// Erros expostos ao frontend — só códigos estáveis, sem nenhum dado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErroSessao {
    CofreIndisponivel,
    FormatoInvalido,
    GravacaoObsoleta,
    TamanhoExcedido,
}

impl ErroSessao {
    pub fn codigo(self) -> &'static str {
        match self {
            ErroSessao::CofreIndisponivel => "COFRE_INDISPONIVEL",
            ErroSessao::FormatoInvalido => "FORMATO_INVALIDO",
            ErroSessao::GravacaoObsoleta => "GRAVACAO_OBSOLETA",
            ErroSessao::TamanhoExcedido => "TAMANHO_EXCEDIDO",
        }
    }
}

impl fmt::Display for ErroSessao {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.codigo())
    }
}

/// Serializado para o frontend como a string do código (ex.: `"FORMATO_INVALIDO"`).
impl Serialize for ErroSessao {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.codigo())
    }
}

impl From<FalhaCofre> for ErroSessao {
    fn from(_: FalhaCofre) -> Self {
        ErroSessao::CofreIndisponivel
    }
}

/// Resposta de `sessao_carregar`. Sem `Debug` de propósito: contém tokens.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessaoCarregada {
    pub conteudo: Option<String>,
    pub seq: u64,
}

// ─── Validação do formato v1 ─────────────────────────────────────────────────────────────────────────────────────

const VERSAO_FORMATO: u64 = 1;
const CAMPOS_SESSAO: [&str; 5] = ["v", "accessToken", "refreshToken", "expiresAt", "pendencia"];
const CAMPOS_PENDENCIA: [&str; 3] = ["vinculo", "chave", "criadaEm"];
/// 01/01/3000 em milissegundos — teto de plausibilidade para `expiresAt`.
const EXPIRA_EM_MAXIMO: u64 = 32_503_680_000_000;

/// O objeto tem exatamente estes campos — nem a menos, nem a mais.
fn campos_exatos(objeto: &Map<String, Value>, esperados: &[&str]) -> bool {
    objeto.len() == esperados.len() && esperados.iter().all(|c| objeto.contains_key(*c))
}

/// Access token: o JWT do backend (base64url em três partes). O alfabeto aceito é um pouco mais amplo (inclui `.`,
/// `~`, `+`, `/`, `=`), mas sem espaços, controles ou aspas.
fn access_token_valido(valor: &Value) -> bool {
    match valor.as_str() {
        Some(t) => {
            (1..=2048).contains(&t.len())
                && t.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.~+/=".contains(&b))
        }
        None => false,
    }
}

/// Refresh token: opaco, base64url (32 bytes → 43 caracteres no backend atual); aceita de 16 a 512.
fn refresh_token_valido(valor: &Value) -> bool {
    match valor.as_str() {
        Some(t) => {
            (16..=512).contains(&t.len())
                && t.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        }
        None => false,
    }
}

fn hex_minusculo(texto: &str, tamanho: usize) -> bool {
    texto.len() == tamanho
        && texto
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// UUID canônico em minúsculas (versões 1–8, variante 10xx) — o mesmo formato aceito pelo backend e pelo TypeScript.
fn uuid_valido(texto: &str) -> bool {
    let b = texto.as_bytes();
    if b.len() != 36 || b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return false;
    }
    let partes_hex = [
        &texto[0..8],
        &texto[9..13],
        &texto[14..18],
        &texto[19..23],
        &texto[24..36],
    ];
    partes_hex.iter().all(|p| {
        p.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    }) && (b'1'..=b'8').contains(&b[14])
        && b"89ab".contains(&b[19])
}

/// ISO 8601 em UTC no formato de `Date.prototype.toISOString()`: `AAAA-MM-DDTHH:MM:SS(.sss)?Z`.
fn data_iso_valida(texto: &str) -> bool {
    let b = texto.as_bytes();
    let estrutura = match b.len() {
        20 => b[19] == b'Z',
        24 => b[19] == b'.' && b[20..23].iter().all(u8::is_ascii_digit) && b[23] == b'Z',
        _ => false,
    };
    let digitos = [0usize, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18];
    estrutura
        && b[4] == b'-'
        && b[7] == b'-'
        && b[10] == b'T'
        && b[13] == b':'
        && b[16] == b':'
        && digitos.iter().all(|&i| b[i].is_ascii_digit())
}

fn pendencia_valida(valor: &Value) -> bool {
    match valor {
        Value::Null => true,
        Value::Object(p) => {
            campos_exatos(p, &CAMPOS_PENDENCIA)
                && p["vinculo"].as_str().is_some_and(|v| hex_minusculo(v, 64))
                && p["chave"].as_str().is_some_and(uuid_valido)
                && p["criadaEm"].as_str().is_some_and(data_iso_valida)
        }
        _ => false,
    }
}

/// Valida o conteúdo completo. Tamanho primeiro (antes de qualquer parse). Nenhum erro carrega o conteúdo.
pub fn validar_conteudo(conteudo: &str) -> Result<(), ErroSessao> {
    if conteudo.len() > TAMANHO_MAXIMO_CONTEUDO {
        return Err(ErroSessao::TamanhoExcedido);
    }
    let valor: Value = serde_json::from_str(conteudo).map_err(|_| ErroSessao::FormatoInvalido)?;
    let objeto = valor.as_object().ok_or(ErroSessao::FormatoInvalido)?;
    let valido = campos_exatos(objeto, &CAMPOS_SESSAO)
        && objeto["v"].as_u64() == Some(VERSAO_FORMATO)
        && access_token_valido(&objeto["accessToken"])
        && refresh_token_valido(&objeto["refreshToken"])
        && objeto["expiresAt"]
            .as_u64()
            .is_some_and(|e| e <= EXPIRA_EM_MAXIMO)
        && pendencia_valida(&objeto["pendencia"]);
    if valido {
        Ok(())
    } else {
        Err(ErroSessao::FormatoInvalido)
    }
}

// ─── Serviço ─────────────────────────────────────────────────────────────────────────────────────────────────────

/// Estado gerenciado pelo Tauri. O `Mutex` protege o último `seq` aceito e é mantido durante toda a operação no
/// cofre, serializando leitura/gravação/exclusão.
pub struct ServicoSessao {
    cofre: Box<dyn Cofre>,
    ultimo_seq: Mutex<u64>,
}

impl ServicoSessao {
    pub fn com_cofre(cofre: Box<dyn Cofre>) -> Self {
        Self {
            cofre,
            ultimo_seq: Mutex::new(0),
        }
    }

    /// Cofre nativo da plataforma: Credential Manager no Windows; indisponível nas demais (sem alternativa silenciosa).
    pub fn nativo() -> Self {
        #[cfg(windows)]
        let cofre: Box<dyn Cofre> = Box::new(crate::cofre::CofreWindows::sessao());
        // Fase 22.8.8.8.2 (M8.2): SÓ no ambiente isolado, o cofre passa pelo injetor de falhas (controle no diretório
        // isolado). No build oficial esta linha não existe.
        #[cfg(all(windows, feature = "ambiente-isolado"))]
        let cofre: Box<dyn Cofre> = Box::new(crate::injetor_falhas::CofreComFalhas::novo(
            cofre,
            crate::injetor_falhas::caminho_controle(),
        ));
        #[cfg(not(windows))]
        let cofre: Box<dyn Cofre> = Box::new(crate::cofre::CofreIndisponivel);
        Self::com_cofre(cofre)
    }

    /// Um `Mutex` envenenado (pânico em outra thread) não pode travar a sessão: o `u64` interno continua consistente,
    /// então o guard é recuperado.
    fn travar(&self) -> std::sync::MutexGuard<'_, u64> {
        self.ultimo_seq
            .lock()
            .unwrap_or_else(|envenenado| envenenado.into_inner())
    }

    pub fn carregar(&self) -> Result<SessaoCarregada, ErroSessao> {
        let ultimo = self.travar();
        let conteudo = match self.cofre.ler()? {
            None => None,
            Some(bytes) => {
                if bytes.len() > TAMANHO_MAXIMO_CONTEUDO {
                    return Err(ErroSessao::FormatoInvalido);
                }
                let texto = String::from_utf8(bytes).map_err(|_| ErroSessao::FormatoInvalido)?;
                validar_conteudo(&texto)?;
                Some(texto)
            }
        };
        Ok(SessaoCarregada {
            conteudo,
            seq: *ultimo,
        })
    }

    pub fn gravar(&self, conteudo: String, seq: u64) -> Result<(), ErroSessao> {
        validar_conteudo(&conteudo)?;
        let mut ultimo = self.travar();
        if seq <= *ultimo {
            return Err(ErroSessao::GravacaoObsoleta);
        }
        *ultimo = seq;
        self.cofre.gravar(conteudo.as_bytes())?;
        Ok(())
    }

    pub fn apagar(&self, seq: u64) -> Result<(), ErroSessao> {
        let mut ultimo = self.travar();
        if seq <= *ultimo {
            return Err(ErroSessao::GravacaoObsoleta);
        }
        *ultimo = seq;
        self.cofre.apagar()?;
        Ok(())
    }
}

// ─── Comandos Tauri (permitidos só para a janela `main` — ver `capabilities/sessao.json`) ─────────────────────────

#[tauri::command]
pub fn sessao_carregar(
    servico: tauri::State<'_, ServicoSessao>,
) -> Result<SessaoCarregada, ErroSessao> {
    servico.carregar()
}

#[tauri::command]
pub fn sessao_gravar(
    servico: tauri::State<'_, ServicoSessao>,
    conteudo: String,
    seq: u64,
) -> Result<(), ErroSessao> {
    servico.gravar(conteudo, seq)
}

#[tauri::command]
pub fn sessao_apagar(servico: tauri::State<'_, ServicoSessao>, seq: u64) -> Result<(), ErroSessao> {
    servico.apagar(seq)
}

// ─── Testes (cofre falso, sem Credential Manager) ────────────────────────────────────────────────────────────────

/// Dados sintéticos compartilhados com o teste real (`cofre.rs`).
#[cfg(test)]
pub(crate) mod testes_comuns {
    pub const ACCESS: &str =
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzaW50ZXRpY28ifQ.c2ludGV0aWNvLWFzc2luYXR1cmE";
    pub const REFRESH: &str = "refresh_sintetico_0123456789abcdefghijklmnopq";
    pub const CHAVE: &str = "6f1c8a2e-0b5d-4c3e-9a7f-2d4e6b8c0a1f";

    pub fn vinculo() -> String {
        "ab".repeat(32)
    }

    pub fn conteudo_valido() -> String {
        format!(
            r#"{{"v":1,"accessToken":"{ACCESS}","refreshToken":"{REFRESH}","expiresAt":1794700000000,"pendencia":null}}"#
        )
    }

    pub fn conteudo_com_pendencia() -> String {
        format!(
            r#"{{"v":1,"accessToken":"{ACCESS}","refreshToken":"{REFRESH}","expiresAt":1794700000000,"pendencia":{{"vinculo":"{}","chave":"{CHAVE}","criadaEm":"2026-11-14T12:00:00.000Z"}}}}"#,
            vinculo()
        )
    }
}

#[cfg(test)]
mod testes {
    use super::testes_comuns::*;
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Cofre em memória, com falha injetável e contagem de chamadas.
    #[derive(Default)]
    struct CofreFalso {
        conteudo: Mutex<Option<Vec<u8>>>,
        falhar: AtomicBool,
        gravacoes: AtomicUsize,
    }

    impl Cofre for Arc<CofreFalso> {
        fn ler(&self) -> Result<Option<Vec<u8>>, FalhaCofre> {
            if self.falhar.load(Ordering::SeqCst) {
                return Err(FalhaCofre::Indisponivel);
            }
            Ok(self.conteudo.lock().unwrap().clone())
        }
        fn gravar(&self, conteudo: &[u8]) -> Result<(), FalhaCofre> {
            if self.falhar.load(Ordering::SeqCst) {
                return Err(FalhaCofre::Indisponivel);
            }
            self.gravacoes.fetch_add(1, Ordering::SeqCst);
            *self.conteudo.lock().unwrap() = Some(conteudo.to_vec());
            Ok(())
        }
        fn apagar(&self) -> Result<(), FalhaCofre> {
            if self.falhar.load(Ordering::SeqCst) {
                return Err(FalhaCofre::Indisponivel);
            }
            *self.conteudo.lock().unwrap() = None;
            Ok(())
        }
    }

    fn servico() -> (ServicoSessao, Arc<CofreFalso>) {
        let cofre = Arc::new(CofreFalso::default());
        (ServicoSessao::com_cofre(Box::new(cofre.clone())), cofre)
    }

    /// Conteúdo v1 com um campo substituído por JSON bruto.
    fn com_campo(campo: &str, json: &str) -> String {
        let mut v: Value = serde_json::from_str(&conteudo_com_pendencia()).unwrap();
        v[campo] = serde_json::from_str(json).unwrap();
        v.to_string()
    }

    fn com_pendencia(campo: &str, json: &str) -> String {
        let mut v: Value = serde_json::from_str(&conteudo_com_pendencia()).unwrap();
        v["pendencia"][campo] = serde_json::from_str(json).unwrap();
        v.to_string()
    }

    // ── contrato ──

    #[test]
    fn carregar_sem_credencial_devolve_ausencia_e_seq_zero() {
        let (s, _) = servico();
        let r = s.carregar().unwrap();
        assert!(r.conteudo.is_none());
        assert_eq!(r.seq, 0);
    }

    #[test]
    fn gravar_e_carregar_credencial_existente() {
        let (s, cofre) = servico();
        s.gravar(conteudo_com_pendencia(), 1).unwrap();
        let r = s.carregar().unwrap();
        assert_eq!(
            r.conteudo.as_deref(),
            Some(conteudo_com_pendencia().as_str())
        );
        assert_eq!(r.seq, 1);
        assert_eq!(cofre.gravacoes.load(Ordering::SeqCst), 1); // uma única gravação nativa
    }

    #[test]
    fn apagar_e_apagar_de_novo_sao_idempotentes() {
        let (s, _) = servico();
        s.gravar(conteudo_valido(), 1).unwrap();
        s.apagar(2).unwrap();
        assert!(s.carregar().unwrap().conteudo.is_none());
        s.apagar(3).unwrap();
        assert!(s.carregar().unwrap().conteudo.is_none());
    }

    #[test]
    fn credencial_corrompida_no_cofre_e_recusada_na_leitura() {
        let (s, cofre) = servico();
        *cofre.conteudo.lock().unwrap() = Some(b"{nao e json".to_vec());
        assert_eq!(s.carregar().err(), Some(ErroSessao::FormatoInvalido));
        *cofre.conteudo.lock().unwrap() = Some(vec![0xff, 0xfe, 0x00]); // UTF-8 inválido
        assert_eq!(s.carregar().err(), Some(ErroSessao::FormatoInvalido));
    }

    // ── validação ──

    #[test]
    fn conteudos_validos_com_e_sem_pendencia() {
        assert_eq!(validar_conteudo(&conteudo_valido()), Ok(()));
        assert_eq!(validar_conteudo(&conteudo_com_pendencia()), Ok(()));
        assert_eq!(
            validar_conteudo(&com_pendencia("criadaEm", r#""2026-11-14T12:00:00Z""#)),
            Ok(())
        );
    }

    #[test]
    fn conteudo_malformado_e_recusado() {
        for invalido in [
            "",
            "nao json",
            "[]",
            "null",
            "1",
            r#""texto""#,
            "{",
            r#"{"v":1}"#,
        ] {
            assert_eq!(
                validar_conteudo(invalido),
                Err(ErroSessao::FormatoInvalido),
                "{invalido}"
            );
        }
    }

    #[test]
    fn versao_desconhecida_e_recusada() {
        for v in ["0", "2", "1.5", r#""1""#, "null", "-1"] {
            assert_eq!(
                validar_conteudo(&com_campo("v", v)),
                Err(ErroSessao::FormatoInvalido),
                "v={v}"
            );
        }
    }

    #[test]
    fn campo_desconhecido_e_recusado() {
        let mut v: Value = serde_json::from_str(&conteudo_valido()).unwrap();
        v["extra"] = Value::Bool(true);
        assert_eq!(
            validar_conteudo(&v.to_string()),
            Err(ErroSessao::FormatoInvalido)
        );
        let mut p: Value = serde_json::from_str(&conteudo_com_pendencia()).unwrap();
        p["pendencia"]["extra"] = Value::Bool(true);
        assert_eq!(
            validar_conteudo(&p.to_string()),
            Err(ErroSessao::FormatoInvalido)
        );
    }

    #[test]
    fn campo_obrigatorio_ausente_e_recusado() {
        for campo in CAMPOS_SESSAO {
            let mut v: Value = serde_json::from_str(&conteudo_com_pendencia()).unwrap();
            v.as_object_mut().unwrap().remove(campo);
            assert_eq!(
                validar_conteudo(&v.to_string()),
                Err(ErroSessao::FormatoInvalido),
                "sem {campo}"
            );
        }
        for campo in CAMPOS_PENDENCIA {
            let mut v: Value = serde_json::from_str(&conteudo_com_pendencia()).unwrap();
            v["pendencia"].as_object_mut().unwrap().remove(campo);
            assert_eq!(
                validar_conteudo(&v.to_string()),
                Err(ErroSessao::FormatoInvalido),
                "pendencia sem {campo}"
            );
        }
    }

    #[test]
    fn tipos_e_tokens_invalidos_sao_recusados() {
        let casos = [
            ("accessToken", r#""""#),
            ("accessToken", r#""com espaco""#),
            ("accessToken", r#""aspas\"dentro""#),
            ("accessToken", "123"),
            ("accessToken", "null"),
            ("refreshToken", r#""curto""#),
            ("refreshToken", r#""refresh.com.ponto.0123456789abcdef""#),
            ("refreshToken", "null"),
            ("expiresAt", r#""1794700000000""#),
            ("expiresAt", "-1"),
            ("expiresAt", "1.5"),
            ("expiresAt", "99999999999999999"),
            ("pendencia", "[]"),
            ("pendencia", r#""texto""#),
        ];
        for (campo, json) in casos {
            assert_eq!(
                validar_conteudo(&com_campo(campo, json)),
                Err(ErroSessao::FormatoInvalido),
                "{campo}={json}"
            );
        }
    }

    #[test]
    fn pendencia_invalida_e_recusada() {
        let casos = [
            ("vinculo", r#""abc""#),
            ("vinculo", &format!(r#""{}""#, "AB".repeat(32))),
            ("vinculo", &format!(r#""{}""#, "zz".repeat(32))),
            ("chave", r#""abc""#),
            ("chave", r#""6F1C8A2E-0B5D-4C3E-9A7F-2D4E6B8C0A1F""#),
            ("chave", r#""00000000-0000-0000-0000-000000000000""#),
            ("chave", r#""6f1c8a2e-0b5d-4c3e-1a7f-2d4e6b8c0a1f""#),
            ("criadaEm", r#""14/11/2026""#),
            ("criadaEm", r#""2026-11-14 12:00:00Z""#),
            ("criadaEm", r#""2026-11-14T12:00:00.000""#),
            ("criadaEm", "0"),
        ];
        for (campo, json) in casos {
            assert_eq!(
                validar_conteudo(&com_pendencia(campo, json)),
                Err(ErroSessao::FormatoInvalido),
                "{campo}={json}"
            );
        }
    }

    #[test]
    fn limite_de_tamanho_2560_bytes() {
        // Conteúdo VÁLIDO com exatamente 2.560 bytes é aceito; um byte a mais é recusado. O preenchimento respeita os
        // tetos de cada campo: refresh token até 512 caracteres, o restante no access token (até 2.048).
        let base = conteudo_com_pendencia();
        let mut falta = TAMANHO_MAXIMO_CONTEUDO - base.len();
        let extra_refresh = falta.min(512 - REFRESH.len());
        falta -= extra_refresh;
        let refresh_longo = format!("{REFRESH}{}", "r".repeat(extra_refresh));
        let access_longo = format!("{ACCESS}{}", "a".repeat(falta));
        assert!(access_longo.len() <= 2048 && refresh_longo.len() <= 512);
        let no_limite = base
            .replace(ACCESS, &access_longo)
            .replace(REFRESH, &refresh_longo);
        assert_eq!(no_limite.len(), TAMANHO_MAXIMO_CONTEUDO);
        assert_eq!(validar_conteudo(&no_limite), Ok(()));
        let acima = base
            .replace(ACCESS, &format!("{access_longo}a"))
            .replace(REFRESH, &refresh_longo);
        assert_eq!(acima.len(), TAMANHO_MAXIMO_CONTEUDO + 1);
        assert_eq!(validar_conteudo(&acima), Err(ErroSessao::TamanhoExcedido));

        let (s, cofre) = servico();
        assert_eq!(s.gravar(acima, 1), Err(ErroSessao::TamanhoExcedido));
        assert_eq!(cofre.gravacoes.load(Ordering::SeqCst), 0);
        assert_eq!(s.gravar(no_limite, 1), Ok(())); // recusa por tamanho não consumiu o seq
    }

    #[test]
    fn invalido_nao_grava_nem_consome_seq() {
        let (s, cofre) = servico();
        assert_eq!(s.gravar("{}".into(), 1), Err(ErroSessao::FormatoInvalido));
        assert_eq!(cofre.gravacoes.load(Ordering::SeqCst), 0);
        assert_eq!(s.carregar().unwrap().seq, 0);
        assert_eq!(s.gravar(conteudo_valido(), 1), Ok(()));
    }

    // ── sequência e concorrência ──

    #[test]
    fn sequencia_crescente_e_gravacao_obsoleta() {
        let (s, _) = servico();
        s.gravar(conteudo_valido(), 1).unwrap();
        s.gravar(conteudo_com_pendencia(), 5).unwrap();
        assert_eq!(
            s.gravar(conteudo_valido(), 5),
            Err(ErroSessao::GravacaoObsoleta)
        );
        assert_eq!(
            s.gravar(conteudo_valido(), 3),
            Err(ErroSessao::GravacaoObsoleta)
        );
        assert_eq!(
            s.carregar().unwrap().conteudo.as_deref(),
            Some(conteudo_com_pendencia().as_str())
        );
        assert_eq!(s.carregar().unwrap().seq, 5);
    }

    #[test]
    fn exclusao_obsoleta_nao_apaga_gravacao_mais_nova() {
        let (s, _) = servico();
        s.gravar(conteudo_valido(), 10).unwrap();
        assert_eq!(s.apagar(9), Err(ErroSessao::GravacaoObsoleta));
        assert!(s.carregar().unwrap().conteudo.is_some());
    }

    #[test]
    fn gravacao_seguida_de_exclusao_e_exclusao_seguida_de_gravacao_mais_nova() {
        let (s, _) = servico();
        s.gravar(conteudo_valido(), 1).unwrap();
        s.apagar(2).unwrap();
        assert!(s.carregar().unwrap().conteudo.is_none());
        s.gravar(conteudo_com_pendencia(), 3).unwrap();
        assert_eq!(
            s.carregar().unwrap().conteudo.as_deref(),
            Some(conteudo_com_pendencia().as_str())
        );
        assert_eq!(
            s.gravar(conteudo_valido(), 2),
            Err(ErroSessao::GravacaoObsoleta)
        ); // a gravação antiga chegou tarde
    }

    #[test]
    fn falha_do_cofre_nao_corrompe_estado_e_operacao_antiga_nao_prevalece() {
        let (s, cofre) = servico();
        s.gravar(conteudo_valido(), 1).unwrap();

        // GRAVAÇÃO que falha no cofre: a credencial fica como estava, mas o seq 2 foi consumido — uma operação com
        // seq ≤ 2 que chegue depois (ex.: reordenada) não prevalece.
        cofre.falhar.store(true, Ordering::SeqCst);
        assert_eq!(
            s.gravar(conteudo_com_pendencia(), 2),
            Err(ErroSessao::CofreIndisponivel)
        );
        assert_eq!(s.carregar().err(), Some(ErroSessao::CofreIndisponivel));
        cofre.falhar.store(false, Ordering::SeqCst);
        assert_eq!(
            s.carregar().unwrap().conteudo.as_deref(),
            Some(conteudo_valido().as_str())
        );
        assert_eq!(s.carregar().unwrap().seq, 2);
        assert_eq!(
            s.gravar(conteudo_com_pendencia(), 2),
            Err(ErroSessao::GravacaoObsoleta)
        );

        // EXCLUSÃO que falha no cofre: idem — a credencial continua e o seq 3 foi consumido.
        cofre.falhar.store(true, Ordering::SeqCst);
        assert_eq!(s.apagar(3), Err(ErroSessao::CofreIndisponivel));
        cofre.falhar.store(false, Ordering::SeqCst);
        assert_eq!(s.carregar().unwrap().seq, 3);
        assert_eq!(s.apagar(3), Err(ErroSessao::GravacaoObsoleta));
        assert_eq!(
            s.carregar().unwrap().conteudo.as_deref(),
            Some(conteudo_valido().as_str())
        );

        // O frontend repete com um seq novo e a operação passa.
        assert_eq!(s.gravar(conteudo_com_pendencia(), 4), Ok(()));
        assert_eq!(
            s.carregar().unwrap().conteudo.as_deref(),
            Some(conteudo_com_pendencia().as_str())
        );
    }

    #[test]
    fn comandos_concorrentes_a_operacao_mais_nova_sempre_prevalece() {
        for rodada in 0..50 {
            let (s, _) = servico();
            let s = Arc::new(s);
            let mut threads = Vec::new();
            // seq 1..=16 disparados em ordem embaralhada; os pares gravam, os ímpares apagam; o 16 grava a pendência.
            let mut ordem: Vec<u64> = (1..=16).collect();
            ordem.rotate_left(rodada % 16);
            ordem.reverse();
            for seq in ordem {
                let s = Arc::clone(&s);
                threads.push(std::thread::spawn(move || {
                    if seq == 16 {
                        s.gravar(conteudo_com_pendencia(), seq)
                    } else if seq % 2 == 0 {
                        s.gravar(conteudo_valido(), seq)
                    } else {
                        s.apagar(seq)
                    }
                }));
            }
            let resultados: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
            assert!(resultados
                .iter()
                .all(|r| r.is_ok() || *r == Err(ErroSessao::GravacaoObsoleta)));
            let final_ = s.carregar().unwrap();
            assert_eq!(final_.seq, 16, "rodada {rodada}");
            assert_eq!(
                final_.conteudo.as_deref(),
                Some(conteudo_com_pendencia().as_str()),
                "rodada {rodada}"
            );
        }
    }

    // ── segurança ──

    #[test]
    fn erros_nunca_revelam_tokens_chaves_ou_conteudo() {
        let (s, cofre) = servico();
        let segredos = [ACCESS, REFRESH, CHAVE, "ababab"];
        let mut erros = vec![
            s.gravar(com_campo("v", "9"), 1).unwrap_err(),
            s.gravar(format!("{}x", conteudo_com_pendencia()), 1)
                .unwrap_err(),
            s.gravar(conteudo_com_pendencia().repeat(5), 1).unwrap_err(),
        ];
        s.gravar(conteudo_com_pendencia(), 2).unwrap();
        erros.push(s.gravar(conteudo_com_pendencia(), 1).unwrap_err());
        cofre.falhar.store(true, Ordering::SeqCst);
        erros.push(s.gravar(conteudo_com_pendencia(), 3).unwrap_err());
        erros.push(s.carregar().err().unwrap());
        for erro in erros {
            for texto in [
                erro.to_string(),
                format!("{erro:?}"),
                serde_json::to_string(&erro).unwrap(),
            ] {
                assert!(
                    [
                        "COFRE_INDISPONIVEL",
                        "FORMATO_INVALIDO",
                        "GRAVACAO_OBSOLETA",
                        "TAMANHO_EXCEDIDO",
                        "CofreIndisponivel",
                        "FormatoInvalido",
                        "GravacaoObsoleta",
                        "TamanhoExcedido"
                    ]
                    .iter()
                    .any(|c| texto.trim_matches('"') == *c),
                    "erro não é um código puro: {texto}"
                );
                for segredo in segredos {
                    assert!(!texto.contains(segredo));
                }
            }
        }
    }

    #[test]
    fn erros_serializam_como_codigos_estaveis() {
        assert_eq!(
            serde_json::to_string(&ErroSessao::CofreIndisponivel).unwrap(),
            r#""COFRE_INDISPONIVEL""#
        );
        assert_eq!(
            serde_json::to_string(&ErroSessao::FormatoInvalido).unwrap(),
            r#""FORMATO_INVALIDO""#
        );
        assert_eq!(
            serde_json::to_string(&ErroSessao::GravacaoObsoleta).unwrap(),
            r#""GRAVACAO_OBSOLETA""#
        );
        assert_eq!(
            serde_json::to_string(&ErroSessao::TamanhoExcedido).unwrap(),
            r#""TAMANHO_EXCEDIDO""#
        );
    }

    #[test]
    fn resposta_de_carregar_tem_o_formato_do_contrato() {
        let (s, _) = servico();
        s.gravar(conteudo_valido(), 7).unwrap();
        let json = serde_json::to_value(s.carregar().unwrap()).unwrap();
        assert_eq!(json["seq"], 7);
        assert_eq!(json["conteudo"].as_str(), Some(conteudo_valido().as_str()));
        let vazio = serde_json::to_value(servico().0.carregar().unwrap()).unwrap();
        assert!(vazio["conteudo"].is_null());
    }
}
