import { SidebarConteudo } from "./sidebar-conteudo";

/**
 * Sidebar fixa: visível a partir de `lg`. Em larguras menores o menu passa
 * a ser aberto sob demanda pelo drawer do cabeçalho (AppHeader).
 */
export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block xl:w-64">
      <SidebarConteudo />
    </aside>
  );
}
