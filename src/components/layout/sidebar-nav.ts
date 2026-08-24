import {
  BadgeCheck,
  BarChart3,
  Boxes,
  Building2,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Plug,
  Settings,
  ShoppingBag,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  emDesenvolvimento?: boolean;
}

export interface NavGrupo {
  titulo: string | null;
  itens: NavItem[];
}

export const NAV_GRUPOS: NavGrupo[] = [
  {
    titulo: "Principal",
    itens: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
  },
  {
    titulo: "Catálogo",
    itens: [
      { label: "Produtos", to: "/produtos", icon: Tags },
      { label: "Estoque", to: "/estoque", icon: Boxes },
      { label: "Coleções", to: "/colecoes", icon: Sparkles },
      { label: "Campanhas", to: "/campanhas", icon: Megaphone },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { label: "Clientes", to: "/clientes", icon: Users },
      { label: "Fornecedores", to: "/fornecedores", icon: Building2 },
      { label: "Vendedores", to: "/vendedores", icon: BadgeCheck },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { label: "Vendas", to: "/vendas", icon: ShoppingBag },
      { label: "Caixa", to: "/caixa", icon: Landmark, emDesenvolvimento: true },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { label: "Relatórios", to: "/relatorios", icon: BarChart3 },
      { label: "Configurações", to: "/configuracoes", icon: Settings },
    ],
  },
  {
    titulo: "Integrações",
    itens: [{ label: "Integrações", to: "/integracoes", icon: Plug }],
  },
];
