import { useMutation, useQueryClient } from "@tanstack/react-query";
import { variantesApi } from "@/services/api/variantes.api";
import { produtosKeys } from "./use-produtos";
import type { AdicionarTamanhoRequest, CriarVarianteRequest } from "@/types/variante";

function useInvalidar(produtoId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: produtosKeys.todos });
    void queryClient.invalidateQueries({ queryKey: produtosKeys.detalhe(produtoId) });
    void queryClient.invalidateQueries({ queryKey: ["estoque"] });
  };
}

export function useCriarVariante(produtoId: string) {
  const invalidar = useInvalidar(produtoId);
  return useMutation({
    mutationFn: (payload: CriarVarianteRequest) => variantesApi.criar(produtoId, payload),
    onSuccess: invalidar,
  });
}

export function useAtualizarVariante(produtoId: string) {
  const invalidar = useInvalidar(produtoId);
  return useMutation({
    mutationFn: (vars: { varianteId: string; payload: CriarVarianteRequest }) =>
      variantesApi.atualizar(produtoId, vars.varianteId, vars.payload),
    onSuccess: invalidar,
  });
}

export function useExcluirVariante(produtoId: string) {
  const invalidar = useInvalidar(produtoId);
  return useMutation({
    mutationFn: (varianteId: string) => variantesApi.excluir(produtoId, varianteId),
    onSuccess: invalidar,
  });
}

export function useAdicionarTamanho(produtoId: string) {
  const invalidar = useInvalidar(produtoId);
  return useMutation({
    mutationFn: (vars: { varianteId: string; payload: AdicionarTamanhoRequest }) =>
      variantesApi.adicionarTamanho(produtoId, vars.varianteId, vars.payload),
    onSuccess: invalidar,
  });
}

export function useExcluirTamanho(produtoId: string) {
  const invalidar = useInvalidar(produtoId);
  return useMutation({
    mutationFn: (vars: { varianteId: string; tamanhoId: string }) =>
      variantesApi.excluirTamanho(produtoId, vars.varianteId, vars.tamanhoId),
    onSuccess: invalidar,
  });
}
