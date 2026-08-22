import { useEffect } from "react";
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_backoffice")({
  ssr: false,
  component: BackofficeLayout,
});

function BackofficeLayout() {
  const { autenticado, carregando } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!carregando && !autenticado) void navigate({ to: "/login", replace: true });
  }, [autenticado, carregando, navigate]);

  if (carregando || !autenticado) {
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
