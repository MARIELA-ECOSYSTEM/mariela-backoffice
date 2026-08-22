import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { mensagemDeErro } from "@/services/api/client";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — MARIELA Backoffice" },
      { name: "description", content: "Acesso administrativo ao sistema de gestão MARIELA." },
      { property: "og:title", content: "Entrar — MARIELA Backoffice" },
      { property: "og:description", content: "Acesso administrativo ao sistema de gestão MARIELA." },
    ],
  }),
  component: LoginPage,
});

const loginSchema = z.object({
  usuario: z.string().trim().min(1, "Usuário é obrigatório."),
  senha: z.string().min(1, "Senha é obrigatória."),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginPage() {
  const { login, autenticado, carregando } = useAuth();
  const navigate = useNavigate();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { usuario: "", senha: "" },
  });

  useEffect(() => {
    if (!carregando && autenticado) void navigate({ to: "/dashboard", replace: true });
  }, [autenticado, carregando, navigate]);

  async function onSubmit(values: LoginForm) {
    try {
      await login(values);
      toast.success("Bem-vinda ao MARIELA Backoffice.");
      void navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível entrar."));
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-sidebar px-14 py-14 text-sidebar-foreground lg:flex">
        <span className="font-display text-3xl tracking-[0.24em] text-sidebar-primary">MARIELA</span>
        <div className="max-w-md">
          <h2 className="font-display text-4xl leading-tight">
            A gestão da sua loja, com a elegância que a marca merece.
          </h2>
          <p className="mt-4 text-sm text-sidebar-foreground/70">
            Catálogo, variantes, estoque e configurações em um único lugar.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Backoffice administrativo · acesso restrito</p>
      </div>

      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-sm">
          <span className="text-eyebrow">Acesso administrativo</span>
          <h1 className="mt-1 font-display text-3xl">Entrar no Backoffice</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use as credenciais de demonstração <strong>admin</strong> / <strong>123456</strong>.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuário</Label>
              <Input
                id="usuario"
                autoComplete="username"
                aria-invalid={Boolean(form.formState.errors.usuario)}
                aria-describedby={form.formState.errors.usuario ? "usuario-erro" : undefined}
                {...form.register("usuario")}
              />
              {form.formState.errors.usuario ? (
                <p id="usuario-erro" className="text-xs text-destructive">
                  {form.formState.errors.usuario.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.senha)}
                aria-describedby={form.formState.errors.senha ? "senha-erro" : undefined}
                {...form.register("senha")}
              />
              {form.formState.errors.senha ? (
                <p id="senha-erro" className="text-xs text-destructive">
                  {form.formState.errors.senha.message}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
