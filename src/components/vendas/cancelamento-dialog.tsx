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
import { formatarDataHora, formatarMoeda } from "@/utils/format";
import { lerAssinatura } from "@/utils/operacao-cancelamento";
import { descricaoItemVenda } from "@/utils/venda";
import type { CancelamentoPayload, VendaDetalhe } from "@/types/venda";

interface SelecaoItem {
  marcado: boolean;
  quantidade: number;
}

/** Fase 22.5.2 — estado exibido de uma operação de cancelamento sem confirmação, sempre de UMA venda. */
export type AvisoOperacaoCancelamento =
  | {
      vendaId: string;
      estado: "incerta";
      assinatura: string;
      incertaDesde: string | null;
      /** `false` se o registro não pôde ser gravado no `sessionStorage` (proteção só até sair/recarregar). */
      persistida: boolean;
      /** Fase 22.6.1 — recuperada de um envio interrompido (reload/fechamento durante a requisição). */
      interrompida?: boolean;
    }
  | { vendaId: string; estado: "invalida" };

function resumoDaOperacao(assinatura: string, venda: VendaDetalhe): string | null {
  const operacao = lerAssinatura(assinatura);
  if (!operacao) return null;
  if (operacao.tipo === "integral") return "Cancelamento integral";
  const itens = operacao.itens.map(({ itemId, quantidade }) => {
    const nome = venda.itens.find((item) => item.id === itemId)?.nome ?? itemId;
    return `${quantidade}× ${nome}`;
  });
  return `Devolução parcial: ${itens.join(", ")}`;
}

/**
 * Fase 22.5.2 — aviso de operação anterior sem confirmação (usado na página e no diálogo). O descarte pede uma
 * segunda confirmação: ele libera uma chave nova e, se a operação anterior TIVER sido registrada, repeti-la depois
 * gera uma segunda devolução.
 */
export function AvisoOperacaoIncerta({
  aviso,
  venda,
  onDescartar,
}: {
  aviso: AvisoOperacaoCancelamento;
  venda: VendaDetalhe;
  onDescartar: () => void;
}) {
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const resumo = aviso.estado === "incerta" ? resumoDaOperacao(aviso.assinatura, venda) : null;

  return (
    <div
      role="status"
      className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      {aviso.estado === "incerta" ? (
        <>
          <p>
            <strong>Há uma operação anterior cuja confirmação não foi obtida</strong>
            {aviso.incertaDesde ? ` (tentativa de ${formatarDataHora(aviso.incertaDesde)})` : ""}.
            {aviso.interrompida
              ? " A página foi recarregada ou fechada enquanto ela era enviada — ela pode ter sido registrada."
              : ""}{" "}
            Confira o histórico da venda antes de continuar. Assim que o histórico mostrar esta
            operação, este aviso se encerra sozinho.
          </p>
          {resumo ? <p className="text-muted-foreground">Operação pendente: {resumo}.</p> : null}
          <p>
            Reenviar <strong>exatamente a mesma operação</strong> é seguro: se ela já tiver sido
            registrada, não será duplicada. Uma operação diferente só pode ser feita depois de
            descartar a pendente.
          </p>
          {aviso.persistida ? null : (
            <p className="text-warning">
              Não foi possível guardar esta proteção no navegador: ela se perde se você recarregar
              ou sair desta página.
            </p>
          )}
        </>
      ) : (
        <p>
          <strong>
            Foi encontrado um registro de operação anterior sem confirmação, mas ele está ilegível
            ou em formato incompatível
          </strong>{" "}
          e não pode ser usado para reenviar com segurança. Confira o histórico da venda. Novas
          operações ficam bloqueadas até você descartar este registro.
        </p>
      )}

      {confirmandoDescarte ? (
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-background/60 px-3 py-2">
          <p>
            Descartar <strong>não desfaz nem cancela</strong> uma operação que já tenha sido
            registrada no sistema: apenas remove esta proteção neste navegador e permite registrar
            uma nova operação. Se a operação anterior já tiver sido registrada, uma nova igual será
            uma <strong>segunda devolução</strong>. Descarte apenas depois de conferir o histórico.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmandoDescarte(false);
                onDescartar();
              }}
            >
              Confirmar descarte
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmandoDescarte(false)}>
              Manter operação pendente
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmandoDescarte(true)}>
          Já conferi o histórico — descartar
        </Button>
      )}
    </div>
  );
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
  avisoOperacao,
  onDescartarOperacaoIncerta,
  onConfirmar,
}: {
  venda: VendaDetalhe;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  salvando: boolean;
  /** Fase 22.5.1/22.5.2 — tentativa anterior sem confirmação (ou registro dela ilegível) para ESTA venda. */
  avisoOperacao: AvisoOperacaoCancelamento | null;
  /** Fase 22.5.1/22.5.2 — o operador conferiu o histórico e descarta a operação pendente (após confirmar). */
  onDescartarOperacaoIncerta: () => void;
  /** O payload sai SEM `idempotencyKey` — a página anexa a chave da operação. */
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

  // Fase 22.5.1 — a `idempotencyKey` NÃO é gerada aqui: a página (`vendas.$id.tsx`) a anexa ao payload. Este diálogo
  // desmonta quando a consulta da venda entra em erro (ex.: refetch sem rede após um timeout) e a chave da operação
  // pendente se perderia junto com qualquer `useRef` local.

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
          {avisoOperacao ? (
            <AvisoOperacaoIncerta
              aviso={avisoOperacao}
              venda={venda}
              onDescartar={onDescartarOperacaoIncerta}
            />
          ) : null}

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
            disabled={invalido || salvando || avisoOperacao?.estado === "invalida"}
            onClick={() =>
              onConfirmar(
                tipo === "integral"
                  ? { tipo: "integral", motivo: motivo.trim() }
                  : { tipo: "parcial", motivo: motivo.trim(), itens: itensSelecionados },
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
