import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { LABEL_DIFERENCA, conferenciaDoFechamento } from "@/utils/caixa";
import type { Caixa, FechamentoCaixaPayload } from "@/types/caixa";

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={forte ? "text-base font-semibold tabular-nums" : "tabular-nums"}>{valor}</dd>
    </div>
  );
}

/**
 * Conferência física e registro da diferença — encerra o caixa como histórico.
 *
 * Fase 22.8.9.12 — a conferência é do DINHEIRO da gaveta: o contado é comparado com o dinheiro físico esperado
 * (abertura + movimentos em dinheiro). PIX e cartões aparecem à parte, só como informação, e nunca viram falta.
 */
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

  const conferencia = conferenciaDoFechamento(caixa.resumo, valorInformado);
  const {
    regraDinheiroFisico,
    esperado,
    informado,
    informadoInvalido,
    diferenca,
    situacao,
    exigeObservacao,
  } = conferencia;
  const invalido = informadoInvalido || (exigeObservacao && observacao.trim().length < 3);
  const sufixo = regraDinheiroFisico ? " em dinheiro" : "";
  const rotuloEsperado = regraDinheiroFisico ? "Dinheiro esperado na gaveta" : "Saldo esperado";
  const rotuloContado = regraDinheiroFisico ? "Dinheiro contado na gaveta" : "Valor contado no caixa";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
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
          {regraDinheiroFisico ? (
            <section
              aria-label="Dinheiro na gaveta"
              className="rounded-lg border border-border/70 px-4 py-3"
            >
              <p className="mb-2 text-sm font-medium text-foreground/80">Dinheiro na gaveta</p>
              <dl className="space-y-1">
                <Linha rotulo="Valor de abertura" valor={formatarMoeda(caixa.resumo.valorAbertura)} />
                <Linha
                  rotulo="Movimentos em dinheiro"
                  valor={formatarMoeda(esperado - caixa.resumo.valorAbertura)}
                />
                <Linha rotulo={rotuloEsperado} valor={formatarMoeda(esperado)} forte />
              </dl>
            </section>
          ) : null}

          {regraDinheiroFisico ? (
            <section
              aria-label="Outras formas de pagamento"
              className="rounded-lg border border-border/70 px-4 py-3"
            >
              <p className="text-sm font-medium text-foreground/80">Outras formas de pagamento</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Só para conferência: estes valores não ficam na gaveta e não entram na diferença.
              </p>
              {conferencia.outrasFormas.length > 0 ? (
                <dl className="space-y-1">
                  {conferencia.outrasFormas.map((item) => (
                    <Linha key={item.forma} rotulo={item.forma} valor={formatarMoeda(item.saldo)} />
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum valor em outras formas neste caixa.
                </p>
              )}
            </section>
          ) : null}

          <section
            aria-label="Resumo do sistema"
            className="rounded-lg border border-border/70 px-4 py-3"
          >
            <p className="mb-2 text-sm font-medium text-foreground/80">Resumo do sistema</p>
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
              <Linha
                rotulo={regraDinheiroFisico ? "Saldo de todas as formas" : "Saldo esperado"}
                valor={formatarMoeda(caixa.resumo.saldoEsperado)}
                forte={!regraDinheiroFisico}
              />
            </dl>
          </section>

          <section className="space-y-3">
            <p className="text-sm font-medium text-foreground/80">Conferência física</p>
            <div className="space-y-2">
              <Label htmlFor="fechamento-valor">{rotuloContado} *</Label>
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
                role="status"
                className={
                  situacao === "conferido"
                    ? "flex items-center gap-2 text-sm font-medium text-success"
                    : situacao === "sobra"
                      ? "flex items-center gap-2 text-sm font-medium text-warning"
                      : "flex items-center gap-2 text-sm font-medium text-destructive"
                }
              >
                {situacao === "conferido" ? (
                  <CheckCircle2 aria-hidden className="size-4" />
                ) : (
                  <AlertTriangle aria-hidden className="size-4" />
                )}
                {situacao === "conferido"
                  ? regraDinheiroFisico
                    ? "Dinheiro conferido"
                    : "Caixa conferido"
                  : situacao === "sobra"
                    ? `Sobra de ${formatarMoeda(diferenca)}${sufixo}`
                    : `Falta de ${formatarMoeda(Math.abs(diferenca))}${sufixo}`}
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
            <section
              aria-label="Confirmar fechamento"
              className="rounded-lg bg-secondary/60 px-4 py-3"
            >
              <p className="mb-2 text-sm font-medium">Confirmar fechamento?</p>
              <dl className="space-y-1">
                <Linha
                  rotulo={regraDinheiroFisico ? rotuloEsperado : "Valor esperado"}
                  valor={formatarMoeda(esperado)}
                />
                <Linha
                  rotulo={regraDinheiroFisico ? "Dinheiro contado" : "Valor informado"}
                  valor={formatarMoeda(informado)}
                />
                <Linha
                  rotulo={
                    regraDinheiroFisico && situacao !== "conferido"
                      ? `${LABEL_DIFERENCA[situacao]} (diferença física)`
                      : LABEL_DIFERENCA[situacao]
                  }
                  valor={formatarMoeda(diferenca)}
                  forte
                />
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
