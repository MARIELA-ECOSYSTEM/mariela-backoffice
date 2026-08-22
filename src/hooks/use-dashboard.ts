import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/services/api/dashboard.api";

export const dashboardKeys = {
  todos: ["dashboard"] as const,
  resumo: (mes: string) => ["dashboard", "resumo", mes] as const,
};

/** `mes` no formato YYYY-MM; string vazia significa "mês atual" (decidido pela API). */
export function useResumoDashboard(mes: string) {
  return useQuery({
    queryKey: dashboardKeys.resumo(mes),
    queryFn: () => dashboardApi.resumo(mes || undefined),
    staleTime: 30_000,
  });
}
