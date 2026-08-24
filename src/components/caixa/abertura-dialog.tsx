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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useVendedores } from "@/hooks/use-vendedores";
import { formatarMoeda } from "@/utils/format";
import type { AberturaCaixaPayload } from "@/types/caixa";

/** Abertura de caixa: código, data e hora são gerados pelo sistema. */
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
  const { data: vendedores } = useVendedores();
  const [responsavelId, setResponsavelId] = useState("backoffice");
  const [valorInicial, setValorInicial] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setResponsavelId("backoffice");
    setValorInicial("");
    setObservacao("");
  }, [open]);

  const valor = Number(valorInicial.replace(",", "."));
  const invalido = !Number.isFinite(valor) || valorInicial.trim() === "" || valor < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
            <Label htmlFor="abertura-responsavel">Responsável</Label>
            <Select value={responsavelId} onValueChange={setResponsavelId}>
              <SelectTrigger id="abertura-responsavel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backoffice">Backoffice</SelectItem>
                {(vendedores ?? []).map((vendedor) => (
                  <SelectItem key={vendedor.id} value={vendedor.id}>
                    {vendedor.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                responsavelId: responsavelId === "backoffice" ? null : responsavelId,
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
