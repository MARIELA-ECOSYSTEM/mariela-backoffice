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
import { AvisoOperacaoPendente } from "@/components/common/aviso-operacao-pendente";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { formatarMoeda } from "@/utils/format";
import { formaPadraoDaGaveta, gavetaDoResumo } from "@/utils/caixa";
import type { OperacaoPendente } from "@/utils/operacao-pendente";
import {
  MOTIVOS_ENTRADA,
  MOTIVOS_SAIDA,
  type EntradaCaixaPayload,
  type ResumoCaixa,
  type SaidaCaixaPayload,
} from "@/types/caixa";

const FORMAS_PADRAO = ["Dinheiro"];

/**
 * Entrada/saída manual. A saída exige motivo, descrição e forma de pagamento
 * — mas NÃO bloqueia por saldo (Etapa 18.6): o backend permite sangria maior
 * que o saldo disponível (Caixa pode ficar negativo, ver Etapas 18.2-18.4),
 * então o frontend não pode impedir uma operação que o backend permite
 * deliberadamente. O dinheiro da gaveta continua exibido apenas como informação
 * ao operador, nunca como limite de validação.
 *
 * Fase 2 — (P2-02) a informação é o DINHEIRO esperado na gaveta (`gavetaDoResumo`), não o saldo de todas as formas, e
 * a forma de pagamento vem preenchida com "Dinheiro". (P1-02) O payload sai SEM `idempotencyKey`: a página anexa a
 * chave da operação; com uma operação incerta, o diálogo mostra só o aviso (reenviar a mesma ou descartar).
 */
export function MovimentacaoCaixaDialog({
  tipo,
  open,
  onOpenChange,
  resumo,
  salvando,
  pendente,
  onConfirmar,
  onTentarNovamente,
  onDescartarPendente,
}: {
  tipo: "entrada" | "saida";
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  resumo: ResumoCaixa;
  salvando: boolean;
  /** Operação incerta deste tipo neste caixa, se houver. */
  pendente: OperacaoPendente<EntradaCaixaPayload | SaidaCaixaPayload> | null;
  onConfirmar: (payload: EntradaCaixaPayload | SaidaCaixaPayload) => void;
  onTentarNovamente: () => void;
  onDescartarPendente: () => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const formas = configuracoes?.formasPagamento ?? FORMAS_PADRAO;
  const sugestoes = tipo === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA;
  const gaveta = gavetaDoResumo(resumo);

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
    setFormaPagamento(formaPadraoDaGaveta(formas));
    setMotivo(sugestoes[0]!);
    setObservacao("");
    setConfirmando(false);
  }, [open, formas, sugestoes]);

  const numero = Number(valor.replace(",", "."));
  const valorInvalido = !Number.isFinite(numero) || numero <= 0;
  const invalido = descricao.trim().length < 3 || valorInvalido || !formaPagamento;

  function confirmar() {
    // `motivo` só existe no contrato real de saída (SaidaCaixaDto) — o backend
    // rejeita a propriedade em uma entrada (EntradaCaixaDto não a declara).
    const base: EntradaCaixaPayload = {
      descricao: descricao.trim(),
      valor: numero,
      formaPagamento,
      observacao: observacao.trim(),
    };
    onConfirmar(tipo === "saida" ? { ...base, motivo } : base);
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
              : `Retiradas e despesas. ${gaveta.rotulo}: ${formatarMoeda(gaveta.valor)}.`}
          </DialogDescription>
        </DialogHeader>

        {pendente ? (
          <AvisoOperacaoPendente
            resumo={`${tipo === "entrada" ? "Entrada" : "Saída"} de ${formatarMoeda(
              pendente.payload.valor,
            )} em ${pendente.payload.formaPagamento} — ${pendente.payload.descricao}`}
            enviando={salvando}
            onTentarNovamente={onTentarNovamente}
            onDescartar={onDescartarPendente}
          />
        ) : confirmando ? (
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
                      ? "text-base font-semibold tabular-nums text-success"
                      : "text-base font-semibold tabular-nums text-destructive"
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
          {pendente ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          ) : (
            <>
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
