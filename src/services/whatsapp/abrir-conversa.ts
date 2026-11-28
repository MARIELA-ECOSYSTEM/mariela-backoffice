import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

const PREFIXO_WA_ME = "https://wa.me/";

/**
 * Fase 1 (WhatsApp via `wa.me`) — abre a conversa no WhatsApp (aplicativo ou navegador). Só aceita links
 * `https://wa.me/`: no desktop, pelo plugin opener (mesmo mecanismo do aviso de atualização; a permissão está
 * restrita a `https://wa.me/*` em `src-tauri/capabilities/desktop.json`); no navegador, numa nova aba.
 * NÃO envia nada — a pessoa revisa e envia no próprio WhatsApp.
 */
export async function abrirConversaWhatsapp(url: string): Promise<void> {
  if (!url.startsWith(PREFIXO_WA_ME)) throw new Error("Link de WhatsApp inválido.");
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  // Com `noopener` o navegador devolve null mesmo quando abre, então o retorno não é usado.
  window.open(url, "_blank", "noopener,noreferrer");
}
