import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/common/field";

const periodoSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
    descricao: z.string().trim().max(400),
    inicio: z.string().trim().min(1, "Informe a data de início."),
    fim: z.string().trim().min(1, "Informe a data de fim."),
    ativo: z.boolean(),
  })
  .refine((valores) => valores.fim >= valores.inicio, {
    path: ["fim"],
    message: "A data de fim deve ser posterior ao início.",
  });

export type PeriodoFormValues = z.infer<typeof periodoSchema>;

/** Formulário compartilhado por Coleções e Campanhas (nome, descrição, período e ativo). */
export function PeriodoDialog({
  open,
  onOpenChange,
  titulo,
  descricaoDialog,
  valoresIniciais,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricaoDialog: string;
  valoresIniciais: PeriodoFormValues;
  salvando: boolean;
  onSubmit: (valores: PeriodoFormValues) => void;
}) {
  const form = useForm<PeriodoFormValues>({
    resolver: zodResolver(periodoSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricaoDialog}</DialogDescription>
        </DialogHeader>
        <form
          id="periodo-form"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
        >
          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" {...form.register("nome")} />
          </Field>
          <Field id="descricao" label="Descrição" erro={errors.descricao?.message}>
            <Textarea id="descricao" rows={3} {...form.register("descricao")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="inicio" label="Início" erro={errors.inicio?.message}>
              <Input id="inicio" type="date" {...form.register("inicio")} />
            </Field>
            <Field id="fim" label="Fim" erro={errors.fim?.message}>
              <Input id="fim" type="date" {...form.register("fim")} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <Label htmlFor="ativo">Ativo</Label>
            <Switch
              id="ativo"
              checked={form.watch("ativo")}
              onCheckedChange={(valor) => form.setValue("ativo", valor)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="periodo-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
