import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeRealtime } from "@/services/realtime/realtime";

/**
 * Liga a aplicação ao transporte de tempo real (WebSocket/SSE no futuro).
 * Sem transporte registrado é um no-op — a atualização continua vindo da
 * invalidação de cache das mutations e do refetch em foco/reconexão.
 */
export function useRealtimeSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => subscribeRealtime(queryClient), [queryClient]);
}
