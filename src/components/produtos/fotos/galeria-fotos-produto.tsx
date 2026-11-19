import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ImageOff,
  Images,
  Loader2,
  RefreshCw,
  Replace,
  Star,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  useDefinirMidiaPrincipal,
  useGaleria,
  useRemoverMidia,
  useReordenarMidias,
} from "@/hooks/use-galeria";
import { useFilaFotos, type FilaFotos } from "@/hooks/use-fila-fotos";
import { mensagemDeErro } from "@/services/api/client";
import { classificarErroMidia } from "@/services/midia/envio-midia";
import { galeriaEfetiva } from "@/utils/galeria";
import type { MidiaProduto } from "@/types/media";
import type { Produto } from "@/types/produto";
import { LIMITE_IMAGENS, ordemComTroca } from "./fila-fotos";
import { PendenciasMidia } from "./pendencias-midia";
import { ACEITAR_IMAGENS, SeletorFotos } from "./seletor-fotos";

/**
 * Fase 22.8.9.9.4 (M3) — gerenciamento das FOTOS da galeria de um produto existente (edição e pós-cadastro). A galeria
 * exibida é SEMPRE a confirmada pelo backend (`GET /produtos/:id/midias`): principal, ordem, substituição e remoção só
 * mudam a tela depois da resposta. Vídeo fica para a M4.
 */
export function GaleriaFotosProduto({
  produto,
  fila: filaExterna,
}: {
  produto: Produto;
  fila?: FilaFotos;
}) {
  const { data: galeria, isPending, isError, refetch } = useGaleria(produto.id);
  const midias = [...(galeria?.midias ?? [])].sort((a, b) => a.ordem - b.ordem);
  const imagens = midias.filter((m) => m.tipo === "image");
  const videos = midias.length - imagens.length;
  const filaInterna = useFilaFotos({ imagensNaGaleria: imagens.length });
  const fila = filaExterna ?? filaInterna;
  const legado = galeriaEfetiva({ ...produto, midias: [] });

  const definirPrincipal = useDefinirMidiaPrincipal(produto.id);
  const reordenar = useReordenarMidias(produto.id);
  const remover = useRemoverMidia(produto.id);
  const [ordemNaoSalva, setOrdemNaoSalva] = useState<string[] | null>(null);
  const ocupadoRef = useRef(false);

  async function salvarOrdem(ids: string[]) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    try {
      await reordenar.mutateAsync(ids);
      setOrdemNaoSalva(null);
      toast.success("Ordem das fotos salva.");
    } catch (erro) {
      // A tela continua mostrando a ordem CONFIRMADA; a tentada fica guardada para nova tentativa.
      setOrdemNaoSalva(ids);
      toast.error(mensagemDeErro(erro, "Não foi possível salvar a nova ordem."));
    } finally {
      ocupadoRef.current = false;
    }
  }

  async function marcarPrincipal(midiaId: string) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    try {
      await definirPrincipal.mutateAsync(midiaId);
      toast.success("Foto principal atualizada.");
    } catch (erro) {
      toast.error(mensagemDeErro(erro, "Não foi possível definir a foto principal."));
    } finally {
      ocupadoRef.current = false;
    }
  }

  async function removerFoto(midiaId: string) {
    try {
      await remover.mutateAsync(midiaId);
      toast.success("Foto removida da galeria.");
    } catch (erro) {
      const f = classificarErroMidia(erro, "reconciliacao");
      toast.error(f.mensagem || "Não foi possível remover a foto.");
      throw erro; // mantém o diálogo aberto; a foto continua na tela
    }
  }

  return (
    <div className="space-y-4" aria-label="Galeria de fotos do produto">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Images aria-hidden className="size-4 text-muted-foreground" />
        <span>
          <strong>{imagens.length}</strong> de {LIMITE_IMAGENS} fotos na galeria
        </span>
        {videos > 0 ? (
          <Badge variant="outline">
            {videos === 1 ? "1 vídeo" : `${videos} vídeos`} (gerenciado em outra etapa)
          </Badge>
        ) : null}
      </div>

      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Carregando galeria…
        </p>
      ) : isError ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden className="size-4" />
          <AlertTitle>Não foi possível carregar a galeria</AlertTitle>
          <AlertDescription>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => void refetch()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : imagens.length > 0 ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          aria-label="Fotos da galeria"
        >
          {imagens.map((m, i) => (
            <CartaoFoto
              key={m.id}
              midia={m}
              posicao={i + 1}
              total={imagens.length}
              principal={galeria?.midiaPrincipalId === m.id}
              nomeProduto={produto.nome}
              ocupado={definirPrincipal.isPending || reordenar.isPending}
              onPrincipal={() => void marcarPrincipal(m.id)}
              onMover={(passo) => {
                const vizinha = imagens[i + passo];
                if (vizinha) void salvarOrdem(ordemComTroca(midias, m.id, vizinha.id));
              }}
              onSubstituir={(arquivo) => {
                const itens = fila.adicionar([arquivo], m.id);
                if (itens.length) void fila.enviarTodos(produto.id);
              }}
              onRemover={() => removerFoto(m.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          A galeria ainda não tem fotos.
        </p>
      )}

      {ordemNaoSalva ? (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden className="size-4" />
          <AlertTitle>A nova ordem não foi salva</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>A galeria mostra a ordem que está salva no servidor.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={reordenar.isPending}
                onClick={() => void salvarOrdem(ordemNaoSalva)}
              >
                <RefreshCw aria-hidden className="size-3.5" /> Tentar salvar de novo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOrdemNaoSalva(null)}
              >
                Descartar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {legado.imagens.length > 0 ? (
        <section
          aria-label="Fotos antigas das variantes"
          className="space-y-2 rounded-lg border border-border p-3"
        >
          <p className="text-sm font-medium">Fotos antigas (URLs cadastradas nas variantes)</p>
          <p className="text-xs text-muted-foreground">
            {imagens.length > 0
              ? "Continuam guardadas nas variantes, mas, com fotos na galeria, a galeria passa a valer como principal."
              : "Continuam valendo enquanto a galeria não tiver fotos. Elas são editadas nas variantes e não são convertidas nem apagadas."}
          </p>
          <ul className="flex flex-wrap gap-2">
            {legado.imagens.map((f) => (
              <li key={f.id} className="relative">
                <ImagemComReserva
                  src={f.url}
                  alt={`Foto antiga de ${produto.nome}`}
                  className="size-16 rounded-md border border-border object-cover"
                />
                {f.principal && imagens.length === 0 ? (
                  <Badge className="absolute -top-2 left-1 gap-1 px-1 py-0 text-[0.6rem]">
                    <Star aria-hidden className="size-2.5" /> Principal
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PendenciasMidia produtoId={produto.id} nomeProduto={produto.nome} />
      <SeletorFotos fila={fila} produtoId={produto.id} imagensNaGaleria={imagens.length} />
    </div>
  );
}

/** `<img>` com reserva visual quando a imagem não carrega (URL externa fora do ar, por exemplo). */
function ImagemComReserva({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <div
        className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}
        role="img"
        aria-label={`${alt} (imagem indisponível)`}
      >
        <ImageOff aria-hidden className="size-5" />
      </div>
    );
  }
  return (
    <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFalhou(true)} />
  );
}

function CartaoFoto({
  midia,
  posicao,
  total,
  principal,
  nomeProduto,
  ocupado,
  onPrincipal,
  onMover,
  onSubstituir,
  onRemover,
}: {
  midia: MidiaProduto;
  posicao: number;
  total: number;
  principal: boolean;
  nomeProduto: string;
  ocupado: boolean;
  onPrincipal: () => void;
  onMover: (passo: -1 | 1) => void;
  onSubstituir: (arquivo: File) => void;
  onRemover: () => Promise<void>;
}) {
  const substituirRef = useRef<HTMLInputElement>(null);
  const rotulo = `Foto ${posicao} de ${total}${principal ? " (principal)" : ""}`;
  return (
    <li
      className="space-y-2 rounded-lg border border-border bg-card p-2"
      aria-label={rotulo}
      data-midia-id={midia.id}
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        <ImagemComReserva
          src={midia.url}
          alt={`${nomeProduto} — foto ${posicao}`}
          className="size-full object-cover"
        />
        {principal ? (
          <Badge className="absolute left-1.5 top-1.5 gap-1">
            <Star aria-hidden className="size-3" /> Principal
          </Badge>
        ) : null}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-card/90 px-1.5 text-xs">
          {posicao}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={`Mover foto ${posicao} para antes`}
          disabled={posicao === 1 || ocupado}
          onClick={() => onMover(-1)}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={`Mover foto ${posicao} para depois`}
          disabled={posicao === total || ocupado}
          onClick={() => onMover(1)}
        >
          <ArrowRight aria-hidden className="size-3.5" />
        </Button>
        {principal ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={ocupado}
            onClick={onPrincipal}
            aria-label={`Tornar a foto ${posicao} a principal`}
          >
            <Star aria-hidden className="size-3.5" /> Principal
          </Button>
        )}
        <input
          ref={substituirRef}
          type="file"
          accept={ACEITAR_IMAGENS}
          className="sr-only"
          aria-label={`Arquivo para substituir a foto ${posicao}`}
          data-testid={`substituir-${midia.id}`}
          onChange={(e) => {
            const arquivo = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (arquivo) onSubstituir(arquivo);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7"
          aria-label={`Substituir a foto ${posicao}`}
          onClick={() => substituirRef.current?.click()}
        >
          <Replace aria-hidden className="size-3.5" />
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              aria-label={`Remover a foto ${posicao}`}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          }
          titulo={`Remover a foto ${posicao}?`}
          descricao={
            principal
              ? "Ela é a foto principal: depois de removida, a primeira foto restante passa a ser a principal."
              : "A foto sai da galeria do produto."
          }
          confirmarLabel="Remover"
          onConfirm={onRemover}
        />
      </div>
    </li>
  );
}
