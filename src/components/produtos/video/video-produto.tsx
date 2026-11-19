import { useRef, useState } from "react";
import { toast } from "sonner";
import { Film, Loader2, Replace, Send, Trash2, Upload, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useGaleria, useRemoverMidia } from "@/hooks/use-galeria";
import { useFilaFotos, type FilaFotos } from "@/hooks/use-fila-fotos";
import { useMontado } from "@/hooks/use-montado";
import { classificarErroMidia } from "@/services/midia/envio-midia";
import { LIMITES_GALERIA } from "@/types/media";
import type { Produto } from "@/types/produto";
import { galeriaEfetiva } from "@/utils/galeria";
import {
  DURACAO_MAXIMA_VIDEO_S,
  lerDuracaoVideo,
  motivoDuracao,
  type Recusa,
} from "@/components/produtos/fotos/fila-fotos";
import { ItemDaFila } from "@/components/produtos/fotos/seletor-fotos";
import { PlayerVideo } from "./player-video";

/** Tipos aceitos — os de `LIMITES_GALERIA.video` (MP4), iguais aos do backend. */
export const ACEITAR_VIDEO = Object.keys(LIMITES_GALERIA.video.tipos).join(",");

/**
 * Fase 22.8.9.9.6 (M4) — seleção de UM vídeo (antes de o produto existir, só seleção). Lê a duração localmente
 * (metadados) e recusa antes de qualquer requisição o que o backend recusaria (formato, tamanho, duração).
 */
export function SeletorVideo({
  fila,
  produtoId,
  substituiMidiaId,
  rotulo,
}: {
  fila: FilaFotos;
  produtoId: string | null;
  /** Vídeo atual da galeria (a seleção vira SUBSTITUIÇÃO dele). */
  substituiMidiaId: string | null;
  rotulo: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [recusa, setRecusa] = useState<Recusa | null>(null);
  const [lendo, setLendo] = useState(false);
  const aguardando = fila.fila.filter((i) => i.estado === "aguardando").length;

  async function aoEscolher(arquivo: File | undefined) {
    setRecusa(null);
    fila.limparRecusados();
    if (!arquivo) return;
    // Um vídeo por vez: com outro já selecionado ou em envio, nada é acrescentado (nem como segunda substituição).
    if (fila.fila.some((i) => i.estado !== "concluida" && i.estado !== "falhou")) {
      setRecusa({
        nome: arquivo.name,
        motivo:
          "Já há um vídeo selecionado ou em envio para este produto. Remova-o da lista antes de escolher outro.",
      });
      return;
    }
    setLendo(true);
    const duracao = arquivo.type.startsWith("video/") ? await lerDuracaoVideo(arquivo) : null;
    setLendo(false);
    const motivo = motivoDuracao(duracao);
    if (motivo) {
      setRecusa({ nome: arquivo.name, motivo });
      return;
    }
    fila.adicionar([arquivo], substituiMidiaId, duracao);
  }

  const recusas = recusa ? [recusa, ...fila.recusados] : fila.recusados;
  return (
    <div className="space-y-3" aria-label="Seleção de vídeo">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACEITAR_VIDEO}
          className="sr-only"
          aria-label="Selecionar vídeo do computador"
          data-testid="entrada-video"
          onChange={(e) => {
            const arquivo = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            void aoEscolher(arquivo);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={lendo || fila.emAndamento}
          onClick={() => inputRef.current?.click()}
        >
          {lendo ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : substituiMidiaId ? (
            <Replace aria-hidden className="size-4" />
          ) : (
            <Upload aria-hidden className="size-4" />
          )}
          {rotulo}
        </Button>
        {produtoId && aguardando > 0 ? (
          <Button
            type="button"
            size="sm"
            disabled={fila.emAndamento}
            onClick={() => void fila.enviarTodos(produtoId)}
          >
            <Send aria-hidden className="size-4" />{" "}
            {substituiMidiaId ? "Enviar e substituir" : "Enviar vídeo"}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          MP4, até {LIMITES_GALERIA.video.rotuloTamanho} e {DURACAO_MAXIMA_VIDEO_S} s · 1 vídeo por
          produto
        </span>
      </div>
      {recusas.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <XCircle aria-hidden className="size-4" />
          <AlertTitle>Vídeo não aceito</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {recusas.map((r, i) => (
                <li key={`${r.nome}-${i}`}>
                  <strong>{r.nome}</strong>: {r.motivo}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {fila.fila.length > 0 ? (
        <ul className="grid gap-2" aria-label="Envio de vídeo">
          {fila.fila.map((item) => (
            <ItemDaFila key={item.id} item={item} fila={fila} produtoId={produtoId} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Fase 22.8.9.9.6 (M4) — o vídeo do produto (edição e pós-cadastro): player do vídeo CONFIRMADO pela galeria,
 * seleção/substituição e remoção. A tela só muda depois da resposta do backend; o vídeo anterior continua até a
 * substituição ser confirmada. Pendências de confirmação aparecem no painel da galeria de fotos (mesmo registro durável).
 */
export function VideoProduto({
  produto,
  fila: filaExterna,
}: {
  produto: Produto;
  fila?: FilaFotos;
}) {
  const { data: galeria, isPending } = useGaleria(produto.id);
  const video = galeria?.midias.find((m) => m.tipo === "video") ?? null;
  // Fase 22.8.9.9.9 (M4.1) — a fila interna pertence a ESTE produto.
  const filaInterna = useFilaFotos({
    imagensNaGaleria: video ? 1 : 0,
    kind: "video",
    produtoId: produto.id,
  });
  const fila = filaExterna ?? filaInterna;
  const remover = useRemoverMidia(produto.id);
  const legado = galeriaEfetiva({ ...produto, midias: [] }).video;
  const montado = useMontado();

  async function removerVideo() {
    if (!video) return;
    try {
      await remover.mutateAsync(video.id);
      if (montado.current) toast.success("Vídeo removido do produto.");
    } catch (erro) {
      if (montado.current)
        toast.error(
          classificarErroMidia(erro, "reconciliacao").mensagem ||
            "Não foi possível remover o vídeo.",
        );
      throw erro; // mantém o diálogo aberto; o vídeo continua na tela
    }
  }

  return (
    <div className="space-y-4" aria-label="Vídeo do produto">
      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Carregando vídeo…
        </p>
      ) : video ? (
        <div className="space-y-2" data-midia-id={video.id}>
          <PlayerVideo url={video.url} titulo={`Vídeo de ${produto.nome}`} />
          <div className="flex flex-wrap items-center gap-2">
            <p
              className="flex-1 truncate text-xs text-muted-foreground"
              title={video.nomeOriginal ?? undefined}
            >
              <Film aria-hidden className="mr-1 inline size-3.5" />
              {video.nomeOriginal ?? "Vídeo do produto"}
            </p>
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  aria-label="Remover o vídeo"
                >
                  <Trash2 aria-hidden className="size-4" /> Remover vídeo
                </Button>
              }
              titulo="Remover o vídeo do produto?"
              descricao="O vídeo sai da galeria do produto."
              confirmarLabel="Remover"
              onConfirm={removerVideo}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Este produto ainda não tem vídeo.
        </p>
      )}

      {!video && legado ? (
        <section
          aria-label="Vídeo antigo da variante"
          className="space-y-2 rounded-lg border border-border p-3"
        >
          <p className="text-sm font-medium">Vídeo antigo (URL cadastrada numa variante)</p>
          <p className="text-xs text-muted-foreground">
            Continua guardado na variante e não é convertido nem apagado. Um vídeo enviado aqui
            passa a valer no lugar dele.
          </p>
          <PlayerVideo url={legado.url} titulo={`Vídeo antigo de ${produto.nome}`} />
        </section>
      ) : null}

      <SeletorVideo
        fila={fila}
        produtoId={produto.id}
        substituiMidiaId={video?.id ?? null}
        rotulo={video ? "Substituir vídeo" : "Adicionar vídeo"}
      />
    </div>
  );
}
