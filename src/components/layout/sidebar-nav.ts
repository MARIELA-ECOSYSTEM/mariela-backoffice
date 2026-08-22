import {
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
    titulo: null,
    itens: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
  },
  {
    titulo: "Catálogo",
    itens: [
      { label: "Produtos", to: "/produtos", icon: Tags },
      { label: "Coleções", to: "/colecoes", icon: Sparkles, emDesenvolvimento: true },
      { label: "Campanhas", to: "/campanhas", icon: Megaphone, emDesenvolvimento: true },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { label: "Clientes", to: "/clientes", icon: Users, emDesenvolvimento: true },
      { label: "Fornecedores", to: "/fornecedores", icon: Building2, emDesenvolvimento: true },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { label: "Estoque", to: "/estoque", icon: Boxes },
      { label: "Vendas", to: "/vendas", icon: ShoppingBag, emDesenvolvimento: true },
      { label: "Caixa", to: "/caixa", icon: Landmark, emDesenvolvimento: true },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { label: "Relatórios", to: "/relatorios", icon: BarChart3, emDesenvolvimento: true },
      { label: "Configurações", to: "/configuracoes", icon: Settings },
      { label: "Integrações", to: "/integracoes", icon: Plug, emDesenvolvimento: true },
    ],
  },
];
