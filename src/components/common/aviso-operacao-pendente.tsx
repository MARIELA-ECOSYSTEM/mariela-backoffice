import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Fase 2 (P1-01/P1-02) — aviso de uma operação cujo resultado ficou INCERTO (timeout, rede, 502/503/504). O diálogo
 * mostra este aviso no lugar do formulário: a única forma de seguir é reenviar a MESMA operação (mesma chave, sem
 * duplicar) ou descartá-la conscientemente. Nunca nasce uma operação nova sem essa decisão.
 */
export function AvisoOperacaoPendente({
  resumo,
  enviando,
  onTentarNovamente,
  onDescartar,
}: {
  /** Descrição curta da operação pendente (ex.: "Entrada de 3 un. no tamanho M"). */
  resumo: string;
  enviando: boolean;
  onTentarNovamente: () => void;
  onDescartar: () => void;
}) {
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />O servidor não
        confirmou a operação anterior. Ela pode ter sido registrada.
      </p>
      <p>
        Operação pendente: <strong>{resumo}</strong>.
      </p>
      <p className="text-muted-foreground">
        <strong>Tentar novamente</strong> reenvia exatamente a mesma operação: se ela já tiver
        chegado ao servidor, não é registrada outra vez.
      </p>
      {confirmandoDescarte ? (
        <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-2">
          <p>
            Descarte só se você <strong>não quer mais</strong> esta operação. Ela pode já ter sido
            registrada: confira o histórico antes de lançar outra.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" onClick={onDescartar}>
              Descartar operação pendente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmandoDescarte(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onTentarNovamente} disabled={enviando}>
            {enviando ? "Enviando…" : "Tentar novamente"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmandoDescarte(true)}
            disabled={enviando}
          >
            Descartar
          </Button>
        </div>
      )}
    </div>
  );
}
