import { apiClient, type RequestOptions } from "./client";
import type { ApiMeta, ApiResponse } from "@/types/api";
import type {
  BloqueioWhatsapp,
  EnviarTemplatePayload,
  FiltrosBloqueiosWhatsapp,
  FiltrosMensagensWhatsapp,
  LiberarReenvioPayload,
  MensagemWhatsapp,
  PreviaTemplateWhatsapp,
  ResultadoEnvioTemplate,
  StatusBloqueioClienteWhatsapp,
  TemplateWhatsapp,
} from "@/types/whatsapp-oficial";

/**
 * Fase 22.8.9.10.6 — cliente do fluxo OFICIAL de WhatsApp (envio por template). Só rotas que EXISTEM no backend
 * (`EnviosWhatsappController` e `BloqueiosWhatsappController`, todas ADMIN):
 *
 *   GET    /integracoes/whatsapp/templates
 *   POST   /integracoes/whatsapp/templates/:chave/previa     { clienteId }
 *   POST   /integracoes/whatsapp/envios                      { idempotencyKey, destinatario, template, campanha? }
 *   GET    /integracoes/whatsapp/mensagens                   ?clienteId&estado&campanhaAno&page&limit
 *   GET    /integracoes/whatsapp/mensagens/:id
 *   POST   /integracoes/whatsapp/mensagens/:id/liberar-reenvio { motivo, confirmoRiscoDeDuplicidade? }
 *   GET    /integracoes/whatsapp/clientes/:id/bloqueio
 *   POST   /integracoes/whatsapp/clientes/:id/bloqueio       { motivo? }
 *   DELETE /integracoes/whatsapp/clientes/:id/bloqueio       { motivo }
 *   GET    /integracoes/whatsapp/bloqueios                   ?somenteAtivos&page&limit
 *   DELETE /integracoes/whatsapp/bloqueios/:id               { motivo }
 *
 * Nunca envia telefone, texto livre ou valores de parâmetros: o destinatário é resolvido pelo backend a partir do
 * cadastro do cliente. As rotas da Evolution (`whatsapp.api.ts`) seguem intactas e separadas.
 */
export interface TransporteApi {
  get: <T>(path: string, options?: RequestOptions) => Promise<ApiResponse<T>>;
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => Promise<ApiResponse<T>>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<ApiResponse<T>>;
}

const BASE = "/integracoes/whatsapp";
const seg = (valor: string) => encodeURIComponent(valor);

export function criarWhatsappOficialApi(transporte: TransporteApi = apiClient) {
  return {
    async listarTemplates(): Promise<TemplateWhatsapp[]> {
      const { data } = await transporte.get<TemplateWhatsapp[]>(`${BASE}/templates`);
      return data;
    },

    async previa(chave: string, clienteId: string): Promise<PreviaTemplateWhatsapp> {
      const { data } = await transporte.post<PreviaTemplateWhatsapp>(
        `${BASE}/templates/${seg(chave)}/previa`,
        { clienteId },
      );
      return data;
    },

    /** 201 = mensagem criada por esta requisição; 200 = repetição da MESMA chave (nada é reenviado). */
    async enviar(payload: EnviarTemplatePayload): Promise<ResultadoEnvioTemplate> {
      const resposta = await transporte.post<MensagemWhatsapp>(`${BASE}/envios`, payload);
      const status = resposta.httpStatus;
      return {
        mensagem: resposta.data,
        repetida: status === 200 ? true : status === 201 ? false : null,
      };
    },

    async listarMensagens(
      filtros: FiltrosMensagensWhatsapp,
    ): Promise<{ data: MensagemWhatsapp[]; meta: ApiMeta }> {
      const resposta = await transporte.get<MensagemWhatsapp[]>(`${BASE}/mensagens`, {
        params: {
          clienteId: filtros.clienteId,
          estado: filtros.estado,
          campanhaAno: filtros.campanhaAno,
          page: filtros.page,
          limit: filtros.limit,
        },
      });
      return { data: resposta.data, meta: resposta.meta ?? {} };
    },

    async obterMensagem(id: string): Promise<MensagemWhatsapp> {
      const { data } = await transporte.get<MensagemWhatsapp>(`${BASE}/mensagens/${seg(id)}`);
      return data;
    },

    async liberarReenvio(id: string, payload: LiberarReenvioPayload): Promise<MensagemWhatsapp> {
      const { data } = await transporte.post<MensagemWhatsapp>(
        `${BASE}/mensagens/${seg(id)}/liberar-reenvio`,
        payload,
      );
      return data;
    },

    async statusBloqueioCliente(clienteId: string): Promise<StatusBloqueioClienteWhatsapp> {
      const { data } = await transporte.get<StatusBloqueioClienteWhatsapp>(
        `${BASE}/clientes/${seg(clienteId)}/bloqueio`,
      );
      return data;
    },

    /** 201 = bloqueio criado; 200 = o número já estava bloqueado. */
    async bloquearCliente(
      clienteId: string,
      motivo: string | null,
    ): Promise<{ bloqueio: BloqueioWhatsapp; jaExistia: boolean | null }> {
      const resposta = await transporte.post<BloqueioWhatsapp>(
        `${BASE}/clientes/${seg(clienteId)}/bloqueio`,
        motivo ? { motivo } : {},
      );
      const status = resposta.httpStatus;
      return {
        bloqueio: resposta.data,
        jaExistia: status === 200 ? true : status === 201 ? false : null,
      };
    },

    async desbloquearCliente(
      clienteId: string,
      motivo: string,
    ): Promise<StatusBloqueioClienteWhatsapp> {
      const { data } = await transporte.delete<StatusBloqueioClienteWhatsapp>(
        `${BASE}/clientes/${seg(clienteId)}/bloqueio`,
        { body: { motivo } },
      );
      return data;
    },

    async listarBloqueios(
      filtros: FiltrosBloqueiosWhatsapp,
    ): Promise<{ data: BloqueioWhatsapp[]; meta: ApiMeta }> {
      const resposta = await transporte.get<BloqueioWhatsapp[]>(`${BASE}/bloqueios`, {
        params: {
          somenteAtivos: filtros.somenteAtivos ? "true" : "false",
          page: filtros.page,
          limit: filtros.limit,
        },
      });
      return { data: resposta.data, meta: resposta.meta ?? {} };
    },

    async desbloquearPorId(id: string, motivo: string): Promise<BloqueioWhatsapp> {
      const { data } = await transporte.delete<BloqueioWhatsapp>(`${BASE}/bloqueios/${seg(id)}`, {
        body: { motivo },
      });
      return data;
    },
  };
}

export type WhatsappOficialApi = ReturnType<typeof criarWhatsappOficialApi>;

export const whatsappOficialApi = criarWhatsappOficialApi();
