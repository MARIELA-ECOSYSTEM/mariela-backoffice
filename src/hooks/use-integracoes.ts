import { useQuery } from "@tanstack/react-query";
import { integracoesApi } from "@/services/api/integracoes.api";

export const integracoesKeys = { todos: ["integracoes"] as const };

export function useIntegracoes() {
  return useQuery({
    queryKey: integracoesKeys.todos,
    queryFn: () => integracoesApi.listar(),
    staleTime: 5 * 60_000,
  });
}
