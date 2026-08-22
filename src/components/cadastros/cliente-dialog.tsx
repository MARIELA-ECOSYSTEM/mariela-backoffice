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

const clienteSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
  telefone: z.string().trim().min(1, "Telefone é obrigatório.").max(20),
  dataNascimento: z.string().trim(),
  observacao: z.string().trim().max(400),
  ativo: z.boolean(),
});

export type ClienteFormValues = z.infer<typeof clienteSchema>;

export const CLIENTE_VALORES_PADRAO: ClienteFormValues = {
  nome: "",
  telefone: "",
  dataNascimento: "",
  observacao: "",
  ativo: true,
};

export function ClienteDialog({
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
  valoresIniciais: ClienteFormValues;
  salvando: boolean;
  onSubmit: (valores: ClienteFormValues) => void;
}) {
  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
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
          <DialogTitle>{edicao ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            Cadastro conforme especificação: nome, telefone, data de nascimento, observação e status.
          </DialogDescription>
        </DialogHeader>
        <form
          id="cliente-form"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
        >
          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" {...form.register("nome")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="telefone" label="Telefone" erro={errors.telefone?.message}>
              <Input id="telefone" placeholder="(00) 00000-0000" {...form.register("telefone")} />
            </Field>
            <Field
              id="dataNascimento"
              label="Data de nascimento"
              erro={errors.dataNascimento?.message}
            >
              <Input id="dataNascimento" type="date" {...form.register("dataNascimento")} />
            </Field>
          </div>
          <Field id="observacao" label="Observação" erro={errors.observacao?.message}>
            <Textarea id="observacao" rows={3} {...form.register("observacao")} />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <Label htmlFor="ativo">Cliente ativo</Label>
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
          <Button type="submit" form="cliente-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
