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
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { formatarMoeda } from "@/utils/format";
import { gerarIdempotencyKey } from "@/utils/idempotencia";
import { MOTIVOS_ENTRADA, MOTIVOS_SAIDA, type SaidaCaixaPayload } from "@/types/caixa";

/**
 * Entrada/saída manual. A saída exige motivo, descrição e forma de pagamento
 * — mas NÃO bloqueia por saldo (Etapa 18.6): o backend permite sangria maior
 * que o saldo disponível (Caixa pode ficar negativo, ver Etapas 18.2-18.4),
 * então o frontend não pode impedir uma operação que o backend permite
 * deliberadamente. `saldoDisponivel` continua exibido apenas como informação
 * ao operador, nunca como limite de validação.
 */
export function MovimentacaoCaixaDialog({
  tipo,
  open,
  onOpenChange,
  saldoDisponivel,
  salvando,
  onConfirmar,
}: {
  tipo: "entrada" | "saida";
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  saldoDisponivel: number;
  salvando: boolean;
  onConfirmar: (payload: SaidaCaixaPayload) => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const formas = configuracoes?.formasPagamento ?? ["Dinheiro"];
  const sugestoes = tipo === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA;

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [motivo, setMotivo] = useState<string>(sugestoes[0]!);
  const [observacao, setObservacao] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescricao("");
    setValor("");
    setFormaPagamento(formas[0] ?? "Dinheiro");
    setMotivo(sugestoes[0]!);
    setObservacao("");
    setConfirmando(false);
  }, [open, formas, sugestoes]);

  const numero = Number(valor.replace(",", "."));
  const valorInvalido = !Number.isFinite(numero) || numero <= 0;
  const invalido = descricao.trim().length < 3 || valorInvalido || !formaPagamento;

  function confirmar() {
    onConfirmar({
      descricao: descricao.trim(),
      valor: numero,
      formaPagamento,
      motivo: motivo,
      observacao: observacao.trim(),
      idempotencyKey: gerarIdempotencyKey(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl">
            {tipo === "entrada" ? "Registrar entrada" : "Registrar saída"}
          </DialogTitle>
          <DialogDescription>
            {tipo === "entrada"
              ? "Suprimentos e ajustes que aumentam o valor em gaveta."
              : `Retiradas e despesas. Saldo disponível: ${formatarMoeda(saldoDisponivel)}.`}
          </DialogDescription>
        </DialogHeader>

        {confirmando ? (
          <div className="space-y-3">
            <p className="text-sm">Confirmar o registro desta movimentação?</p>
            <dl className="space-y-1 rounded-lg bg-secondary/60 px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Descrição</dt>
                <dd className="text-right">{descricao.trim()}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Valor</dt>
                <dd
                  className={
                    tipo === "entrada"
                      ? "tabular-nums text-emerald-600"
                      : "tabular-nums text-rose-600"
                  }
                >
                  {tipo === "entrada" ? "+" : "−"} {formatarMoeda(numero)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Forma de pagamento</dt>
                <dd>{formaPagamento}</dd>
              </div>
              {tipo === "saida" ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd>{motivo}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mov-descricao">Descrição *</Label>
              <Input
                id="mov-descricao"
                value={descricao}
                onChange={(evento) => setDescricao(evento.target.value)}
                placeholder={tipo === "entrada" ? "Suprimento de troco" : "Compra de material"}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mov-valor">Valor *</Label>
                <Input
                  id="mov-valor"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valor}
                  onChange={(evento) => setValor(evento.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mov-forma">Forma de pagamento *</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger id="mov-forma">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formas.map((forma) => (
                      <SelectItem key={forma} value={forma}>
                        {forma}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mov-motivo">{tipo === "saida" ? "Motivo *" : "Motivo"}</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger id="mov-motivo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sugestoes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mov-observacao">Observação</Label>
              <Textarea
                id="mov-observacao"
                rows={2}
                value={observacao}
                onChange={(evento) => setObservacao(evento.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => (confirmando ? setConfirmando(false) : onOpenChange(false))}
          >
            {confirmando ? "Voltar" : "Cancelar"}
          </Button>
          <Button
            disabled={invalido || salvando}
            onClick={() => (confirmando ? confirmar() : setConfirmando(true))}
          >
            {salvando ? "Registrando…" : confirmando ? "Confirmar" : "Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
