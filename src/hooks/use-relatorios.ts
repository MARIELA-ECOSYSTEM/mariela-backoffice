import { useQuery } from "@tanstack/react-query";
import { relatoriosApi } from "@/services/api/relatorios.api";

export const relatoriosKeys = { resumo: ["relatorios", "resumo"] as const };

export function useResumoRelatorios() {
  return useQuery({
    queryKey: relatoriosKeys.resumo,
    queryFn: () => relatoriosApi.resumo(),
    staleTime: 30_000,
  });
}
