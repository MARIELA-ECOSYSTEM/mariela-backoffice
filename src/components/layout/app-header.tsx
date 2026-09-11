import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, LogOut, Menu, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarConteudo } from "./sidebar-conteudo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { iniciais } from "@/utils/format";
import { ThemeToggle } from "./theme-toggle";

export interface Breadcrumb {
  label: string;
  to?: string;
}

export function AppHeader({ titulo, breadcrumbs }: { titulo: string; breadcrumbs?: Breadcrumb[] }) {
  const { usuario, logout } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const rota = useRouterState({ select: (router) => router.location.pathname });

  // Fecha o menu off-canvas ao trocar de rota.
  useEffect(() => {
    setMenuAberto(false);
  }, [rota]);

  return (
    <header className="sticky top-0 z-30 flex h-18 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground lg:hidden"
            aria-label="Abrir menu principal"
            aria-expanded={menuAberto}
          >
            <Menu aria-hidden className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 max-w-[85vw] border-sidebar-border p-0">
          <SheetTitle className="sr-only">Menu principal</SheetTitle>
          <SidebarConteudo onNavegar={() => setMenuAberto(false)} />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            aria-label="Trilha de navegação"
            className="flex items-center gap-1 font-brand text-[0.62rem] uppercase tracking-[0.16em] text-muted-foreground/80"
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight aria-hidden className="size-3 opacity-50" /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="transition-colors hover:text-primary">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="mt-0.5 truncate font-display text-xl font-medium leading-tight sm:text-[1.65rem]">
          {titulo}
        </h1>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle className="text-muted-foreground" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto gap-3 py-1.5 pl-2 pr-3"
              aria-label="Menu do usuário"
            >
              <span className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary-soft font-brand text-[0.7rem] font-medium tracking-widest text-primary">
                {iniciais(usuario?.nome ?? "Mariela")}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm text-foreground">{usuario?.nome ?? "—"}</span>
                <span className="block text-eyebrow">{usuario?.tipo ?? ""}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <User aria-hidden className="size-3.5" /> Sessão administrativa
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut aria-hidden className="size-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
