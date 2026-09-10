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
import { CodigoBadge } from "@/components/common/codigo-badge";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { formatarMoeda } from "@/utils/format";
import type { RegistrarRecebimentoPayload, VendaDetalhe } from "@/types/venda";

/**
 * Recebimento posterior (Etapa 18.29) — valor livre contra o saldo pendente,
 * sem exigir uma parcela formal. Uma `idempotencyKey` nova é gerada a cada
 * tentativa de confirmação, para o backend deduplicar retries de rede.
 */
export function RecebimentoDialog({
  venda,
  open,
  onOpenChange,
  salvando,
  onConfirmar,
}: {
  venda: VendaDetalhe;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  salvando: boolean;
  onConfirmar: (payload: RegistrarRecebimentoPayload) => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const formas = configuracoes?.formasPagamento ?? ["Dinheiro"];

  const [forma, setForma] = useState("");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setForma(
      formas.includes(venda.formaPagamento) ? venda.formaPagamento : (formas[0] ?? "Dinheiro"),
    );
    setValor(String(venda.valorPendente).replace(".", ","));
    setObservacao("");
  }, [open, formas, venda.formaPagamento, venda.valorPendente]);

  const numero = Number(valor.replace(",", "."));
  const valorInvalido =
    !Number.isFinite(numero) || numero <= 0 || numero > venda.valorPendente + 0.005;
  const invalido = !forma || valorInvalido;
  const novoSaldo = Math.max(
    0,
    Number((venda.valorPendente - (Number.isFinite(numero) ? numero : 0)).toFixed(2)),
  );

  function confirmar() {
    const observacaoLimpa = observacao.trim();
    onConfirmar({
      forma,
      valor: Number(numero.toFixed(2)),
      ...(observacaoLimpa ? { observacao: observacaoLimpa } : {}),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            Receber pagamento
            <CodigoBadge codigo={venda.codigo} />
          </DialogTitle>
          <DialogDescription>
            Registre um recebimento parcial ou total contra o saldo pendente desta venda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <dl className="space-y-1 rounded-lg bg-secondary/60 px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Saldo atual</dt>
              <dd className="tabular-nums">{formatarMoeda(venda.valorPendente)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Valor a receber</dt>
              <dd className="tabular-nums text-emerald-600">
                {Number.isFinite(numero) ? formatarMoeda(numero) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Novo saldo</dt>
              <dd className="font-medium tabular-nums text-primary">{formatarMoeda(novoSaldo)}</dd>
            </div>
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="receb-valor">Valor *</Label>
              <Input
                id="receb-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(evento) => setValor(evento.target.value)}
              />
              {valorInvalido && valor ? (
                <p className="text-xs text-destructive">
                  Informe um valor maior que zero e até o saldo pendente.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receb-forma">Forma de pagamento *</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger id="receb-forma">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formas.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="receb-observacao">Observação</Label>
            <Textarea
              id="receb-observacao"
              rows={2}
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button disabled={invalido || salvando} onClick={confirmar}>
            {salvando ? "Registrando…" : "Confirmar recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
