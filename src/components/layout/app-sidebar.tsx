import { Link } from "@tanstack/react-router";
import { NAV_GRUPOS } from "./sidebar-nav";

export function AppSidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-7 pb-6 pt-7">
        <span className="block font-display text-[1.75rem] font-medium leading-none tracking-[0.34em] text-sidebar-primary">
          MARIELA
        </span>
        <span aria-hidden className="rule-gold mt-3 block h-px w-full opacity-60" />
        <span className="mt-3 block font-brand text-[0.58rem] font-medium uppercase tracking-[0.3em] text-sidebar-foreground/55">
          Backoffice
        </span>
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-4 pb-6">
        {NAV_GRUPOS.map((grupo) => (
          <div key={grupo.titulo ?? "principal"} className="mb-6">
            {grupo.titulo ? (
              <p className="px-3 pb-2.5 font-brand text-[0.58rem] font-medium uppercase tracking-[0.24em] text-sidebar-foreground/40">
                {grupo.titulo}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {grupo.itens.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors duration-200 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                    activeProps={{
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary",
                    }}
                    activeOptions={{ exact: item.to === "/dashboard" }}
                  >
                    <item.icon
                      aria-hidden
                      className="size-4 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                    />
                    <span className="flex-1 truncate tracking-wide">{item.label}</span>
                    {item.emDesenvolvimento ? (
                      <span className="font-brand text-[0.52rem] uppercase tracking-[0.18em] text-sidebar-foreground/35">
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

      <div className="border-t border-sidebar-border px-7 py-4">
        <p className="font-brand text-[0.55rem] uppercase tracking-[0.22em] text-sidebar-foreground/35">
          Mariela Loja · Moda feminina
        </p>
      </div>
    </aside>
  );
}
