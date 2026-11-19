import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  enviarMidia,
  reconciliarEnvio,
  retomarConfirmacao,
  type DependenciasEnvio,
  type ResultadoEnvio,
} from "@/services/midia/envio-midia";
import { dependenciasEnvioPadrao } from "@/services/midia/dependencias-envio";
import { galeriaKeys, pendenciasMidiaKeys } from "@/hooks/use-galeria";
import { produtosKeys } from "@/hooks/use-produtos";
import {
  novoItem,
  percentual,
  proximoParaEnviar,
  validarSelecao,
  vagasRestantes,
  type ItemFila,
  type Recusa,
} from "@/components/produtos/fotos/fila-fotos";

/**
 * Fase 22.8.9.9.4 (M3) — fila de fotos de UM produto: seleção (com pré-visualização `blob:`), envio sequencial pelo
 * fluxo M2 (`enviarMidia`: solicitação → PUT direto → confirmação com registro durável) e estado por item.
 *
 * - Nada é "concluído" antes da confirmação do backend; uma foto que falha não afeta as outras.
 * - Operações incertas NUNCA são repetidas sozinhas: `reconciliar`/`retomar`/`tentarDeNovo` são ações do operador.
 * - URLs `blob:` são liberadas ao remover o item e ao desmontar a tela. Arquivo e URL vivem só em memória.
 */
export interface OpcoesFilaFotos {
  /** Fotos de imagem já na galeria (para o limite). */
  imagensNaGaleria: number;
  deps?: DependenciasEnvio;
  criarUrl?: (arquivo: File) => string;
  liberarUrl?: (url: string) => void;
}

let sequencia = 0;

export function useFilaFotos({
  imagensNaGaleria,
  deps = dependenciasEnvioPadrao,
  criarUrl = (a) => URL.createObjectURL(a),
  liberarUrl = (u) => URL.revokeObjectURL(u),
}: OpcoesFilaFotos) {
  const queryClient = useQueryClient();
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [recusados, setRecusados] = useState<Recusa[]>([]);
  const filaRef = useRef<ItemFila[]>([]);
  filaRef.current = fila;
  const processandoRef = useRef(false);
  const montadoRef = useRef(true);
  const liberarRef = useRef(liberarUrl);
  liberarRef.current = liberarUrl;

  // Ao desmontar: libera TODAS as URLs `blob:` ainda vivas.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      for (const item of filaRef.current) liberarRef.current(item.previewUrl);
    };
  }, []);

  const atualizar = useCallback((id: string, mudanca: Partial<ItemFila>) => {
    if (!montadoRef.current) return;
    setFila((atual) => atual.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }, []);

  const adicionar = useCallback(
    (arquivos: readonly File[], substituiMidiaId: string | null = null) => {
      const vagas = vagasRestantes(imagensNaGaleria, filaRef.current);
      const { aceitos, recusados: novas } = validarSelecao(arquivos, vagas, {
        substituicao: substituiMidiaId !== null,
      });
      setRecusados(novas);
      if (aceitos.length === 0) return [];
      const itens = aceitos.map((a) =>
        novoItem(a, `foto-${(sequencia += 1)}`, criarUrl(a), substituiMidiaId),
      );
      // A ref também é atualizada JÁ: quem chama `enviarTodos` logo em seguida (substituição) precisa ver o item novo
      // antes do próximo render.
      filaRef.current = [...filaRef.current, ...itens];
      setFila((atual) => [...atual, ...itens]);
      return itens;
    },
    [imagensNaGaleria, criarUrl],
  );

  const remover = useCallback((id: string) => {
    const item = filaRef.current.find((i) => i.id === id);
    if (!item) return;
    liberarRef.current(item.previewUrl);
    setFila((atual) => atual.filter((i) => i.id !== id));
  }, []);

  /** Remove da fila os itens já concluídos (a foto está na galeria). */
  const limparConcluidos = useCallback(() => {
    for (const item of filaRef.current.filter((i) => i.estado === "concluida"))
      liberarRef.current(item.previewUrl);
    setFila((atual) => atual.filter((i) => i.estado !== "concluida"));
  }, []);

  const aplicarResultado = useCallback(
    (produtoId: string, id: string, r: ResultadoEnvio) => {
      void queryClient.invalidateQueries({ queryKey: pendenciasMidiaKeys.todas });
      if (r.estado === "confirmado") {
        queryClient.setQueryData(galeriaKeys.galeria(produtoId), r.galeria);
        void queryClient.invalidateQueries({
          queryKey: produtosKeys.detalhe(produtoId),
          exact: true,
        });
        atualizar(id, {
          estado: "concluida",
          progresso: 100,
          falha: null,
          uploadId: r.uploadId,
          retomar: null,
        });
      } else if (r.estado === "confirmacao_pendente") {
        atualizar(id, {
          estado: "confirmacao_pendente",
          falha: r.falha,
          uploadId: r.uploadId,
          progresso: null,
        });
      } else if (r.estado === "confirmacao_nao_enviada") {
        atualizar(id, {
          estado: "confirmacao_nao_enviada",
          falha: r.falha,
          uploadId: r.uploadId,
          retomar: r.retomar,
          progresso: null,
        });
      } else {
        atualizar(id, { estado: "falhou", falha: r.falha, uploadId: r.uploadId, progresso: null });
      }
    },
    [atualizar, queryClient],
  );

  /** Envia, em sequência, todos os itens `aguardando`. Uma falha não interrompe os demais. */
  const enviarTodos = useCallback(
    async (produtoId: string) => {
      if (processandoRef.current) return;
      processandoRef.current = true;
      try {
        for (;;) {
          const item = proximoParaEnviar(filaRef.current);
          if (!item || !montadoRef.current) break;
          // Marca de imediato (ref + estado) para o laço não pegar o mesmo item de novo.
          filaRef.current = filaRef.current.map((i) =>
            i.id === item.id ? { ...i, estado: "solicitando" } : i,
          );
          atualizar(item.id, { estado: "solicitando", falha: null, progresso: null });
          const r = await enviarMidia(
            {
              produtoId,
              arquivo: item.arquivo,
              kind: "image",
              ...(item.substituiMidiaId ? { substituiMidiaId: item.substituiMidiaId } : {}),
              onEtapa: (etapa) =>
                atualizar(item.id, {
                  estado: etapa,
                  ...(etapa === "enviando" ? { progresso: 0 } : {}),
                }),
              onProgresso: (enviados, total) =>
                atualizar(item.id, { progresso: percentual(enviados, total) }),
            },
            deps,
          );
          filaRef.current = filaRef.current.map((i) =>
            i.id === item.id ? { ...i, estado: "falhou" } : i,
          );
          aplicarResultado(produtoId, item.id, r);
          // Uma pendência de confirmação bloqueia novos envios deste produto até ser reconciliada (regra M2).
          if (r.estado === "confirmacao_pendente") break;
        }
      } finally {
        processandoRef.current = false;
      }
    },
    [atualizar, aplicarResultado, deps],
  );

  /** Falhou antes de confirmar: volta para `aguardando` (novo envio completo, nova autorização). */
  const tentarDeNovo = useCallback(
    (id: string) =>
      atualizar(id, { estado: "aguardando", falha: null, progresso: null, uploadId: null }),
    [atualizar],
  );

  /** Confirmação pendente: lê a galeria e, se preciso, repete a confirmação com o MESMO `uploadId` (ação explícita). */
  const reconciliar = useCallback(
    async (produtoId: string, id: string) => {
      const item = filaRef.current.find((i) => i.id === id);
      if (!item?.uploadId) return;
      atualizar(id, { estado: "confirmando", falha: null });
      aplicarResultado(produtoId, id, await reconciliarEnvio(produtoId, item.uploadId, deps));
    },
    [atualizar, aplicarResultado, deps],
  );

  /** Confirmação não enviada (falha de persistência): tenta de novo com o MESMO `uploadId`, sem reenviar o arquivo. */
  const retomar = useCallback(
    async (produtoId: string, id: string) => {
      const item = filaRef.current.find((i) => i.id === id);
      if (!item?.retomar) return;
      atualizar(id, { estado: "confirmando", falha: null });
      aplicarResultado(produtoId, id, await retomarConfirmacao(item.retomar, deps));
    },
    [atualizar, aplicarResultado, deps],
  );

  return {
    fila,
    recusados,
    limparRecusados: () => setRecusados([]),
    vagas: vagasRestantes(imagensNaGaleria, fila),
    adicionar,
    remover,
    limparConcluidos,
    enviarTodos,
    tentarDeNovo,
    reconciliar,
    retomar,
    emAndamento: fila.some((i) => ["solicitando", "enviando", "confirmando"].includes(i.estado)),
  };
}

export type FilaFotos = ReturnType<typeof useFilaFotos>;
