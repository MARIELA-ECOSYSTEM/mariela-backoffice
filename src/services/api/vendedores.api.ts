import { apiClient } from "./client";
import type {
  Vendedor,
  VendedorPayload,
  VendedorSenhaPayload,
  VendedorStatusPayload,
} from "@/types/vendedor";

export const vendedoresApi = {
  async listar(): Promise<Vendedor[]> {
    const { data } = await apiClient.get<Vendedor[]>("/vendedores");
    return data;
  },
  async obter(id: string): Promise<Vendedor> {
    const { data } = await apiClient.get<Vendedor>(`/vendedores/${id}`);
    return data;
  },
  async criar(payload: VendedorPayload): Promise<Vendedor> {
    const { data } = await apiClient.post<Vendedor>("/vendedores", payload);
    return data;
  },
  async atualizar(id: string, payload: VendedorPayload): Promise<Vendedor> {
    const { data } = await apiClient.put<Vendedor>(`/vendedores/${id}`, payload);
    return data;
  },
  async alterarStatus(id: string, payload: VendedorStatusPayload): Promise<Vendedor> {
    const { data } = await apiClient.patch<Vendedor>(`/vendedores/${id}/status`, payload);
    return data;
  },
  async redefinirSenha(id: string, payload: VendedorSenhaPayload): Promise<void> {
    await apiClient.patch(`/vendedores/${id}/senha`, payload);
  },
  async remover(id: string): Promise<void> {
    await apiClient.delete(`/vendedores/${id}`);
  },
};
