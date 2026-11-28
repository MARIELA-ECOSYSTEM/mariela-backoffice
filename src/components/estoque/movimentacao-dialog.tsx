import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/common/field";
import { AvisoOperacaoPendente } from "@/components/common/aviso-operacao-pendente";
import { movimentacaoSchema, type MovimentacaoFormValues } from "@/schemas/produto.schema";
import { useEntradaEstoque, useSaidaEstoque } from "@/hooks/use-estoque";
import { mensagemDeErro } from "@/services/api/client";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import {
  concluirOperacao,
  contextoOperacao,
  descartarOperacao,
  iniciarOperacao,
  operacaoPendente,
  type OperacaoPendente,
} from "@/utils/operacao-pendente";
import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";

export type TipoMovimentacao = "entrada" | "saida";

/** O que identifica uma movimentação de estoque (sem produto/variante, que vêm do contexto da operação). */
interface MovimentoEstoque {
  tamanhoId: string;
  quantidade: number;
  motivo: string;
}

/** Campos cujo nome no backend (`ApiFieldError.field`) corresponde exatamente ao campo do formulário. */
const CAMPOS_MAPEAVEIS = ["quantidade", "motivo", "tamanhoId"] as const;

export function MovimentacaoDialog({
  tipo,
  produto,
  variante,
  open,
  onOpenChange,
}: {
  tipo: TipoMovimentacao;
  produto: Produto;
  variante: Variante | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const entrada = useEntradaEstoque();
  const saida = useSaidaEstoque();
  const ehSaida = tipo === "saida";

  const form = useForm<MovimentacaoFormValues>({
    resolver: zodResolver(movimentacaoSchema),
    defaultValues: { tamanhoId: "", quantidade: 1, motivo: "" },
  });

  // Fase 2 (P1-01) — uma `idempotencyKey` por operação, por variante e tipo. Uma operação incerta (sem confirmação do
  // servidor) continua pendente mesmo se o diálogo for fechado: ao reabrir, só é possível reenviá-la ou descartá-la.
  const contexto = variante ? contextoOperacao.estoque(tipo, produto.id, variante.id) : null;
  const [pendente, setPendente] = useState<OperacaoPendente<MovimentoEstoque> | null>(null);

  useEffect(() => {
    if (!open) return;
    form.reset({ tamanhoId: "", quantidade: 1, motivo: "" });
    setPendente(contexto ? operacaoPendente<MovimentoEstoque>(contexto) : null);
  }, [open, form, contexto]);

  const tamanhos = variante?.tamanhos ?? [];
  const tamanhoSelecionado = tamanhos.find((t) => t.id === form.watch("tamanhoId"));

  async function enviar(movimento: MovimentoEstoque) {
    if (!variante || !contexto) return;
    const operacao = iniciarOperacao(contexto, movimento);
    if (!operacao) return; // envio desta operação ainda em andamento
    const { tamanhoId, quantidade, motivo } = operacao.payload;
    const base = { produtoId: produto.id, varianteId: variante.id, tamanhoId, quantidade };
    try {
      if (ehSaida) {
        await saida.mutateAsync({ ...base, motivo, idempotencyKey: operacao.chave });
      } else {
        await entrada.mutateAsync({ ...base, idempotencyKey: operacao.chave });
      }
      concluirOperacao(contexto);
      setPendente(null);
      toast.success("Estoque atualizado com sucesso.");
      onOpenChange(false);
    } catch (error) {
      if (concluirOperacao(contexto, error) === "incerta") {
        setPendente(operacaoPendente<MovimentoEstoque>(contexto));
        toast.error(
          "O servidor não confirmou a operação. Use “Tentar novamente” — não lance de novo.",
        );
        return;
      }
      setPendente(null);
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
      toast.error(mensagemDeErro(error, "Não foi possível atualizar o estoque."));
    }
  }

  async function onSubmit(values: MovimentacaoFormValues) {
    if (ehSaida && !values.motivo.trim()) {
      form.setError("motivo", { message: "Motivo é obrigatório." });
      return;
    }
    await enviar({
      tamanhoId: values.tamanhoId,
      quantidade: values.quantidade,
      motivo: ehSaida ? values.motivo : "",
    });
  }

  function descartarPendente() {
    if (contexto) descartarOperacao(contexto);
    setPendente(null);
  }

  const enviando = entrada.isPending || saida.isPending;
  const incerta = pendente?.estado === "incerta" ? pendente : null;
  const resumoPendente = incerta
    ? `${ehSaida ? "Saída" : "Entrada"} de ${incerta.payload.quantidade} un. no tamanho ${
        tamanhos.find((t) => t.id === incerta.payload.tamanhoId)?.tamanho ?? "—"
      }${ehSaida && incerta.payload.motivo ? ` (motivo: ${incerta.payload.motivo})` : ""}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {ehSaida ? "Saída de estoque" : "Entrada de estoque"}
          </DialogTitle>
          <DialogDescription>
            {produto.nome} · variante {variante?.cor ?? "—"}. A quantidade é alterada por operação,
            nunca digitando um novo total.
          </DialogDescription>
        </DialogHeader>

        {incerta ? (
          <AvisoOperacaoPendente
            resumo={resumoPendente}
            enviando={enviando}
            onTentarNovamente={() => void enviar(incerta.payload)}
            onDescartar={descartarPendente}
          />
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Field id="tamanhoId" label="Tamanho" erro={form.formState.errors.tamanhoId?.message}>
              <Select
                value={form.watch("tamanhoId")}
                onValueChange={(valor) =>
                  form.setValue("tamanhoId", valor, { shouldValidate: true })
                }
              >
                <SelectTrigger id="tamanhoId" aria-label="Tamanho">
                  <SelectValue placeholder="Selecione o tamanho" />
                </SelectTrigger>
                <SelectContent>
                  {tamanhos.map((tamanho) => (
                    <SelectItem key={tamanho.id} value={tamanho.id}>
                      {tamanho.tamanho} — {tamanho.quantidade} un.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              id="quantidade"
              label="Quantidade"
              erro={form.formState.errors.quantidade?.message}
              hint={
                tamanhoSelecionado
                  ? `Estoque atual: ${tamanhoSelecionado.quantidade} un.`
                  : "Selecione um tamanho para ver o estoque atual."
              }
            >
              <Input
                id="quantidade"
                type="number"
                min="1"
                step="1"
                {...(ehSaida && tamanhoSelecionado ? { max: tamanhoSelecionado.quantidade } : {})}
                {...form.register("quantidade")}
              />
            </Field>

            {ehSaida ? (
              <Field id="motivo" label="Motivo" erro={form.formState.errors.motivo?.message}>
                <Input
                  id="motivo"
                  placeholder="Peça avariada, ajuste de inventário…"
                  {...form.register("motivo")}
                />
              </Field>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
                {ehSaida ? "Registrar saída" : "Registrar entrada"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
