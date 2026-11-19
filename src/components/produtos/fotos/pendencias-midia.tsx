import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  descartarEnvioPendente,
  galeriaKeys,
  pendenciasMidiaKeys,
  usePendenciasMidia,
  useReconciliarEnvio,
} from "@/hooks/use-galeria";
import { formatarDataHora } from "@/utils/format";
import type { EnvioPendente } from "@/services/midia/envio-midia";

const ROTULO_ESTADO_REGISTRO = {
  confirmando: "Confirmação iniciada, sem resultado",
  pendente: "Confirmação sem resultado conclusivo",
} as const;

/**
 * Fase 22.8.9.9.4 (M3) — confirmações de mídia PENDENTES deste produto, gravadas no armazenamento durável (inclusive
 * de aberturas anteriores do app). Nada é enviado sozinho: "Verificar e confirmar" lê a galeria e só repete a
 * confirmação (mesmo `uploadId`, mesmo corpo) se a foto ainda não estiver lá. Descartar exige confirmação e não apaga
 * nada no servidor. Registros ilegíveis aparecem à parte e só saem por descarte explícito.
 */
export function PendenciasMidia({
  produtoId,
  nomeProduto,
}: {
  produtoId: string;
  nomeProduto: string;
}) {
  const { data } = usePendenciasMidia();
  const pendentes = data?.pendentes.filter((p) => p.produtoId === produtoId) ?? [];
  const corrompidos = data?.corrompidos ?? [];
  if (data === null) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertTriangle aria-hidden className="size-4" />
        <AlertTitle>Não foi possível ler as confirmações pendentes</AlertTitle>
        <AlertDescription>
          O registro local de confirmações está indisponível. Por segurança, novos envios de fotos
          ficam bloqueados.
        </AlertDescription>
      </Alert>
    );
  }
  if (pendentes.length === 0 && corrompidos.length === 0) return null;
  return (
    <section
      aria-label="Confirmações pendentes"
      className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle aria-hidden className="size-4" />
        Confirmações pendentes
      </p>
      <p className="text-xs text-muted-foreground">
        Estas fotos foram enviadas, mas a confirmação não teve resultado conhecido. Enquanto houver
        pendência, novos envios deste produto ficam bloqueados. Nada é repetido automaticamente.
      </p>
      <ul className="space-y-2">
        {pendentes.map((p) => (
          <ItemPendente key={p.uploadId} pendente={p} nomeProduto={nomeProduto} />
        ))}
        {corrompidos.map((uploadId) => (
          <ItemCorrompido key={uploadId} uploadId={uploadId} />
        ))}
      </ul>
    </section>
  );
}

function useDescartar() {
  const queryClient = useQueryClient();
  return async (uploadId: string) => {
    const ok = await descartarEnvioPendente(uploadId);
    void queryClient.invalidateQueries({ queryKey: pendenciasMidiaKeys.todas });
    if (ok) toast.success("Pendência descartada neste computador.");
    else toast.error("Não foi possível descartar a pendência. Tente novamente.");
  };
}

function ItemPendente({ pendente, nomeProduto }: { pendente: EnvioPendente; nomeProduto: string }) {
  const queryClient = useQueryClient();
  const reconciliar = useReconciliarEnvio(pendente.produtoId);
  const descartar = useDescartar();
  const [resultado, setResultado] = useState<string | null>(null);

  async function verificar() {
    setResultado(null);
    try {
      const r = await reconciliar.mutateAsync(pendente.uploadId);
      if (r.estado === "confirmado") {
        toast.success("Foto confirmada na galeria.");
        void queryClient.invalidateQueries({ queryKey: galeriaKeys.galeria(pendente.produtoId) });
      } else {
        setResultado(r.falha.mensagem);
      }
    } finally {
      void queryClient.invalidateQueries({ queryKey: pendenciasMidiaKeys.todas });
    }
  }

  return (
    <li
      className="space-y-1 rounded-md border border-border bg-card p-2 text-sm"
      aria-label={`Pendência ${pendente.uploadId}`}
    >
      <p>
        <strong>{nomeProduto}</strong> · {pendente.kind === "image" ? "Foto" : "Vídeo"} ·{" "}
        {formatarDataHora(pendente.criadoEm)}
      </p>
      <p className="text-xs text-muted-foreground">
        Estado: {ROTULO_ESTADO_REGISTRO[pendente.estado]}
        {pendente.confirmacao.substituiMidiaId ? " · substituição de foto" : ""}
        {pendente.confirmacao.principal ? " · como foto principal" : ""}
      </p>
      {resultado ? (
        <p className="text-xs text-destructive" role="status">
          {resultado} A pendência foi mantida.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={reconciliar.isPending}
          onClick={() => void verificar()}
        >
          <RefreshCw
            aria-hidden
            className={`size-3.5 ${reconciliar.isPending ? "animate-spin" : ""}`}
          />{" "}
          Verificar e confirmar
        </Button>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
              <Trash2 aria-hidden className="size-3.5" /> Descartar
            </Button>
          }
          titulo="Descartar a pendência?"
          descricao="O registro local desta confirmação será apagado. Nada é removido no servidor: se a foto já entrou na galeria, ela continua lá. Se não entrou, será preciso enviá-la de novo."
          confirmarLabel="Descartar"
          onConfirm={() => descartar(pendente.uploadId)}
        />
      </div>
    </li>
  );
}

function ItemCorrompido({ uploadId }: { uploadId: string }) {
  const descartar = useDescartar();
  return (
    <li
      className="space-y-1 rounded-md border border-destructive/40 bg-card p-2 text-sm"
      aria-label={`Registro ilegível ${uploadId}`}
    >
      <p>Registro de confirmação ilegível</p>
      <p className="text-xs text-muted-foreground">
        Não é possível saber a que foto ele se refere; ele nunca é reaproveitado. Confira a galeria
        e descarte-o.
      </p>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
            <Trash2 aria-hidden className="size-3.5" /> Descartar registro
          </Button>
        }
        titulo="Descartar o registro ilegível?"
        descricao="Só o registro local é apagado. Nada é alterado no servidor."
        confirmarLabel="Descartar"
        onConfirm={() => descartar(uploadId)}
      />
    </li>
  );
}
