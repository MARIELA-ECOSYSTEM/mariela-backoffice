import { apiClient } from "./client";
import type { ResumoDashboard } from "@/types/dashboard";

export const dashboardApi = {
  async resumo(mes?: string): Promise<ResumoDashboard> {
    const { data } = await apiClient.get<ResumoDashboard>("/dashboard/resumo", {
      params: mes ? { mes } : {},
    });
    return data;
  },
};
