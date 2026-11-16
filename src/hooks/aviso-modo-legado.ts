import type { EstadoArmazenamento, MotivoModoLegado } from "@/services/auth/sessao-nativa";

/**
 * Fase 22.8.8.8.2.2 (M8.2.2) — controle do aviso de MODO LEGADO (o app desktop usando o armazenamento anterior em vez
 * do Windows Credential Manager). Substitui o "uma vez por contexto" da M4, que suprimia o aviso quando o MOTIVO
 * mudava.
 *
 * Regras (avaliadas a cada chamada de `avaliar`, sempre com o estado ATUAL do armazenamento):
 * - Entrou em modo legado por um motivo ainda não avisado → avisa.
 * - Mesmo motivo de novo (re-renderização, nova validação, StrictMode) → não repete.
 * - Motivo diferente → avisa de novo.
 * - Estado normal (`web`/`nativo`) → nunca avisa e "esquece" o último motivo: um novo ingresso no modo legado volta a
 *   avisar, mesmo que pelo motivo anterior.
 * - Estado ainda desconhecido (`null`: preparação não terminou) → nada muda.
 *
 * Mensagens genéricas: nenhuma inclui o identificador do motivo, tokens, conteúdo do cofre ou detalhes do Windows.
 * A atualização do "último motivo" é síncrona: chamadas próximas ou concorrentes nunca avisam duas vezes a mesma
 * transição. O `id` por motivo também deduplica na própria pilha de notificações.
 */

const MENSAGEM_COFRE_INDISPONIVEL =
  "O Gerenciador de Credenciais do Windows não está disponível agora. A sessão continua no armazenamento anterior.";
const MENSAGEM_SESSOES_DIVERGENTES =
  "Foram encontradas duas sessões salvas diferentes. Por segurança, nenhuma foi alterada; a sessão anterior continua em uso.";

/** Mensagem genérica por motivo; motivo desconhecido recebe a mensagem genérica do armazenamento anterior. */
export function mensagemDoModoLegado(motivo: MotivoModoLegado | string | undefined): string {
  return motivo === "sessoes_divergentes"
    ? MENSAGEM_SESSOES_DIVERGENTES
    : MENSAGEM_COFRE_INDISPONIVEL;
}

export type Notificar = (mensagem: string, id: string) => void;

export function criarAvisoModoLegado(notificar: Notificar) {
  let ultimoMotivoAvisado: string | null = null;
  return {
    /** Avalia o estado atual; devolve `true` se um aviso foi emitido nesta chamada. */
    avaliar(estado: EstadoArmazenamento | null): boolean {
      if (estado === null) return false;
      if (estado.modo !== "legado") {
        ultimoMotivoAvisado = null;
        return false;
      }
      const motivo: string =
        typeof estado.motivo === "string" && estado.motivo ? estado.motivo : "desconhecido";
      if (motivo === ultimoMotivoAvisado) return false;
      ultimoMotivoAvisado = motivo;
      notificar(mensagemDoModoLegado(motivo), `modo-legado:${motivo}`);
      return true;
    },
  };
}
