import { useQuery } from "@tanstack/react-query";
import { campanhasApi, clientesApi, colecoesApi, fornecedoresApi } from "@/services/api/cadastros.api";

export function useClientes() {
  return useQuery({ queryKey: ["clientes"], queryFn: () => clientesApi.listar() });
}

export function useFornecedores() {
  return useQuery({ queryKey: ["fornecedores"], queryFn: () => fornecedoresApi.listar(), staleTime: 60_000 });
}

export function useColecoes() {
  return useQuery({ queryKey: ["colecoes"], queryFn: () => colecoesApi.listar(), staleTime: 60_000 });
}

export function useCampanhas() {
  return useQuery({ queryKey: ["campanhas"], queryFn: () => campanhasApi.listar(), staleTime: 60_000 });
}
