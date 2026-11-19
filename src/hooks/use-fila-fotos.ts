import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import type { TipoMidia } from "@/types/media";
import {
  itensDoProduto,
  novoItem,
  percentual,
  pertenceAo,
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
 *
 * Fase 22.8.9.9.9 (M4.1) — a fila tem DONO (`produtoId`): cada item pertence a um produto e só é enviado para ele.
 * Se o dono mudar sem a tela ser desmontada, a seleção local do produto anterior é descartada (URLs liberadas) e um
 * envio já em andamento segue até o fim no produto de ORIGEM (o resultado vai para a galeria e as pendências dele),
 * sem alterar a fila do produto novo. Sem dono (`undefined`/`null`) = cadastro: o item se vincula no primeiro envio.
 */
export interface OpcoesFilaFotos {
  /** Fase 22.8.9.9.6 (M4) — tipo da fila (`image` por padrão; `video` para o vídeo do produto). */
  kind?: TipoMidia;
  /** Fotos de imagem já na galeria (para o limite). */
  imagensNaGaleria: number;
  /** Fase 22.8.9.9.9 (M4.1) — produto dono da fila (ausente só no cadastro, antes de o produto existir). */
  produtoId?: string | null;
  deps?: DependenciasEnvio;
  criarUrl?: (arquivo: File) => string;
  liberarUrl?: (url: string) => void;
}

let sequencia = 0;

/** Resultado de um envio que terminou depois de a fila de origem sair da tela: o operador precisa saber. */
function avisarEmSegundoPlano(item: ItemFila, r: ResultadoEnvio) {
  // Confirmado: já está na galeria do produto de origem. Pendente: o registro durável aparece nele ("Confirmações
  // pendentes"). Falhou / confirmação não enviada: nada foi gravado — só o operador pode reenviar.
  if (r.estado === "falhou" || r.estado === "confirmacao_nao_enviada") {
    toast.error(
      `O envio de "${item.nome}", iniciado em outro produto, não foi concluído: ${r.falha.mensagem} Envie o arquivo de novo no produto de origem.`,
    );
  }
}

export function useFilaFotos({
  imagensNaGaleria,
  kind = "image",
  produtoId: dono = null,
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
  const donoRef = useRef(dono);

  // Ao desmontar: libera TODAS as URLs `blob:` ainda vivas.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      for (const item of filaRef.current) liberarRef.current(item.previewUrl);
    };
  }, []);

  // M4.1 — troca de dono sem desmontar: a seleção do produto anterior sai da fila (e da tela) na hora.
  useEffect(() => {
    if (donoRef.current === dono) return;
    donoRef.current = dono;
    if (dono === null) return;
    const deOutro = filaRef.current.filter((i) => !pertenceAo(i, dono));
    if (deOutro.length === 0) return;
    for (const item of deOutro) liberarRef.current(item.previewUrl);
    filaRef.current = filaRef.current.filter((i) => pertenceAo(i, dono));
    setFila((atual) => atual.filter((i) => pertenceAo(i, dono)));
    setRecusados([]);
  }, [dono]);

  const atualizar = useCallback((id: string, mudanca: Partial<ItemFila>) => {
    if (!montadoRef.current) return;
    setFila((atual) => atual.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }, []);

  const adicionar = useCallback(
    (
      arquivos: readonly File[],
      substituiMidiaId: string | null = null,
      duracaoSegundos: number | null = null,
    ) => {
      const visiveis = dono === null ? filaRef.current : itensDoProduto(filaRef.current, dono);
      const vagas = vagasRestantes(imagensNaGaleria, visiveis, kind);
      const { aceitos, recusados: novas } = validarSelecao(arquivos, vagas, {
        substituicao: substituiMidiaId !== null,
        kind,
      });
      setRecusados(novas);
      if (aceitos.length === 0) return [];
      const itens = aceitos.map((a) =>
        novoItem(
          a,
          `${kind === "video" ? "video" : "foto"}-${(sequencia += 1)}`,
          criarUrl(a),
          substituiMidiaId,
          duracaoSegundos,
          dono,
        ),
      );
      // A ref também é atualizada JÁ: quem chama `enviarTodos` logo em seguida (substituição) precisa ver o item novo
      // antes do próximo render.
      filaRef.current = [...filaRef.current, ...itens];
      setFila((atual) => [...atual, ...itens]);
      return itens;
    },
    [imagensNaGaleria, criarUrl, kind, dono],
  );

  const remover = useCallback((id: string) => {
    const item = filaRef.current.find((i) => i.id === id);
    if (!item) return;
    liberarRef.current(item.previewUrl);
    filaRef.current = filaRef.current.filter((i) => i.id !== id);
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

  /**
   * Envia, em sequência, todos os itens `aguardando` QUE PERTENCEM a `produtoId`. Uma falha não interrompe os demais.
   * M4.1: uma fila com dono nunca envia para outro produto; um item sem dono (cadastro) se vincula a `produtoId`.
   */
  const enviarTodos = useCallback(
    async (produtoId: string) => {
      if (donoRef.current !== null && donoRef.current !== produtoId) return;
      if (processandoRef.current) return;
      processandoRef.current = true;
      try {
        for (;;) {
          if (!montadoRef.current || (donoRef.current !== null && donoRef.current !== produtoId))
            break;
          const item = proximoParaEnviar(filaRef.current, produtoId);
          if (!item) break;
          // Marca de imediato (ref + estado) para o laço não pegar o mesmo item de novo — e vincula ao produto.
          filaRef.current = filaRef.current.map((i) =>
            i.id === item.id ? { ...i, estado: "solicitando", produtoId } : i,
          );
          atualizar(item.id, { estado: "solicitando", falha: null, progresso: null, produtoId });
          const r = await enviarMidia(
            {
              produtoId,
              arquivo: item.arquivo,
              kind,
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
          // O item ainda está na fila VISÍVEL (tela montada, mesmo dono)? Senão o resultado é avisado à parte.
          const naTela = montadoRef.current && filaRef.current.some((i) => i.id === item.id);
          filaRef.current = filaRef.current.map((i) =>
            i.id === item.id ? { ...i, estado: "falhou" } : i,
          );
          // A galeria e as pendências são do produto de ORIGEM (`produtoId`), nunca da tela atual.
          aplicarResultado(produtoId, item.id, r);
          if (!naTela) avisarEmSegundoPlano(item, r);
          // Uma pendência de confirmação bloqueia novos envios deste produto até ser reconciliada (regra M2).
          if (r.estado === "confirmacao_pendente") break;
        }
      } finally {
        processandoRef.current = false;
      }
    },
    [atualizar, aplicarResultado, deps, kind],
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
      if (!item?.uploadId || item.produtoId !== produtoId) return;
      atualizar(id, { estado: "confirmando", falha: null });
      aplicarResultado(produtoId, id, await reconciliarEnvio(produtoId, item.uploadId, deps));
    },
    [atualizar, aplicarResultado, deps],
  );

  /** Confirmação não enviada (falha de persistência): tenta de novo com o MESMO `uploadId`, sem reenviar o arquivo. */
  const retomar = useCallback(
    async (produtoId: string, id: string) => {
      const item = filaRef.current.find((i) => i.id === id);
      if (!item?.retomar || item.retomar.produtoId !== produtoId) return;
      atualizar(id, { estado: "confirmando", falha: null });
      aplicarResultado(produtoId, id, await retomarConfirmacao(item.retomar, deps));
    },
    [atualizar, aplicarResultado, deps],
  );

  // M4.1 — a tela só vê (e só pode enviar) os itens do dono atual.
  const visiveis = dono === null ? fila : itensDoProduto(fila, dono);
  return {
    fila: visiveis,
    recusados,
    limparRecusados: () => setRecusados([]),
    vagas: vagasRestantes(imagensNaGaleria, visiveis, kind),
    adicionar,
    remover,
    limparConcluidos,
    enviarTodos,
    tentarDeNovo,
    reconciliar,
    retomar,
    emAndamento: visiveis.some((i) =>
      ["solicitando", "enviando", "confirmando"].includes(i.estado),
    ),
  };
}

export type FilaFotos = ReturnType<typeof useFilaFotos>;
