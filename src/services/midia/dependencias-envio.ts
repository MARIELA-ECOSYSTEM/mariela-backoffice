import { isTauri } from "@tauri-apps/api/core";
import { USE_MOCK_API } from "@/services/api/client";
import { galeriaApi } from "@/services/api/galeria.api";
import { geracaoDaSessao } from "@/services/auth/session";
import { tokenStorage } from "@/services/auth/token-storage";
import {
  RegistroEnviosPendentes,
  transporteXhr,
  type DependenciasEnvio,
  type TransporteArmazenamento,
} from "./envio-midia";
import {
  criarArmazenamentoConfirmacoesNativo,
  criarArmazenamentoConfirmacoesSobreStorage,
} from "./registro-confirmacoes";

/**
 * Fase 22.8.9.9.2 (M2) — dependências REAIS do fluxo de envio (uma instância por processo do app).
 *
 * Transporte do `PUT`: `XMLHttpRequest` direto à URL assinada. Na Mock API (desenvolvimento/ambiente isolado; o
 * build de produção recusa a Mock API), o armazenamento SIMULADO é carregado por import dinâmico — nada de rede e
 * nada do mock no caminho de produção.
 *
 * Fase 22.8.9.9.3 — pendências de confirmação DURÁVEIS: no desktop, os comandos `midia_confirmacao_*` (arquivo no
 * diretório da identidade vigente); no navegador, `localStorage`. Sessão: a mesma geração e o mesmo token que o
 * `apiClient` usa — nada é enviado por uma sessão encerrada.
 */
const xhr = transporteXhr();

const transporte: TransporteArmazenamento = async (requisicao) => {
  // Fase 22.8.9.9.3 — `!import.meta.env.PROD` vem PRIMEIRO: é um literal no build de produção, então o ramo e o
  // chunk do armazenamento simulado são eliminados do pacote (só `USE_MOCK_API`, importado de outro módulo, não
  // bastava — o chunk era gerado, embora nunca carregado). Produção + Mock API já é recusado em `client.ts`.
  if (!import.meta.env.PROD && USE_MOCK_API) {
    const { receberEnvioMock } = await import("@/services/mock/armazenamento-midia.mock");
    return receberEnvioMock(requisicao);
  }
  return xhr(requisicao);
};

function localStorageSeguro(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const dependenciasEnvioPadrao: DependenciasEnvio = {
  api: galeriaApi,
  transporte,
  pendencias: new RegistroEnviosPendentes(
    isTauri()
      ? criarArmazenamentoConfirmacoesNativo()
      : criarArmazenamentoConfirmacoesSobreStorage(localStorageSeguro),
  ),
  sessao: { geracao: geracaoDaSessao, ativa: () => tokenStorage.get() !== null },
  agora: () => Date.now(),
};
