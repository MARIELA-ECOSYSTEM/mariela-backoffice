import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getToken } from "@/services/api/client";

export const Route = createFileRoute("/_backoffice")({
  ssr: false,
  // Proteção da área administrativa no roteador: qualquer rota nova sob
  // /_backoffice herda o gate, sem depender de verificação visual nas telas.
  beforeLoad: ({ location }) => {
    if (!getToken()) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
  },
  component: BackofficeLayout,
});

function BackofficeLayout() {
  const { autenticado, carregando, falhaValidacao, revalidarSessao, logout } = useAuth();

  if (carregando && !autenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 aria-label="Carregando" className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Fase 22.8.4 (A1) — sessão preservada mas ainda não validada (backend indisponível): sem logout automático e sem
  // carregamento infinito; o operador tenta de novo ou sai. As telas (e suas requisições) só abrem depois da validação.
  if (!autenticado && falhaValidacao) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div role="alert" className="max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">
            Não foi possível validar sua sessão
          </h1>
          <p className="text-sm text-muted-foreground">{falhaValidacao.mensagem}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void revalidarSessao()}>Tentar novamente</Button>
            <Button variant="outline" onClick={() => void logout()}>
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-start bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
