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
import { CodigoBadge } from "@/components/common/codigo-badge";
import { formatarTelefone } from "@/utils/cliente";

const vendedorSchema = z
  .object({
    nome: z.string().trim().min(1, "Nome é obrigatório.").max(120),
    foto: z.string().trim().max(400),
    telefone: z.string().trim().max(20),
    dataNascimento: z.string().trim(),
    observacao: z.string().trim().max(400),
    senha: z.string(),
    confirmacaoSenha: z.string(),
    ativo: z.boolean(),
  })
  .superRefine((valores, ctx) => {
    if (valores.senha && valores.senha.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["senha"],
        message: "A senha deve ter ao menos 6 caracteres.",
      });
    }
    if (valores.senha !== valores.confirmacaoSenha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmacaoSenha"],
        message: "As senhas não conferem.",
      });
    }
  });

export type VendedorFormValues = z.infer<typeof vendedorSchema>;

export const VENDEDOR_VALORES_PADRAO: VendedorFormValues = {
  nome: "",
  foto: "",
  telefone: "",
  dataNascimento: "",
  observacao: "",
  senha: "",
  confirmacaoSenha: "",
  ativo: true,
};

export function VendedorDialog({
  open,
  onOpenChange,
  edicao,
  codigo,
  valoresIniciais,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edicao: boolean;
  /** Código gerado pela API (`VEN-0001`), somente leitura. */
  codigo?: string | undefined;
  valoresIniciais: VendedorFormValues;
  salvando: boolean;
  onSubmit: (valores: VendedorFormValues) => void;
}) {
  const form = useForm<VendedorFormValues>({
    resolver: zodResolver(vendedorSchema),
    defaultValues: valoresIniciais,
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset(valoresIniciais);
  }, [open, valoresIniciais, form]);

  function submeter(valores: VendedorFormValues) {
    if (!edicao && !valores.senha) {
      form.setError("senha", { message: "Senha é obrigatória para novos vendedores." });
      return;
    }
    onSubmit(valores);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 font-display text-3xl">
            {edicao ? "Editar vendedor(a)" : "Novo vendedor(a)"}
            {codigo ? <CodigoBadge codigo={codigo} /> : null}
          </DialogTitle>
          <DialogDescription>
            Usuário do MARIELA PDV. A senha é enviada à API, que gera o hash — o backoffice nunca
            exibe senhas.
          </DialogDescription>
        </DialogHeader>
        <form
          id="vendedor-form"
          noValidate
          onSubmit={form.handleSubmit(submeter)}
          className="max-h-[65vh] space-y-5 overflow-y-auto px-1"
        >
          <Field id="nome" label="Nome" erro={errors.nome?.message}>
            <Input id="nome" {...form.register("nome")} />
          </Field>
          <Field id="foto" label="Foto (URL)" erro={errors.foto?.message}>
            <Input id="foto" placeholder="https://…" {...form.register("foto")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="telefone"
              label="Telefone / WhatsApp"
              erro={errors.telefone?.message}
              hint="Mesmo número usado para mensagens."
            >
              <Input
                id="telefone"
                placeholder="(00) 00000-0000"
                value={form.watch("telefone")}
                onChange={(evento) =>
                  form.setValue("telefone", formatarTelefone(evento.target.value), {
                    shouldDirty: true,
                  })
                }
              />
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="senha"
              label={edicao ? "Nova senha (opcional)" : "Senha"}
              erro={errors.senha?.message}
            >
              <Input
                id="senha"
                type="password"
                autoComplete="new-password"
                {...form.register("senha")}
              />
            </Field>
            <Field
              id="confirmacaoSenha"
              label="Confirmar senha"
              erro={errors.confirmacaoSenha?.message}
            >
              <Input
                id="confirmacaoSenha"
                type="password"
                autoComplete="new-password"
                {...form.register("confirmacaoSenha")}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <Label htmlFor="ativo">Vendedor(a) ativo(a)</Label>
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
          <Button type="submit" form="vendedor-form" disabled={salvando}>
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
