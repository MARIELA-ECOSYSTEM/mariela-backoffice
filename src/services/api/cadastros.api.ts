import { apiClient } from "./client";
import type { Cliente } from "@/types/cliente";
import type { Fornecedor } from "@/types/fornecedor";
import type { Colecao } from "@/types/colecao";
import type { Campanha } from "@/types/campanha";

export const clientesApi = {
  async listar(): Promise<Cliente[]> {
    const { data } = await apiClient.get<Cliente[]>("/clientes");
    return data;
  },
};

export const fornecedoresApi = {
  async listar(): Promise<Fornecedor[]> {
    const { data } = await apiClient.get<Fornecedor[]>("/fornecedores");
    return data;
  },
};

export const colecoesApi = {
  async listar(): Promise<Colecao[]> {
    const { data } = await apiClient.get<Colecao[]>("/colecoes");
    return data;
  },
};

export const campanhasApi = {
  async listar(): Promise<Campanha[]> {
    const { data } = await apiClient.get<Campanha[]>("/campanhas");
    return data;
  },
};
