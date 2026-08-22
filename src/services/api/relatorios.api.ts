import { apiClient } from "./client";
import type { ResumoRelatorios } from "@/types/relatorio";

export const relatoriosApi = {
  async resumo(): Promise<ResumoRelatorios> {
    const { data } = await apiClient.get<ResumoRelatorios>("/relatorios/resumo");
    return data;
  },
};
