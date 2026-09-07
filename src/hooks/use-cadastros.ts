import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  campanhasApi,
  clientesApi,
  colecoesApi,
  fornecedoresApi,
} from "@/services/api/cadastros.api";
import type { ClienteFiltros, ClientePayload } from "@/types/cliente";
import type { FornecedorFiltros, FornecedorPayload } from "@/types/fornecedor";
import type { ColecaoFiltros, ColecaoPayload } from "@/types/colecao";
import type { CampanhaFiltros, CampanhaPayload } from "@/types/campanha";

export const clientesKeys = {
  todos: ["clientes"] as const,
  lista: (filtros: ClienteFiltros) => ["clientes", "lista", filtros] as const,
};
export const fornecedoresKeys = {
  todos: ["fornecedores"] as const,
  lista: (filtros: FornecedorFiltros) => ["fornecedores", "lista", filtros] as const,
};
export const colecoesKeys = {
  todos: ["colecoes"] as const,
  lista: (filtros: ColecaoFiltros) => ["colecoes", "lista", filtros] as const,
  detalhe: (id: string) => ["colecoes", "detalhe", id] as const,
  produtos: (id: string) => ["colecoes", "produtos", id] as const,
};
export const campanhasKeys = {
  todos: ["campanhas"] as const,
  lista: (filtros: CampanhaFiltros) => ["campanhas", "lista", filtros] as const,
  detalhe: (id: string) => ["campanhas", "detalhe", id] as const,
  produtos: (id: string) => ["campanhas", "produtos", id] as const,
};

function useInvalidar(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey });
}

/**
 * `opcoes.enabled` existe para o diálogo de Aniversariantes: ele precisa da
 * base INTEIRA de clientes (não a página atual) para achatar aniversariantes
 * de qualquer página, então só dispara sob demanda (diálogo aberto), com
 * `limit` no máximo permitido pelo backend — nunca com a listagem principal.
 */
export function useClientes(filtros: ClienteFiltros, opcoes?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientesKeys.lista(filtros),
    queryFn: () => clientesApi.listar(filtros),
    placeholderData: keepPreviousData,
    ...(opcoes?.enabled === undefined ? {} : { enabled: opcoes.enabled }),
  });
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

/**
 * `opcoes.enabled` existe para os dropdowns de seleção de fornecedor em
 * Produtos (facet/form): eles precisam da base INTEIRA (não a página atual),
 * então usam `limit` no máximo permitido pelo backend — nunca com a listagem
 * principal, que é sempre paginada de verdade.
 *
 * Sem `staleTime` (ao contrário da versão antiga, não-paginada, deste hook):
 * a listagem principal precisa que TODA troca de página dispare uma
 * requisição nova de verdade — inclusive ao voltar para uma página já vista
 * — nunca servir uma página "antiga" do cache silenciosamente.
 */
export function useFornecedores(filtros: FornecedorFiltros, opcoes?: { enabled?: boolean }) {
  return useQuery({
    queryKey: fornecedoresKeys.lista(filtros),
    queryFn: () => fornecedoresApi.listar(filtros),
    placeholderData: keepPreviousData,
    ...(opcoes?.enabled === undefined ? {} : { enabled: opcoes.enabled }),
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

/**
 * Sem `staleTime` (ao contrário da versão antiga, não-paginada, deste hook):
 * a listagem principal precisa que TODA troca de página dispare uma
 * requisição nova de verdade — inclusive ao voltar para uma página já vista.
 */
export function useColecoes(filtros: ColecaoFiltros, opcoes?: { enabled?: boolean }) {
  return useQuery({
    queryKey: colecoesKeys.lista(filtros),
    queryFn: () => colecoesApi.listar(filtros),
    placeholderData: keepPreviousData,
    ...(opcoes?.enabled === undefined ? {} : { enabled: opcoes.enabled }),
  });
}

/** Detalhe de uma coleção — usado pela tela `/colecoes/$id` (não escaneia a listagem inteira). */
export function useColecao(id: string) {
  return useQuery({
    queryKey: colecoesKeys.detalhe(id),
    queryFn: () => colecoesApi.obter(id),
    enabled: Boolean(id),
  });
}

/** Produtos atualmente vinculados à coleção (somente leitura). */
export function useProdutosDaColecao(id: string) {
  return useQuery({
    queryKey: colecoesKeys.produtos(id),
    queryFn: () => colecoesApi.listarProdutos(id),
    enabled: Boolean(id),
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

/**
 * Sem `staleTime` (ao contrário da versão antiga, não-paginada, deste hook):
 * a listagem principal precisa que TODA troca de página dispare uma
 * requisição nova de verdade — inclusive ao voltar para uma página já vista.
 */
export function useCampanhas(filtros: CampanhaFiltros, opcoes?: { enabled?: boolean }) {
  return useQuery({
    queryKey: campanhasKeys.lista(filtros),
    queryFn: () => campanhasApi.listar(filtros),
    placeholderData: keepPreviousData,
    ...(opcoes?.enabled === undefined ? {} : { enabled: opcoes.enabled }),
  });
}

/** Detalhe de uma campanha — usado pela tela `/campanhas/$id` (não escaneia a listagem inteira). */
export function useCampanha(id: string) {
  return useQuery({
    queryKey: campanhasKeys.detalhe(id),
    queryFn: () => campanhasApi.obter(id),
    enabled: Boolean(id),
  });
}

/** Produtos atualmente vinculados à campanha (somente leitura). */
export function useProdutosDaCampanha(id: string) {
  return useQuery({
    queryKey: campanhasKeys.produtos(id),
    queryFn: () => campanhasApi.listarProdutos(id),
    enabled: Boolean(id),
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
