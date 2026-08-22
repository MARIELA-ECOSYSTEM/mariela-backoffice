import { Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export interface Breadcrumb {
  label: string;
  to?: string;
}

export function AppHeader({ titulo, breadcrumbs }: { titulo: string; breadcrumbs?: Breadcrumb[] }) {
  const { usuario, logout } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-8">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            aria-label="Trilha de navegação"
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight aria-hidden className="size-3" /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground/70">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="truncate font-display text-2xl leading-tight">{titulo}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-3 px-2" aria-label="Menu do usuário">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {iniciais(usuario?.nome ?? "Mariela")}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm">{usuario?.nome ?? "—"}</span>
              <span className="block text-eyebrow">{usuario?.tipo ?? ""}</span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <User aria-hidden className="size-3.5" /> Sessão administrativa
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut aria-hidden className="size-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
