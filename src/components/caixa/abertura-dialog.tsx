import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatarMoeda } from "@/utils/format";
import type { AberturaCaixaPayload } from "@/types/caixa";

/**
 * Abertura de caixa: código, data e hora são gerados pelo sistema. Etapa
 * 18.6 — sem seletor de responsável: o Caixa Geral da Loja não tem vínculo
 * de vendedor (Etapas 18.2-18.5), então o payload nunca envia `responsavelId`.
 */
export function AberturaCaixaDialog({
  open,
  onOpenChange,
  salvando,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  salvando: boolean;
  onConfirmar: (payload: AberturaCaixaPayload) => void;
}) {
  const [valorInicial, setValorInicial] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setValorInicial("");
    setObservacao("");
  }, [open]);

  const valor = Number(valorInicial.replace(",", "."));
  const invalido = !Number.isFinite(valor) || valorInicial.trim() === "" || valor < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            Abrir caixa
            <Badge variant="outline">Código automático</Badge>
          </DialogTitle>
          <DialogDescription>
            Data, horário e código são registrados automaticamente pelo sistema no momento da
            abertura.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="abertura-valor">Valor inicial *</Label>
            <Input
              id="abertura-valor"
              inputMode="decimal"
              placeholder="0,00"
              value={valorInicial}
              onChange={(evento) => setValorInicial(evento.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="abertura-observacao">Observação</Label>
            <Textarea
              id="abertura-observacao"
              rows={2}
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="Opcional"
            />
          </div>

          {!invalido ? (
            <p className="rounded-lg bg-secondary/60 px-4 py-3 text-sm">
              Você está abrindo o caixa com <strong>{formatarMoeda(valor)}</strong>.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={invalido || salvando}
            onClick={() =>
              onConfirmar({
                valorInicial: valor,
                observacao: observacao.trim(),
              })
            }
          >
            {salvando ? "Abrindo…" : "Abrir caixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
