import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { galeriaApi } from "@/services/api/galeria.api";
import { produtosKeys } from "@/hooks/use-produtos";
import { dependenciasEnvioPadrao } from "@/services/midia/dependencias-envio";
import {
  enviarMidia,
  reconciliarEnvio,
  descartarPendencia,
  type ParametrosEnvio,
  type ResultadoEnvio,
} from "@/services/midia/envio-midia";
import type { GaleriaProduto } from "@/types/media";

/**
 * Fase 22.8.9.9.2 (M2) — camada de dados da galeria para a interface (M3). Nenhuma tela usa estes hooks ainda.
 * Toda comunicação HTTP fica em `galeriaApi` e `envio-midia`; aqui só cache e invalidação.
 */
export const galeriaKeys = {
  galeria: (produtoId: string) => [...produtosKeys.detalhe(produtoId), "galeria"] as const,
};

export function useGaleria(produtoId: string) {
  return useQuery({
    queryKey: galeriaKeys.galeria(produtoId),
    queryFn: () => galeriaApi.listar(produtoId),
    enabled: Boolean(produtoId),
  });
}

/** Atualiza o cache com a galeria devolvida e invalida o produto (a imagem principal/legado podem mudar). */
function useAplicarGaleria(produtoId: string) {
  const queryClient = useQueryClient();
  return (galeria: GaleriaProduto) => {
    queryClient.setQueryData(galeriaKeys.galeria(produtoId), galeria);
    void queryClient.invalidateQueries({ queryKey: produtosKeys.detalhe(produtoId), exact: true });
    void queryClient.invalidateQueries({ queryKey: ["produtos", "lista"] });
  };
}

export function useDefinirMidiaPrincipal(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: (midiaId: string) => galeriaApi.definirPrincipal(produtoId, midiaId),
    onSuccess: aplicar,
  });
}

export function useReordenarMidias(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: (midiaIds: string[]) => galeriaApi.reordenar(produtoId, midiaIds),
    onSuccess: aplicar,
  });
}

export function useAssociarVarianteMidia(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: ({ midiaId, varianteId }: { midiaId: string; varianteId: string | null }) =>
      galeriaApi.associarVariante(produtoId, midiaId, varianteId),
    onSuccess: aplicar,
  });
}

export function useRemoverMidia(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: (midiaId: string) => galeriaApi.remover(produtoId, midiaId),
    onSuccess: aplicar,
  });
}

/**
 * Envio de UM arquivo (solicitação → PUT direto → confirmação). O resultado nunca é lançado: a tela decide pela
 * etapa/tipo de falha. Só `confirmado` atualiza a galeria; `confirmacao_pendente` exige `useReconciliarEnvio`.
 */
export function useEnviarMidia(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: (params: Omit<ParametrosEnvio, "produtoId">): Promise<ResultadoEnvio> =>
      enviarMidia({ ...params, produtoId }, dependenciasEnvioPadrao),
    onSuccess: (resultado) => {
      if (resultado.estado === "confirmado") aplicar(resultado.galeria);
    },
  });
}

export function useReconciliarEnvio(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: (uploadId: string) =>
      reconciliarEnvio(produtoId, uploadId, dependenciasEnvioPadrao),
    onSuccess: (resultado) => {
      if (resultado.estado === "confirmado") aplicar(resultado.galeria);
    },
  });
}

/** Envios desta sessão do app aguardando reconciliação (só em memória). */
export function enviosPendentes(produtoId: string) {
  return dependenciasEnvioPadrao.pendencias.listar(produtoId);
}

export function descartarEnvioPendente(produtoId: string, uploadId: string): void {
  descartarPendencia(produtoId, uploadId, dependenciasEnvioPadrao);
}
