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
import { useVendedores } from "@/hooks/use-vendedores";
import { LIMITE_MAXIMO_VENDEDORES } from "@/services/api/vendedores.api";
import { formatarMoeda } from "@/utils/format";
import { MOTIVOS_ENTRADA, MOTIVOS_SAIDA, type SaidaCaixaPayload } from "@/types/caixa";

/**
 * Entrada/saída manual. A saída exige motivo e nunca pode exceder o saldo
 * disponível — a mesma validação existe no mock e existirá no NestJS.
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
  const { data: vendedoresData } = useVendedores({ page: 1, limit: LIMITE_MAXIMO_VENDEDORES });
  const vendedores = vendedoresData?.vendedores;
  const formas = configuracoes?.formasPagamento ?? ["Dinheiro"];
  const sugestoes = tipo === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA;

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [motivo, setMotivo] = useState<string>(sugestoes[0]!);
  const [observacao, setObservacao] = useState("");
  const [responsavelId, setResponsavelId] = useState("backoffice");
  const [confirmando, setConfirmando] = useState(false);
  // Gerada de novo a cada abertura do diálogo: se a requisição de confirmar
  // precisar ser refeita (retry de rede), a mesma chave chega à API e evita
  // duplicar a movimentação — reabrir o diálogo é que gera uma tentativa nova.
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescricao("");
    setValor("");
    setFormaPagamento(formas[0] ?? "Dinheiro");
    setMotivo(sugestoes[0]!);
    setObservacao("");
    setResponsavelId("backoffice");
    setConfirmando(false);
    setIdempotencyKey(crypto.randomUUID());
  }, [open, formas, sugestoes]);

  const numero = Number(valor.replace(",", "."));
  const valorInvalido = !Number.isFinite(numero) || numero <= 0;
  const excedeSaldo = tipo === "saida" && !valorInvalido && numero > saldoDisponivel;
  const invalido = descricao.trim().length < 3 || valorInvalido || !formaPagamento || excedeSaldo;

  function confirmar() {
    onConfirmar({
      descricao: descricao.trim(),
      valor: numero,
      formaPagamento,
      motivo: motivo,
      observacao: observacao.trim(),
      responsavelId: responsavelId === "backoffice" ? null : responsavelId,
      idempotencyKey,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
                {excedeSaldo ? (
                  <p className="text-xs text-rose-600">
                    A saída não pode exceder o saldo de {formatarMoeda(saldoDisponivel)}.
                  </p>
                ) : null}
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

            <div className="grid gap-4 sm:grid-cols-2">
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
                <Label htmlFor="mov-responsavel">Responsável</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger id="mov-responsavel">
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
