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
import { CodigoBadge } from "@/components/common/codigo-badge";
import { formatarMoeda } from "@/utils/format";
import { LABEL_DIFERENCA, situacaoDiferenca } from "@/utils/caixa";
import type { Caixa, FechamentoCaixaPayload } from "@/types/caixa";

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={forte ? "font-medium tabular-nums" : "tabular-nums"}>{valor}</dd>
    </div>
  );
}

/** Conferência física e registro da diferença — encerra o caixa como histórico. */
export function FechamentoCaixaDialog({
  caixa,
  open,
  onOpenChange,
  salvando,
  onConfirmar,
}: {
  caixa: Caixa;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  salvando: boolean;
  onConfirmar: (payload: FechamentoCaixaPayload) => void;
}) {
  const [valorInformado, setValorInformado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValorInformado("");
    setObservacao("");
    setConfirmando(false);
  }, [open]);

  const esperado = caixa.resumo.saldoEsperado;
  const informado = Number(valorInformado.replace(",", "."));
  // Etapa 18.6 — sem piso zero: o Caixa pode fechar negativo (Etapas
  // 18.2-18.4), então `valorInformado` precisa aceitar número negativo. Só
  // exigimos que o campo tenha sido preenchido com um número válido.
  const informadoInvalido = valorInformado.trim() === "" || !Number.isFinite(informado);
  const diferenca = informadoInvalido ? 0 : Number((informado - esperado).toFixed(2));
  const situacao = situacaoDiferenca(diferenca);
  const exigeObservacao = !informadoInvalido && situacao !== "conferido";
  const invalido = informadoInvalido || (exigeObservacao && observacao.trim().length < 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            Fechar caixa
            <CodigoBadge codigo={caixa.codigo} />
          </DialogTitle>
          <DialogDescription>
            Após o fechamento o caixa torna-se histórico imutável: movimentações não podem ser
            editadas nem excluídas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-lg border border-border/70 px-4 py-3">
            <p className="text-eyebrow mb-2 text-[0.58rem]">Resumo do sistema</p>
            <dl className="space-y-1">
              <Linha rotulo="Valor de abertura" valor={formatarMoeda(caixa.resumo.valorAbertura)} />
              <Linha rotulo="Total de vendas" valor={formatarMoeda(caixa.resumo.totalVendas)} />
              <Linha rotulo="Recebimentos" valor={formatarMoeda(caixa.resumo.recebimentos)} />
              <Linha
                rotulo="Entradas manuais"
                valor={formatarMoeda(caixa.resumo.entradasManuais)}
              />
              <Linha rotulo="Total de entradas" valor={formatarMoeda(caixa.resumo.totalEntradas)} />
              <Linha rotulo="Saídas manuais" valor={formatarMoeda(caixa.resumo.saidasManuais)} />
              <Linha rotulo="Devoluções" valor={formatarMoeda(caixa.resumo.devolucoes)} />
              <Linha rotulo="Total de saídas" valor={formatarMoeda(caixa.resumo.totalSaidas)} />
              <Linha rotulo="Saldo esperado" valor={formatarMoeda(esperado)} forte />
            </dl>
          </section>

          <section className="space-y-3">
            <p className="text-eyebrow text-[0.58rem]">Conferência física</p>
            <div className="space-y-2">
              <Label htmlFor="fechamento-valor">Valor contado no caixa *</Label>
              <Input
                id="fechamento-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valorInformado}
                onChange={(evento) => setValorInformado(evento.target.value)}
              />
            </div>

            {!informadoInvalido ? (
              <p
                className={
                  situacao === "conferido"
                    ? "text-sm text-emerald-600"
                    : situacao === "sobra"
                      ? "text-sm text-amber-600"
                      : "text-sm text-rose-600"
                }
              >
                {situacao === "conferido"
                  ? "🟢 Caixa conferido"
                  : situacao === "sobra"
                    ? `🟠 Sobra de ${formatarMoeda(diferenca)}`
                    : `🔴 Falta de ${formatarMoeda(Math.abs(diferenca))}`}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="fechamento-observacao">
                Observação do fechamento {exigeObservacao ? "*" : ""}
              </Label>
              <Textarea
                id="fechamento-observacao"
                rows={2}
                value={observacao}
                onChange={(evento) => setObservacao(evento.target.value)}
                placeholder={
                  exigeObservacao
                    ? "Justifique a diferença encontrada"
                    : "Opcional quando conferido"
                }
              />
            </div>
          </section>

          {confirmando ? (
            <section className="rounded-lg bg-secondary/60 px-4 py-3">
              <p className="mb-2 text-sm font-medium">Confirmar fechamento?</p>
              <dl className="space-y-1">
                <Linha rotulo="Valor esperado" valor={formatarMoeda(esperado)} />
                <Linha rotulo="Valor informado" valor={formatarMoeda(informado)} />
                <Linha rotulo={LABEL_DIFERENCA[situacao]} valor={formatarMoeda(diferenca)} forte />
              </dl>
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => (confirmando ? setConfirmando(false) : onOpenChange(false))}
          >
            {confirmando ? "Voltar" : "Cancelar"}
          </Button>
          <Button
            disabled={invalido || salvando}
            onClick={() =>
              confirmando
                ? onConfirmar({ valorInformado: informado, observacao: observacao.trim() })
                : setConfirmando(true)
            }
          >
            {salvando ? "Fechando…" : confirmando ? "Confirmar fechamento" : "Continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
