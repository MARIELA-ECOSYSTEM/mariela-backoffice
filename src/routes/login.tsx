import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { mensagemDeErro } from "@/services/api/client";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useUpdaterStatus, type UpdaterStatus } from "@/hooks/use-updater";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  head: () => ({
    meta: [
      { title: "Entrar — MARIELA Backoffice" },
      { name: "description", content: "Acesso administrativo ao sistema de gestão MARIELA." },
      { property: "og:title", content: "Entrar — MARIELA Backoffice" },
      {
        property: "og:description",
        content: "Acesso administrativo ao sistema de gestão MARIELA.",
      },
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
  // Verificação de atualização do app desktop — nunca bloqueia o login,
  // mesmo em caso de falha (ver `useUpdaterStatus`).
  const updater = useUpdaterStatus();

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
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar px-16 py-16 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-1/4 size-[26rem] rounded-full bg-sidebar-primary/8 blur-3xl"
        />
        <div className="relative">
          <span className="block font-display text-4xl font-medium tracking-[0.34em] text-sidebar-primary">
            MARIELA
          </span>
          <span aria-hidden className="rule-gold mt-4 block h-px w-40 opacity-70" />
          <span className="mt-4 block font-brand text-[0.6rem] font-medium uppercase tracking-[0.3em] text-sidebar-foreground/50">
            Backoffice
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-[2.75rem] font-medium leading-[1.15]">
            A gestão da sua loja, com a elegância que a marca merece.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-sidebar-foreground/65">
            Catálogo, variantes, estoque e configurações em um único lugar.
          </p>
        </div>
        <p className="relative font-brand text-[0.6rem] uppercase tracking-[0.22em] text-sidebar-foreground/40">
          Acesso restrito · Mariela Loja
        </p>
      </div>

      <div className="relative flex items-center justify-center bg-background px-6 py-14">
        <ThemeToggle className="absolute right-6 top-6 text-muted-foreground" />
        <div className="w-full max-w-sm">
          <span className="text-eyebrow">Acesso administrativo</span>
          <h1 className="mt-2 font-display text-4xl font-medium">Entrar no Backoffice</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Informe as credenciais fornecidas pela administração da loja.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuário ou e-mail</Label>
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

          <AtualizacaoStatus updater={updater} />
        </div>
      </div>
    </div>
  );
}

/**
 * Indicador discreto de atualização do app desktop, abaixo do formulário de
 * login. Nunca bloqueia nem interfere no fluxo de autenticação — mesmo no
 * estado "erro" (verificação indisponível), o login continua normal.
 */
function AtualizacaoStatus({ updater }: { updater: UpdaterStatus }) {
  const { estado, versaoAtual, versaoDisponivel, progresso, erro, atualizarAgora, tentarNovamente } =
    updater;

  const baseClass = "mt-6 flex items-center justify-center gap-2 text-center text-xs";

  switch (estado) {
    case "verificando":
      return (
        <p role="status" className={`${baseClass} text-muted-foreground/70`}>
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          Verificando atualizações...
        </p>
      );

    case "atualizado":
      return (
        <p role="status" className={`${baseClass} text-muted-foreground/70`}>
          <CheckCircle2 aria-hidden className="size-3.5" />
          Você está na versão mais recente{versaoAtual ? ` (v${versaoAtual})` : ""}.
        </p>
      );

    case "disponivel":
      return (
        <div role="status" className="mt-6 flex flex-col items-center gap-2 text-center text-xs">
          <p className="text-muted-foreground">
            Nova versão disponível: <span className="font-medium text-foreground">v{versaoDisponivel}</span>
            {versaoAtual ? ` (atual: v${versaoAtual})` : ""}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={atualizarAgora}>
            Atualizar agora
          </Button>
        </div>
      );

    case "baixando":
      return (
        <div role="status" className="mt-6 flex flex-col items-center gap-2 text-center text-xs">
          <p className="text-muted-foreground">
            Baixando atualização{progresso !== null ? `... ${progresso}%` : "..."}
          </p>
          <Progress value={progresso ?? undefined} className="h-1.5 w-40" />
        </div>
      );

    case "instalando":
      return (
        <p role="status" className={`${baseClass} text-muted-foreground/70`}>
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          Instalando atualização...
        </p>
      );

    case "erro":
      return (
        <div role="alert" className="mt-6 flex flex-col items-center gap-2 text-center text-xs">
          <p className="flex items-center gap-2 text-muted-foreground/70">
            <AlertTriangle aria-hidden className="size-3.5" />
            {erro ?? "Não foi possível verificar atualizações."}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={tentarNovamente}
            className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground"
          >
            <RefreshCw aria-hidden className="size-3" />
            Tentar novamente
          </Button>
        </div>
      );

    default:
      return null;
  }
}
