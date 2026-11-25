/**
 * Fase 22.8.9.10.6 — tipos do fluxo OFICIAL de WhatsApp (Cloud API da Meta, envio por TEMPLATE), espelhando
 * exatamente o contrato do backend (`mariela-backend/src/modules/whatsapp`, Fases 22.8.9.10.3 a 22.8.9.10.5):
 *   - `envios/envios-whatsapp.constants.ts` (estados, códigos de erro, origens);
 *   - `envios/envios-whatsapp.service.ts` (`MensagemWhatsappDto`);
 *   - `templates/templates-whatsapp.service.ts` (`TemplateWhatsappPublico`);
 *   - `bloqueios/bloqueios-whatsapp.service.ts` (`BloqueioWhatsappDto`, `StatusBloqueioClienteWhatsapp`).
 *
 * O Backoffice NUNCA inventa estados nem transforma os que recebe: só os exibe. Telefones chegam sempre MASCARADOS.
 */

export const ESTADOS_MENSAGEM_WHATSAPP = [
  "pendente",
  "enviando",
  "aceita",
  "entregue",
  "lida",
  "falha",
  "indeterminada",
] as const;
export type EstadoMensagemWhatsapp = (typeof ESTADOS_MENSAGEM_WHATSAPP)[number];

export type CodigoErroEnvioWhatsapp =
  | "NAO_ENVIADA"
  | "PROVEDOR_INDISPONIVEL"
  | "SEM_WHATSAPP"
  | "OPT_OUT_MARKETING"
  | "LIMITE_MARKETING_DESTINATARIO"
  | "TEMPLATE_INVALIDO"
  | "LIMITE_TAXA"
  | "CREDENCIAL_INVALIDA"
  | "RECUSADA"
  | "JANELA_FECHADA"
  | "INDETERMINADO";

/** Fase 22.8.9.10.7.4 — `TEMPLATE`: modelo aprovado; `TEXTO`: texto livre na janela de 24 h. */
export type TipoMensagemWhatsapp = "TEMPLATE" | "TEXTO";

export type OrigemMensagemWhatsapp = "INDIVIDUAL" | "CAMPANHA_ANIVERSARIO";
export type TipoCampanhaWhatsapp = "ANIVERSARIO";
export type CategoriaTemplateWhatsapp = "MARKETING" | "UTILITY";

/**
 * Resposta pública de uma mensagem (telefone mascarado; nunca valores de parâmetros de template). `template` só em
 * `TEMPLATE`; `texto` só em `TEXTO` (o texto livre que o operador enviou).
 */
export interface MensagemWhatsapp {
  id: string;
  idempotencyKey: string;
  tipo: TipoMensagemWhatsapp;
  destinatario: { tipo: "CLIENTE"; id: string; telefoneMascarado: string };
  template: { chave: string; categoria: string } | null;
  texto: string | null;
  estado: EstadoMensagemWhatsapp;
  /** Erro já sanitizado pelo backend (código interno estável + mensagem legível). */
  erro: { codigo: CodigoErroEnvioWhatsapp; mensagem: string } | null;
  origem: OrigemMensagemWhatsapp;
  campanha: { tipo: TipoCampanhaWhatsapp; ano: number } | null;
  liberacao: { em: string; motivo: string | null } | null;
  criadoEm: string;
  atualizadoEm: string;
  aceitaEm: string | null;
  entregueEm: string | null;
  lidaEm: string | null;
  falhaEm: string | null;
}

/**
 * `APROVADO` é o único estado que permite envio. `DESCONHECIDO` = o backend não conseguiu confirmar agora (inclusive
 * quando o provedor não está configurado) — NUNCA tratado como aprovado.
 */
export type EstadoAprovacaoTemplateWhatsapp =
  | "APROVADO"
  | "PENDENTE"
  | "REJEITADO"
  | "PAUSADO"
  | "DESATIVADO"
  | "NAO_ENCONTRADO"
  | "DIVERGENTE"
  | "DESCONHECIDO";

export interface TemplateWhatsapp {
  chave: string;
  categoria: CategoriaTemplateWhatsapp;
  idioma: string;
  usoPermitido: OrigemMensagemWhatsapp[];
  /** Corpo com `{{n}}`; a prévia com dados reais vem de `POST /templates/:chave/previa`. */
  previa: string;
  estadoAprovacao: EstadoAprovacaoTemplateWhatsapp;
}

export interface PreviaTemplateWhatsapp {
  texto: string;
}

/** Corpo de `POST /integracoes/whatsapp/envios` — sem telefone, sem texto, sem valores de parâmetros. */
export interface EnviarTemplatePayload {
  idempotencyKey: string;
  destinatario: { tipo: "CLIENTE"; id: string };
  template: string;
  campanha?: { tipo: TipoCampanhaWhatsapp };
}

/**
 * Fase 22.8.9.10.7.4 — corpo de `POST /integracoes/whatsapp/envios/texto`: só a chave, o id do cliente cadastrado e o
 * texto. Nunca telefone, `waId`, dados de janela ou credenciais (o backend recusa qualquer campo extra).
 */
export interface EnviarTextoPayload {
  idempotencyKey: string;
  destinatario: { tipo: "CLIENTE"; id: string };
  texto: string;
}

export type MotivoTextoLivreIndisponivel =
  | "PROVEDOR_NAO_CONFIGURADO"
  | "WEBHOOK_NAO_CONFIGURADO"
  | "TELEFONE_INVALIDO"
  | "CONTATO_BLOQUEADO"
  | "SEM_MENSAGEM_RECEBIDA"
  | "JANELA_EXPIRADA";

/** `GET /integracoes/whatsapp/clientes/:id/texto-livre` — decidido SÓ pelo backend; a interface apenas exibe. */
export interface ElegibilidadeTextoWhatsapp {
  permitido: boolean;
  motivo: MotivoTextoLivreIndisponivel | null;
  mensagem: string;
  telefoneMascarado: string | null;
  ultimaMensagemRecebidaEm: string | null;
  janelaExpiraEm: string | null;
  limiteCaracteres: number;
  verificadoEm: string;
}

/** Limite do texto livre na Cloud API (o backend confere de novo). */
export const LIMITE_TEXTO_LIVRE_WHATSAPP = 4096;

/** Resultado do envio: `repetida` = HTTP 200 (a mesma chave já existia; nada foi reenviado); `false` = 201. */
export interface ResultadoEnvioTemplate {
  mensagem: MensagemWhatsapp;
  /** `null` quando o status HTTP não está disponível (ex.: Mock API). */
  repetida: boolean | null;
}

export interface FiltrosMensagensWhatsapp {
  clienteId?: string | undefined;
  estado?: EstadoMensagemWhatsapp | undefined;
  campanhaAno?: number | undefined;
  page: number;
  limit: number;
}

export interface LiberarReenvioPayload {
  motivo: string;
  confirmoRiscoDeDuplicidade?: boolean;
}

export type OrigemBloqueioWhatsapp = "ADMIN" | "PALAVRA_CHAVE" | "META_OPT_OUT";
export type TipoChaveBloqueioWhatsapp = "E164" | "WAID";

export interface BloqueioWhatsapp {
  id: string;
  /** E.164 ou `waId`, sempre mascarado pelo backend. */
  numeroMascarado: string;
  tipoChave: TipoChaveBloqueioWhatsapp;
  ativo: boolean;
  clienteId: string | null;
  origem: OrigemBloqueioWhatsapp;
  motivo: string | null;
  criadoEm: string;
  desbloqueadoEm: string | null;
  motivoDesbloqueio: string | null;
}

export interface StatusBloqueioClienteWhatsapp {
  bloqueado: boolean;
  telefoneMascarado: string | null;
  bloqueios: BloqueioWhatsapp[];
}

export interface FiltrosBloqueiosWhatsapp {
  somenteAtivos: boolean;
  page: number;
  limit: number;
}

/** Limites do contrato (DTOs do backend). */
export const LIMITES_WHATSAPP_OFICIAL = {
  motivoLiberacaoMin: 10,
  motivoLiberacaoMax: 300,
  motivoDesbloqueioMin: 3,
  motivoDesbloqueioMax: 200,
  motivoBloqueioMax: 200,
  limitePagina: 20,
  limiteMaximo: 100,
} as const;
