import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  campanhasApi,
  clientesApi,
  colecoesApi,
  fornecedoresApi,
} from "@/services/api/cadastros.api";
import type { ClientePayload } from "@/types/cliente";
import type { FornecedorPayload } from "@/types/fornecedor";
import type { ColecaoPayload } from "@/types/colecao";
import type { CampanhaPayload } from "@/types/campanha";

export const clientesKeys = { todos: ["clientes"] as const };
export const fornecedoresKeys = { todos: ["fornecedores"] as const };
export const colecoesKeys = { todos: ["colecoes"] as const };
export const campanhasKeys = { todos: ["campanhas"] as const };

function useInvalidar(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey });
}

export function useClientes() {
  return useQuery({ queryKey: clientesKeys.todos, queryFn: () => clientesApi.listar() });
}

export function useCriarCliente() {
  const invalidar = useInvalidar(clientesKeys.todos);
  return useMutation({
    mutationFn: (payload: ClientePayload) => clientesApi.criar(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAtualizarCliente() {
  const invalidar = useInvalidar(clientesKeys.todos);
  return useMutation({
    mutationFn: (vars: { id: string; payload: ClientePayload }) =>
      clientesApi.atualizar(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverCliente() {
  const invalidar = useInvalidar(clientesKeys.todos);
  return useMutation({
    mutationFn: (id: string) => clientesApi.remover(id),
    onSuccess: () => void invalidar(),
  });
}

/** Histórico de compras do cliente (somente leitura). */
export function useVendasDoCliente(id: string | null) {
  return useQuery({
    queryKey: [...clientesKeys.todos, id, "vendas"],
    queryFn: () => clientesApi.listarVendas(id!),
    enabled: Boolean(id),
  });
}

export function useFornecedores() {
  return useQuery({
    queryKey: fornecedoresKeys.todos,
    queryFn: () => fornecedoresApi.listar(),
    staleTime: 60_000,
  });
}

export function useCriarFornecedor() {
  const invalidar = useInvalidar(fornecedoresKeys.todos);
  return useMutation({
    mutationFn: (payload: FornecedorPayload) => fornecedoresApi.criar(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAtualizarFornecedor() {
  const invalidar = useInvalidar(fornecedoresKeys.todos);
  return useMutation({
    mutationFn: (vars: { id: string; payload: FornecedorPayload }) =>
      fornecedoresApi.atualizar(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverFornecedor() {
  const invalidar = useInvalidar(fornecedoresKeys.todos);
  return useMutation({
    mutationFn: (id: string) => fornecedoresApi.remover(id),
    onSuccess: () => void invalidar(),
  });
}

/** Histórico de produtos do fornecedor (somente leitura). */
export function useHistoricoFornecedor(id: string | null) {
  return useQuery({
    queryKey: [...fornecedoresKeys.todos, id, "historico"],
    queryFn: () => fornecedoresApi.listarHistorico(id!),
    enabled: Boolean(id),
  });
}

export function useColecoes() {
  return useQuery({
    queryKey: colecoesKeys.todos,
    queryFn: () => colecoesApi.listar(),
    staleTime: 60_000,
  });
}

export function useCriarColecao() {
  const invalidar = useInvalidar(colecoesKeys.todos);
  return useMutation({
    mutationFn: (payload: ColecaoPayload) => colecoesApi.criar(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAtualizarColecao() {
  const invalidar = useInvalidar(colecoesKeys.todos);
  return useMutation({
    mutationFn: (vars: { id: string; payload: ColecaoPayload }) =>
      colecoesApi.atualizar(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverColecao() {
  const invalidar = useInvalidar(colecoesKeys.todos);
  return useMutation({
    mutationFn: (id: string) => colecoesApi.remover(id),
    onSuccess: () => void invalidar(),
  });
}

export function useAlterarStatusColecao() {
  const invalidar = useInvalidar(colecoesKeys.todos);
  return useMutation({
    mutationFn: (vars: { id: string; ativo: boolean }) =>
      colecoesApi.alterarStatus(vars.id, vars.ativo),
    onSuccess: () => void invalidar(),
  });
}

export function useCampanhas() {
  return useQuery({
    queryKey: campanhasKeys.todos,
    queryFn: () => campanhasApi.listar(),
    staleTime: 60_000,
  });
}

export function useCriarCampanha() {
  const invalidar = useInvalidar(campanhasKeys.todos);
  return useMutation({
    mutationFn: (payload: CampanhaPayload) => campanhasApi.criar(payload),
    onSuccess: () => void invalidar(),
  });
}

export function useAtualizarCampanha() {
  const invalidar = useInvalidar(campanhasKeys.todos);
  return useMutation({
    mutationFn: (vars: { id: string; payload: CampanhaPayload }) =>
      campanhasApi.atualizar(vars.id, vars.payload),
    onSuccess: () => void invalidar(),
  });
}

export function useRemoverCampanha() {
  const invalidar = useInvalidar(campanhasKeys.todos);
  return useMutation({
    mutationFn: (id: string) => campanhasApi.remover(id),
    onSuccess: () => void invalidar(),
  });
}

export function useAlterarStatusCampanha() {
  const invalidar = useInvalidar(campanhasKeys.todos);
  return useMutation({
    mutationFn: (vars: { id: string; ativo: boolean }) =>
      campanhasApi.alterarStatus(vars.id, vars.ativo),
    onSuccess: () => void invalidar(),
  });
}
