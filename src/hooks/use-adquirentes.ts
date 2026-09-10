import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adquirentesApi } from "@/services/api/adquirentes.api";
import type {
  AdquirentesFiltros,
  AtualizarAdquirentePayload,
  CriarAdquirentePayload,
} from "@/types/adquirente";

export const adquirentesKeys = {
  todos: ["adquirentes"] as const,
  lista: (filtros: AdquirentesFiltros) => ["adquirentes", "lista", filtros] as const,
  detalhe: (id: string) => ["adquirentes", "detalhe", id] as const,
};

/**
 * Nenhuma invalidação cruzada: uma tarifa aplicada a um pagamento é um
 * SNAPSHOT imutável (`PagamentoVenda.tarifaAplicada`, nunca recalculado
 * depois — ver `venda.ts`), e o backend confirma que `VendasService` só LÊ
 * `AdquirentesService`, nunca o contrário. Editar/excluir uma adquirente não
 * muda nenhuma venda já registrada, e Dashboard/Relatórios/Configurações não
 * têm nenhum dado derivado de Adquirentes hoje — só a própria listagem
 * precisa ser invalidada.
 */
function useInvalidar() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adquirentesKeys.todos });
}

export function useAdquirentes(filtros: AdquirentesFiltros) {
  return useQuery({
    queryKey: adquirentesKeys.lista(filtros),
    queryFn: () => adquirentesApi.listar(filtros),
  });
}

export function useCriarAdquirente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (payload: CriarAdquirentePayload) => adquirentesApi.criar(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAtualizarAdquirente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { id: string; payload: AtualizarAdquirentePayload }) =>
      adquirentesApi.atualizar(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAlterarStatusAdquirente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (vars: { id: string; ativo: boolean }) =>
      adquirentesApi.alterarStatus(vars.id, vars.ativo),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverAdquirente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => adquirentesApi.remover(id),
    onSuccess: () => void invalidar(),
  });
}
