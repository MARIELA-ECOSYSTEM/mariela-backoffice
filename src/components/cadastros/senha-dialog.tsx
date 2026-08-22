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

const senhaSchema = z
  .object({
    senha: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirmacaoSenha: z.string(),
  })
  .refine((valores) => valores.senha === valores.confirmacaoSenha, {
    path: ["confirmacaoSenha"],
    message: "As senhas não conferem.",
  });

export type SenhaFormValues = z.infer<typeof senhaSchema>;

/** Redefinição de senha de vendedor: a senha nunca é exibida nem persistida na UI. */
export function SenhaDialog({
  open,
  onOpenChange,
  nome,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  salvando: boolean;
  onSubmit: (valores: SenhaFormValues) => void;
}) {
  const form = useForm<SenhaFormValues>({
    resolver: zodResolver(senhaSchema),
    defaultValues: { senha: "", confirmacaoSenha: "" },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset({ senha: "", confirmacaoSenha: "" });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            Defina uma nova senha de acesso ao PDV para {nome}. O hash é gerado pela API.
          </DialogDescription>
        </DialogHeader>
        <form
          id="senha-form"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
        >
          <Field id="nova-senha" label="Nova senha" erro={errors.senha?.message}>
            <Input
              id="nova-senha"
              type="password"
              autoComplete="new-password"
              {...form.register("senha")}
            />
          </Field>
          <Field
            id="nova-senha-confirmacao"
            label="Confirmar senha"
            erro={errors.confirmacaoSenha?.message}
          >
            <Input
              id="nova-senha-confirmacao"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmacaoSenha")}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="senha-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
