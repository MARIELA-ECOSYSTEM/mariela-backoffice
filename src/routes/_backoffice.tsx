import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
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
  const { autenticado, carregando } = useAuth();

  if (carregando && !autenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 aria-label="Carregando" className="size-6 animate-spin text-muted-foreground" />
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
