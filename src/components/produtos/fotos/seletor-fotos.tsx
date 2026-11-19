import { useRef } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { FilaFotos } from "@/hooks/use-fila-fotos";
import { LIMITES_GALERIA } from "@/types/media";
import {
  LIMITE_IMAGENS,
  PODE_REMOVER,
  ROTULO_ESTADO,
  formatarDuracao,
  formatarTamanho,
  rotuloFormato,
  type EstadoItem,
  type ItemFila,
} from "./fila-fotos";

/** Tipos aceitos pelo seletor — os de `LIMITES_GALERIA` (JPEG, PNG, WebP). */
export const ACEITAR_IMAGENS = Object.keys(LIMITES_GALERIA.image.tipos).join(",");

const ICONE: Record<EstadoItem, typeof Clock> = {
  aguardando: Clock,
  solicitando: Loader2,
  enviando: Loader2,
  confirmando: Loader2,
  concluida: CheckCircle2,
  falhou: XCircle,
  confirmacao_pendente: AlertTriangle,
  confirmacao_nao_enviada: ShieldAlert,
};
const GIRANDO: readonly EstadoItem[] = ["solicitando", "enviando", "confirmando"];

/**
 * Fase 22.8.9.9.4 (M3) — seleção de fotos do computador (várias de uma vez, acrescentando à seleção), pré-visualização
 * local, validação antes de qualquer requisição e estado de cada envio. `produtoId === null` (cadastro ainda não
 * salvo): só seleção — nada é enviado antes de o produto existir.
 */
export function SeletorFotos({
  fila,
  produtoId,
  imagensNaGaleria,
}: {
  fila: FilaFotos;
  produtoId: string | null;
  imagensNaGaleria: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const aguardando = fila.fila.filter((i) => i.estado === "aguardando").length;
  const ocupadas = LIMITE_IMAGENS - fila.vagas;

  return (
    <div className="space-y-3" aria-label="Fotos selecionadas para envio">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {ocupadas} de {LIMITE_IMAGENS} fotos ({imagensNaGaleria} na galeria) · {fila.vagas}{" "}
          {fila.vagas === 1 ? "vaga" : "vagas"} {fila.vagas === 1 ? "restante" : "restantes"} ·
          JPEG, PNG ou WebP, até {LIMITES_GALERIA.image.rotuloTamanho} cada
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACEITAR_IMAGENS}
            className="sr-only"
            aria-label="Selecionar fotos do computador"
            data-testid="entrada-fotos"
            onChange={(e) => {
              fila.adicionar(Array.from(e.currentTarget.files ?? []));
              e.currentTarget.value = ""; // permite escolher o mesmo arquivo de novo
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fila.vagas === 0}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus aria-hidden className="size-4" /> Selecionar fotos
          </Button>
          {produtoId && aguardando > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={fila.emAndamento}
              onClick={() => void fila.enviarTodos(produtoId)}
            >
              <Send aria-hidden className="size-4" />
              Enviar {aguardando} {aguardando === 1 ? "foto" : "fotos"}
            </Button>
          ) : null}
          {fila.fila.some((i) => i.estado === "concluida") ? (
            <Button type="button" variant="ghost" size="sm" onClick={fila.limparConcluidos}>
              Limpar concluídas
            </Button>
          ) : null}
        </div>
      </div>

      {fila.recusados.length > 0 ? (
        <Alert variant="destructive" role="alert">
          <XCircle aria-hidden className="size-4" />
          <AlertTitle>
            {fila.recusados.length === 1
              ? "1 arquivo não foi aceito"
              : `${fila.recusados.length} arquivos não foram aceitos`}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {fila.recusados.map((r, i) => (
                <li key={`${r.nome}-${i}`}>
                  <strong>{r.nome}</strong>: {r.motivo}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={fila.limparRecusados}
            >
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {fila.fila.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Fila de envio">
          {fila.fila.map((item) => (
            <ItemDaFila key={item.id} item={item} fila={fila} produtoId={produtoId} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ItemDaFila({
  item,
  fila,
  produtoId,
}: {
  item: ItemFila;
  fila: FilaFotos;
  produtoId: string | null;
}) {
  const Icone = ICONE[item.estado];
  const falhaAntesDeConfirmar = item.estado === "falhou" && item.falha?.etapa !== "validacao";
  return (
    <li
      className="flex gap-3 rounded-lg border border-border bg-card p-2"
      aria-label={`${item.substituiMidiaId ? "Substituição: " : ""}${item.nome} — ${ROTULO_ESTADO[item.estado]}`}
      data-estado={item.estado}
    >
      {item.tipo.startsWith("video/") ? (
        // Fase 22.8.9.9.6 (M4) — pré-visualização LOCAL do vídeo (blob:), sem reprodução automática.
        <video
          src={item.previewUrl}
          controls
          preload="metadata"
          muted
          aria-label={`Pré-visualização de ${item.nome}`}
          className="h-20 w-32 shrink-0 rounded-md border border-border bg-black object-contain"
        />
      ) : (
        <img
          src={item.previewUrl}
          alt={`Pré-visualização de ${item.nome}`}
          className="size-16 shrink-0 rounded-md border border-border object-cover"
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium" title={item.nome}>
          {item.substituiMidiaId ? (
            <span className="text-muted-foreground">Substituição · </span>
          ) : null}
          {item.nome}
        </p>
        <p className="text-xs text-muted-foreground">
          {rotuloFormato(item.tipo)} · {formatarTamanho(item.tamanho)}
          {item.duracaoSegundos !== null ? ` · ${formatarDuracao(item.duracaoSegundos)}` : ""}
        </p>
        <p className="flex items-center gap-1 text-xs" role="status">
          <Icone
            aria-hidden
            className={`size-3.5 ${GIRANDO.includes(item.estado) ? "animate-spin" : ""}`}
          />
          <span>{ROTULO_ESTADO[item.estado]}</span>
          {item.estado === "enviando" && item.progresso !== null ? (
            <span>· {item.progresso}%</span>
          ) : null}
        </p>
        {item.estado === "enviando" ? (
          <Progress
            value={item.progresso ?? 0}
            aria-label={`Progresso do envio de ${item.nome}`}
            className="h-1.5"
          />
        ) : null}
        {item.falha ? <p className="text-xs text-destructive">{item.falha.mensagem}</p> : null}
        {item.falha?.retryAfterSegundos ? (
          <p className="text-xs text-muted-foreground">
            Aguarde cerca de {item.falha.retryAfterSegundos} s antes de tentar de novo. Nada é
            repetido automaticamente.
          </p>
        ) : null}
        {item.estado === "confirmacao_pendente" ? (
          <p className="text-xs text-muted-foreground">
            Não se sabe se a foto entrou na galeria. Nada foi repetido automaticamente.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1 pt-1">
          {PODE_REMOVER.includes(item.estado) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => fila.remover(item.id)}
            >
              <Trash2 aria-hidden className="size-3.5" />{" "}
              {item.estado === "concluida" ? "Tirar da lista" : "Remover"}
            </Button>
          ) : null}
          {produtoId && falhaAntesDeConfirmar && item.falha?.tipo !== "reconciliacao_pendente" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => fila.tentarDeNovo(item.id)}
            >
              <RefreshCw aria-hidden className="size-3.5" /> Tentar de novo
            </Button>
          ) : null}
          {produtoId && item.estado === "confirmacao_pendente" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => void fila.reconciliar(produtoId, item.id)}
            >
              <RefreshCw aria-hidden className="size-3.5" /> Verificar confirmação
            </Button>
          ) : null}
          {produtoId && item.estado === "confirmacao_nao_enviada" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => void fila.retomar(produtoId, item.id)}
            >
              <RefreshCw aria-hidden className="size-3.5" /> Tentar confirmar de novo
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
