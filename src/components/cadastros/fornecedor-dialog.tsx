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
import { Field } from "@/components/common/field";

const fornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
  contato: z.string().trim().max(120),
  telefone: z.string().trim().max(20),
});

export type FornecedorFormValues = z.infer<typeof fornecedorSchema>;

export const FORNECEDOR_VALORES_PADRAO: FornecedorFormValues = {
  nome: "",
  contato: "",
  telefone: "",
};

export function FornecedorDialog({
  open,
  onOpenChange,
  edicao,
  valoresIniciais,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edicao: boolean;
  valoresIniciais: FornecedorFormValues;
  salvando: boolean;
  onSubmit: (valores: FornecedorFormValues) => void;
}) {
  const form = useForm<FornecedorFormValues>({
    resolver: zodResolver(fornecedorSchema),
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
          <DialogTitle>{edicao ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          <DialogDescription>
            Campos da especificação: nome, contato responsável e telefone.
          </DialogDescription>
        </DialogHeader>
        <form
          id="fornecedor-form"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
        >
          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" {...form.register("nome")} />
          </Field>
          <Field id="contato" label="Contato" erro={errors.contato?.message}>
            <Input id="contato" {...form.register("contato")} />
          </Field>
          <Field id="telefone" label="Telefone" erro={errors.telefone?.message}>
            <Input id="telefone" placeholder="(00) 00000-0000" {...form.register("telefone")} />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="fornecedor-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
