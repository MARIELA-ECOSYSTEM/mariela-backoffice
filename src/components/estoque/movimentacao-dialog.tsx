import { useEffect } from "react";
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
import { movimentacaoSchema, type MovimentacaoFormValues } from "@/schemas/produto.schema";
import { useEntradaEstoque, useSaidaEstoque } from "@/hooks/use-estoque";
import { mensagemDeErro } from "@/services/api/client";
import { aplicarErrosDeCampo } from "@/lib/erros-formulario";
import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";

export type TipoMovimentacao = "entrada" | "saida";

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

  useEffect(() => {
    if (open) form.reset({ tamanhoId: "", quantidade: 1, motivo: "" });
  }, [open, form]);

  const tamanhos = variante?.tamanhos ?? [];
  const tamanhoSelecionado = tamanhos.find((t) => t.id === form.watch("tamanhoId"));

  async function onSubmit(values: MovimentacaoFormValues) {
    if (!variante) return;
    if (ehSaida && !values.motivo.trim()) {
      form.setError("motivo", { message: "Motivo é obrigatório." });
      return;
    }
    try {
      if (ehSaida) {
        await saida.mutateAsync({
          produtoId: produto.id,
          varianteId: variante.id,
          tamanhoId: values.tamanhoId,
          quantidade: values.quantidade,
          motivo: values.motivo,
        });
      } else {
        await entrada.mutateAsync({
          produtoId: produto.id,
          varianteId: variante.id,
          tamanhoId: values.tamanhoId,
          quantidade: values.quantidade,
        });
      }
      toast.success("Estoque atualizado com sucesso.");
      onOpenChange(false);
    } catch (error) {
      aplicarErrosDeCampo(error, form, CAMPOS_MAPEAVEIS);
      toast.error(mensagemDeErro(error, "Não foi possível atualizar o estoque."));
    }
  }

  const enviando = entrada.isPending || saida.isPending;

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

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field id="tamanhoId" label="Tamanho" erro={form.formState.errors.tamanhoId?.message}>
            <Select
              value={form.watch("tamanhoId")}
              onValueChange={(valor) => form.setValue("tamanhoId", valor, { shouldValidate: true })}
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
      </DialogContent>
    </Dialog>
  );
}
