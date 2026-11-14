/**
 * Fase 22.8.7.3 — chave de idempotência da RENOVAÇÃO do refresh token (integração com a recuperação idempotente do
 * Backend, Fase 22.8.7.2).
 *
 * Problema: o Backend rotaciona R1 → R2, mas a resposta se perde (timeout, rede, app fechado). O cliente ainda tem R1;
 * repetir R1 com uma chave NOVA (ou sem chave) é reuso suspeito e derruba a sessão. Repetir com a MESMA chave faz o
 * Backend devolver o MESMO R2.
 *
 * Regras:
 *   - Uma chave por OPERAÇÃO de rotação do R1 vigente: criada (e PERSISTIDA) antes do primeiro envio, reaproveitada
 *     em toda nova tentativa enquanto R1 continuar sendo o refresh token local — após timeout, rede, 5xx, erro
 *     desconhecido, reload ou reinício do app. Nunca uma chave nova só porque a anterior falhou.
 *   - O registro é descartado quando R1 deixa de valer localmente: par novo gravado (`salvarSessao`) ou fim da sessão
 *     (`limparSessao`) — ver `token-storage.ts`.
 *   - Vínculo inequívoco com R1: `vinculo` = SHA-256(R1) em hex. Não é reversível e não autentica nada no Backend
 *     (lá o refresh token é guardado como HMAC com segredo). R1/R2 nunca são copiados para este registro.
 *   - A GERAÇÃO da sessão (Fase 22.8.4) continua em memória e é verificada por quem usa a chave; ela não é persistida
 *     de propósito: o contador recomeça a cada execução, então persisti-lo impediria justamente a recuperação após
 *     reinício. Entre execuções, o vínculo que vale é o R1.
 *   - A chave nunca é registrada em log, erro, evento ou interface.
 *
 * Formato persistido (`mariela.refreshIdempotencia`, JSON):
 *   { "versao": 1, "vinculo": "<64 hex>", "chave": "<UUID minúsculo>", "criadaEm": "<ISO 8601>", "estado": "pendente" }
 * Registro malformado, de versão desconhecida ou de outro R1 é ignorado (e substituído na próxima operação).
 */
import { renovacaoPendenteStorageAtual } from "./token-storage";

export const VERSAO_RENOVACAO_PENDENTE = 1;

/** Mesmo formato aceito pelo Backend (UUID canônico, versões 1–8, variante 10xx) — o de `crypto.randomUUID()`. */
const FORMATO_CHAVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORMATO_VINCULO = /^[0-9a-f]{64}$/;

export interface RenovacaoPendente {
  versao: typeof VERSAO_RENOVACAO_PENDENTE;
  vinculo: string;
  chave: string;
  criadaEm: string;
  estado: "pendente";
}

/** SHA-256 (hex) do refresh token — identifica a QUAL R1 a chave pertence, sem guardá-lo. */
export async function vinculoDoRefreshToken(refreshToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(refreshToken));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lê e VALIDA o registro; qualquer problema (ausente, JSON inválido, formato, versão, armazenamento) → `null`. */
export function lerRenovacaoPendente(): RenovacaoPendente | null {
  let bruto: string | null;
  try {
    bruto = renovacaoPendenteStorageAtual.get();
  } catch {
    return null;
  }
  if (!bruto) return null;
  let valor: unknown;
  try {
    valor = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (typeof valor !== "object" || valor === null) return null;
  const r = valor as Record<string, unknown>;
  if (r["versao"] !== VERSAO_RENOVACAO_PENDENTE || r["estado"] !== "pendente") return null;
  if (typeof r["vinculo"] !== "string" || !FORMATO_VINCULO.test(r["vinculo"])) return null;
  if (typeof r["chave"] !== "string" || !FORMATO_CHAVE.test(r["chave"])) return null;
  if (typeof r["criadaEm"] !== "string" || Number.isNaN(Date.parse(r["criadaEm"]))) return null;
  return {
    versao: VERSAO_RENOVACAO_PENDENTE,
    vinculo: r["vinculo"],
    chave: r["chave"],
    criadaEm: r["criadaEm"],
    estado: "pendente",
  };
}

/**
 * Chave para renovar o R1 identificado por `vinculo`. SÍNCRONA de propósito: quem chama verifica a geração da sessão
 * imediatamente antes, sem `await` no meio — nada pode encerrar a sessão entre a verificação e a gravação.
 *   - existe registro válido do MESMO R1 → `{ chave }` (mesma operação: reaproveita a chave);
 *   - senão → gera uma chave nova, grava e RELÊ o registro: só com a releitura idêntica a chave é usada;
 *   - armazenamento indisponível/falhou → `null`: quem chama renova SEM a chave (comportamento anterior à fase), porque
 *     uma chave que não sobreviveria a um reinício não garante a recuperação prometida.
 */
export function chaveParaRenovar(vinculo: string): { chave: string } | null {
  const existente = lerRenovacaoPendente();
  if (existente && existente.vinculo === vinculo) return { chave: existente.chave };

  const novo: RenovacaoPendente = {
    versao: VERSAO_RENOVACAO_PENDENTE,
    vinculo,
    chave: crypto.randomUUID(),
    criadaEm: new Date().toISOString(),
    estado: "pendente",
  };
  try {
    renovacaoPendenteStorageAtual.set(JSON.stringify(novo));
  } catch {
    return null;
  }
  const relido = lerRenovacaoPendente();
  if (!relido || relido.vinculo !== novo.vinculo || relido.chave !== novo.chave) return null;
  return { chave: novo.chave };
}
