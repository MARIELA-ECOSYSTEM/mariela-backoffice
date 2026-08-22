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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/common/field";

const fornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
  foto: z.string().trim().max(400),
  contato: z.string().trim().max(120),
  telefone: z.string().trim().max(20),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((valor) => !valor || /.+@.+\..+/.test(valor), {
      message: "E-mail inválido.",
    }),
  cnpj: z.string().trim().max(20),
  instagram: z.string().trim().max(60),
  ativo: z.boolean(),
});

export type FornecedorFormValues = z.infer<typeof fornecedorSchema>;

export const FORNECEDOR_VALORES_PADRAO: FornecedorFormValues = {
  nome: "",
  foto: "",
  contato: "",
  telefone: "",
  email: "",
  cnpj: "",
  instagram: "",
  ativo: true,
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
            Nome, contato responsável, telefone, e-mail, CNPJ, Instagram e status.
          </DialogDescription>
        </DialogHeader>
        <form
          id="fornecedor-form"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="max-h-[65vh] space-y-5 overflow-y-auto px-1"
        >
          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" {...form.register("nome")} />
          </Field>
          <Field id="foto" label="Logo/Foto (URL)" erro={errors.foto?.message}>
            <Input id="foto" placeholder="https://…" {...form.register("foto")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="contato" label="Contato" erro={errors.contato?.message}>
              <Input id="contato" {...form.register("contato")} />
            </Field>
            <Field id="telefone" label="Telefone" erro={errors.telefone?.message}>
              <Input id="telefone" placeholder="(00) 00000-0000" {...form.register("telefone")} />
            </Field>
          </div>
          <Field id="email" label="E-mail" erro={errors.email?.message}>
            <Input id="email" type="email" {...form.register("email")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cnpj" label="CNPJ" erro={errors.cnpj?.message}>
              <Input id="cnpj" placeholder="00.000.000/0000-00" {...form.register("cnpj")} />
            </Field>
            <Field id="instagram" label="Instagram" erro={errors.instagram?.message}>
              <Input id="instagram" placeholder="@perfil" {...form.register("instagram")} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <Label htmlFor="ativo">Fornecedor ativo</Label>
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
          <Button type="submit" form="fornecedor-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
