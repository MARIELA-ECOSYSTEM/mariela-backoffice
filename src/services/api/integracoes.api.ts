import { apiClient } from "./client";
import type { Integracao } from "@/types/integracao";

export const integracoesApi = {
  async listar(): Promise<Integracao[]> {
    const { data } = await apiClient.get<Integracao[]>("/integracoes");
    return data;
  },
};
