import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { getAccessToken, getRefreshToken } from "@/services/api/client";

export const Route = createFileRoute("/_backoffice")({
  ssr: false,
  // Proteção da área administrativa no roteador: qualquer rota nova sob
  // /_backoffice herda o gate, sem depender de verificação visual nas telas.
  //
  // Basta EXISTIR algum token (mesmo que o access token já tenha expirado):
  // a primeira chamada autenticada que a página fizer aciona a renovação
  // automática do `apiClient` (ver `client.ts`) — só bloqueia aqui quando não
  // sobra nenhum jeito de recuperar a sessão.
  beforeLoad: ({ location }) => {
    if (!getAccessToken() && !getRefreshToken()) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
  },
  component: BackofficeLayout,
});

function BackofficeLayout() {
  const { autenticado, carregando } = useAuth();

  if (carregando && !autenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 aria-label="Carregando" className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
