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
import { AvisoOperacaoPendente } from "@/components/common/aviso-operacao-pendente";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { formatarMoeda } from "@/utils/format";
import type { OperacaoPendente } from "@/utils/operacao-pendente";
import type { ParcelaVenda, VendaDetalhe } from "@/types/venda";

const FORMAS_PADRAO = ["Dinheiro"];

/** O que o operador confirma. A `idempotencyKey` da operação é anexada pela página. */
export interface DadosRecebimento {
  forma: string;
  valor: number;
  observacao?: string;
}

/**
 * Recebimento posterior (Etapa 18.29) — valor livre contra o saldo pendente,
 * sem exigir uma parcela formal.
 *
 * Fase 2:
 * - (P2-01) também é o diálogo da baixa de UMA parcela (`parcela` informada): o valor é o da parcela (o backend só
 *   quita parcela inteira) e a forma de pagamento precisa ser ESCOLHIDA — nunca herda a forma da venda (numa venda
 *   fiada, "A definir", que não entra no dinheiro da gaveta).
 * - A forma começa vazia nos dois modos: o recebimento só é confirmado com uma forma escolhida pelo operador.
 * - (P1-02) com uma operação incerta, mostra só o aviso: reenviar a mesma operação (mesma chave) ou descartá-la.
 */
export function RecebimentoDialog({
  venda,
  parcela = null,
  open,
  onOpenChange,
  salvando,
  pendente,
  onConfirmar,
  onTentarNovamente,
  onDescartarPendente,
}: {
  venda: VendaDetalhe;
  /** Baixa de uma parcela específica; `null` = recebimento de valor livre. */
  parcela?: ParcelaVenda | null;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  salvando: boolean;
  /** Operação incerta deste recebimento (ou desta parcela), se houver. */
  pendente: OperacaoPendente<DadosRecebimento> | null;
  onConfirmar: (dados: DadosRecebimento) => void;
  onTentarNovamente: () => void;
  onDescartarPendente: () => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const formas = configuracoes?.formasPagamento ?? FORMAS_PADRAO;

  const [forma, setForma] = useState("");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setForma("");
    setValor(String(parcela ? parcela.valor : venda.valorPendente).replace(".", ","));
    setObservacao("");
  }, [open, parcela, venda.valorPendente]);

  const numero = parcela ? parcela.valor : Number(valor.replace(",", "."));
  // Na baixa de parcela o valor é o da parcela; a regra de quitação é do backend (mesmo comportamento de antes).
  const valorInvalido =
    !Number.isFinite(numero) || numero <= 0 || (!parcela && numero > venda.valorPendente + 0.005);
  const invalido = !forma || !formas.includes(forma) || valorInvalido;
  const novoSaldo = Math.max(
    0,
    Number((venda.valorPendente - (Number.isFinite(numero) ? numero : 0)).toFixed(2)),
  );

  function confirmar() {
    const observacaoLimpa = parcela ? "" : observacao.trim();
    onConfirmar({
      forma,
      valor: Number(numero.toFixed(2)),
      ...(observacaoLimpa ? { observacao: observacaoLimpa } : {}),
    });
  }

  const rotuloParcela = parcela ? `parcela ${parcela.numero}/${parcela.total}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            {parcela ? `Receber ${rotuloParcela}` : "Receber pagamento"}
            <CodigoBadge codigo={venda.codigo} />
          </DialogTitle>
          <DialogDescription>
            {parcela
              ? "Escolha como a parcela foi paga. A baixa é registrada no caixa aberto com essa forma de pagamento."
              : "Registre um recebimento parcial ou total contra o saldo pendente desta venda."}
          </DialogDescription>
        </DialogHeader>

        {pendente ? (
          <AvisoOperacaoPendente
            resumo={`Recebimento de ${formatarMoeda(pendente.payload.valor)} em ${
              pendente.payload.forma
            }${parcela ? ` (${rotuloParcela})` : ""}`}
            enviando={salvando}
            onTentarNovamente={onTentarNovamente}
            onDescartar={onDescartarPendente}
          />
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg bg-secondary/60 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <dt className="text-sm text-muted-foreground">Saldo atual</dt>
                <dd className="text-base tabular-nums">{formatarMoeda(venda.valorPendente)}</dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <dt className="text-sm text-muted-foreground">Valor a receber</dt>
                <dd className="text-base font-medium tabular-nums text-success">
                  {Number.isFinite(numero) ? `+ ${formatarMoeda(numero)}` : "—"}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <dt className="text-sm font-medium text-foreground">Novo saldo</dt>
                <dd className="text-xl font-semibold tabular-nums text-primary">
                  {formatarMoeda(novoSaldo)}
                </dd>
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
                  readOnly={Boolean(parcela)}
                  className={parcela ? "bg-muted/40" : undefined}
                  onChange={(evento) => setValor(evento.target.value)}
                />
                {parcela ? (
                  <p className="text-xs text-muted-foreground">
                    Valor da parcela (a parcela é quitada por inteiro).
                  </p>
                ) : valorInvalido && valor ? (
                  <p className="text-xs text-destructive">
                    Informe um valor maior que zero e até o saldo pendente.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="receb-forma">Forma de pagamento *</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger id="receb-forma">
                    <SelectValue placeholder="Selecione como foi pago" />
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

            {parcela ? null : (
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
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {pendente ? "Fechar" : "Voltar"}
          </Button>
          {pendente ? null : (
            <Button disabled={invalido || salvando} onClick={confirmar}>
              {salvando
                ? "Registrando…"
                : forma
                  ? `Confirmar recebimento em ${forma}`
                  : "Confirmar recebimento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
