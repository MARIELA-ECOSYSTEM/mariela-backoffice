import { USE_MOCK_API } from "@/services/api/client";
import { galeriaApi } from "@/services/api/galeria.api";
import {
  RegistroEnviosPendentes,
  transporteXhr,
  type DependenciasEnvio,
  type TransporteArmazenamento,
} from "./envio-midia";

/**
 * Fase 22.8.9.9.2 (M2) — dependências REAIS do fluxo de envio (uma instância por processo do app).
 *
 * Transporte do `PUT`: `XMLHttpRequest` direto à URL assinada. Na Mock API (desenvolvimento/ambiente isolado; o
 * build de produção recusa a Mock API), o armazenamento SIMULADO é carregado por import dinâmico — nada de rede e
 * nada do mock no caminho de produção.
 */
const xhr = transporteXhr();

const transporte: TransporteArmazenamento = async (requisicao) => {
  if (USE_MOCK_API) {
    const { receberEnvioMock } = await import("@/services/mock/armazenamento-midia.mock");
    return receberEnvioMock(requisicao);
  }
  return xhr(requisicao);
};

export const dependenciasEnvioPadrao: DependenciasEnvio = {
  api: galeriaApi,
  transporte,
  pendencias: new RegistroEnviosPendentes(),
  agora: () => Date.now(),
};
