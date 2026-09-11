import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CodigoBadge } from "@/components/common/codigo-badge";
import { formatarMoeda } from "@/utils/format";
import { gerarIdempotencyKey } from "@/utils/idempotencia";
import { descricaoItemVenda } from "@/utils/venda";
import type { CancelamentoPayload, VendaDetalhe } from "@/types/venda";

interface SelecaoItem {
  marcado: boolean;
  quantidade: number;
}

/**
 * Cancelamento/devolução — o ÚNICO caminho de correção de uma venda finalizada.
 * A venda em si permanece imutável: a devolução gera um novo evento.
 */
export function CancelamentoDialog({
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
  onConfirmar: (payload: CancelamentoPayload) => void;
}) {
  const [tipo, setTipo] = useState<"integral" | "parcial">("integral");
  const [motivo, setMotivo] = useState("");
  const [selecao, setSelecao] = useState<Record<string, SelecaoItem>>({});

  const disponiveis = useMemo(
    () => venda.itens.filter((item) => item.quantidade - item.quantidadeDevolvida > 0),
    [venda.itens],
  );

  useEffect(() => {
    if (!open) return;
    setTipo("integral");
    setMotivo("");
    setSelecao(
      Object.fromEntries(
        disponiveis.map((item) => [
          item.id,
          { marcado: false, quantidade: item.quantidade - item.quantidadeDevolvida },
        ]),
      ),
    );
  }, [open, disponiveis]);

  const itensSelecionados = disponiveis
    .filter((item) => selecao[item.id]?.marcado)
    .map((item) => ({ itemId: item.id, quantidade: selecao[item.id]?.quantidade ?? 1 }));

  const valorEstimado =
    tipo === "integral"
      ? disponiveis.reduce(
          (total, item) =>
            total + item.precoPraticado * (item.quantidade - item.quantidadeDevolvida),
          0,
        )
      : itensSelecionados.reduce((total, selecionado) => {
          const item = disponiveis.find((registro) => registro.id === selecionado.itemId);
          return total + (item ? item.precoPraticado * selecionado.quantidade : 0);
        }, 0);

  const invalido =
    motivo.trim().length < 3 || (tipo === "parcial" && itensSelecionados.length === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">
            Cancelar / devolver
            <CodigoBadge codigo={venda.codigo} />
          </DialogTitle>
          <DialogDescription>
            A venda é imutável: a correção acontece por devolução, que retorna as peças ao estoque e
            fica registrada no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  valor: "integral",
                  titulo: "Cancelamento integral",
                  texto: "Devolve todos os itens e cancela a venda.",
                },
                {
                  valor: "parcial",
                  titulo: "Devolução parcial",
                  texto: "Devolve apenas os itens escolhidos.",
                },
              ] as const
            ).map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => setTipo(opcao.valor)}
                aria-pressed={tipo === opcao.valor}
                className={
                  tipo === opcao.valor
                    ? "rounded-xl border border-primary/45 bg-primary-soft/60 px-4 py-3 text-left"
                    : "rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-primary/30"
                }
              >
                <p className="text-sm font-medium">{opcao.titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {opcao.texto}
                </p>
              </button>
            ))}
          </div>

          {tipo === "parcial" ? (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {disponiveis.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todos os itens desta venda já foram devolvidos.
                </p>
              ) : (
                disponiveis.map((item) => {
                  const restante = item.quantidade - item.quantidadeDevolvida;
                  const estado = selecao[item.id] ?? { marcado: false, quantidade: restante };
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                      <Checkbox
                        id={`dev-${item.id}`}
                        checked={estado.marcado}
                        onCheckedChange={(marcado) =>
                          setSelecao((atual) => ({
                            ...atual,
                            [item.id]: { ...estado, marcado: marcado === true },
                          }))
                        }
                      />
                      <Label htmlFor={`dev-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block truncate text-sm">{item.nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {descricaoItemVenda(item)} · {formatarMoeda(item.precoPraticado)} · até{" "}
                          {restante}
                        </span>
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={restante}
                        aria-label={`Quantidade a devolver de ${item.nome}`}
                        value={estado.quantidade}
                        disabled={!estado.marcado}
                        onChange={(evento) =>
                          setSelecao((atual) => ({
                            ...atual,
                            [item.id]: {
                              ...estado,
                              quantidade: Math.min(
                                restante,
                                Math.max(1, Number(evento.target.value) || 1),
                              ),
                            },
                          }))
                        }
                        className="w-20"
                      />
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="motivo-cancelamento">Motivo</Label>
            <Textarea
              id="motivo-cancelamento"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Descreva o motivo do cancelamento ou da devolução…"
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3">
            <span className="text-sm font-medium text-foreground">Valor a devolver</span>
            <strong className="text-xl font-semibold tabular-nums text-primary">
              {formatarMoeda(valorEstimado)}
            </strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={invalido || salvando}
            onClick={() =>
              onConfirmar(
                tipo === "integral"
                  ? {
                      tipo: "integral",
                      motivo: motivo.trim(),
                      idempotencyKey: gerarIdempotencyKey(),
                    }
                  : {
                      tipo: "parcial",
                      motivo: motivo.trim(),
                      itens: itensSelecionados,
                      idempotencyKey: gerarIdempotencyKey(),
                    },
              )
            }
          >
            {salvando ? "Processando…" : tipo === "integral" ? "Cancelar venda" : "Devolver itens"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
