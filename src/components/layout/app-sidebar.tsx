import { Link } from "@tanstack/react-router";
import { NAV_GRUPOS } from "./sidebar-nav";

export function AppSidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-1 px-6 py-6">
        <span className="font-display text-2xl leading-none tracking-[0.2em] text-sidebar-primary">
          MARIELA
        </span>
        <span className="text-[0.6rem] uppercase tracking-[0.22em] text-sidebar-foreground/60">
          Backoffice
        </span>
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV_GRUPOS.map((grupo) => (
          <div key={grupo.titulo ?? "principal"} className="mb-5">
            {grupo.titulo ? (
              <p className="px-3 pb-2 text-[0.625rem] uppercase tracking-[0.16em] text-sidebar-foreground/45">
                {grupo.titulo}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {grupo.itens.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    activeProps={{
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_var(--sidebar-primary)]",
                    }}
                    activeOptions={{ exact: item.to === "/dashboard" }}
                  >
                    <item.icon aria-hidden className="size-4 shrink-0 opacity-80" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.emDesenvolvimento ? (
                      <span className="rounded-full border border-sidebar-border px-1.5 py-px text-[0.55rem] uppercase tracking-wider text-sidebar-foreground/50">
                        breve
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
