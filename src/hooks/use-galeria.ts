import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { galeriaApi } from "@/services/api/galeria.api";
import { produtosKeys } from "@/hooks/use-produtos";
import { dependenciasEnvioPadrao } from "@/services/midia/dependencias-envio";
import {
  enviarMidia,
  reconciliarEnvio,
  retomarConfirmacao,
  verificarPendencias,
  descartarPendencia,
  type ConfirmacaoARetomar,
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

/**
 * Fase 22.8.9.9.3 — nova tentativa da confirmação depois de `confirmacao_nao_enviada` (falha ao gravar o registro
 * durável): mesmo `uploadId`, sem novo envio do arquivo.
 */
export function useRetomarConfirmacao(produtoId: string) {
  const aplicar = useAplicarGaleria(produtoId);
  return useMutation({
    mutationFn: (retomar: ConfirmacaoARetomar) =>
      retomarConfirmacao(retomar, dependenciasEnvioPadrao),
    onSuccess: (resultado) => {
      if (resultado.estado === "confirmado") aplicar(resultado.galeria);
    },
  });
}

/**
 * Fase 22.8.9.9.3 — confirmações pendentes gravadas no armazenamento DURÁVEL (inclusive de aberturas anteriores do
 * app), verificadas SÓ POR LEITURA da galeria (nenhum POST, nenhum upload): as que já estão na galeria são
 * encerradas; as demais ficam aguardando o operador (`useReconciliarEnvio`). Só roda com sessão ativa.
 */
export function useVerificacaoConfirmacoesMidia(habilitada: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["midia", "confirmacoes-pendentes"],
    queryFn: async () => {
      const situacoes = (await verificarPendencias(dependenciasEnvioPadrao)) ?? [];
      for (const s of situacoes) {
        if (s.situacao === "confirmada" && s.produtoId) {
          void queryClient.invalidateQueries({ queryKey: galeriaKeys.galeria(s.produtoId) });
        }
      }
      return situacoes;
    },
    enabled: habilitada,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** Descarte EXPLÍCITO de uma pendência (ou registro corrompido). O registro do backend expira sozinho. */
export function descartarEnvioPendente(uploadId: string): Promise<boolean> {
  return descartarPendencia(uploadId, dependenciasEnvioPadrao);
}
