import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";
import type { Configuracoes } from "@/types/configuracoes";
import type { Cliente } from "@/types/cliente";
import type { Fornecedor } from "@/types/fornecedor";
import type { Vendedor } from "@/types/vendedor";
import type { Colecao } from "@/types/colecao";
import type { Campanha } from "@/types/campanha";
import { formatarCodigo } from "@/lib/codigos";
import vestido1 from "@/assets/produtos/vestido-1.jpg";
import vestido2 from "@/assets/produtos/vestido-2.jpg";
import blusa1 from "@/assets/produtos/blusa-1.jpg";
import calca1 from "@/assets/produtos/calca-1.jpg";
import { formatarCodigoVariante } from "@/lib/codigos";

export const CATEGORIAS = [
  "Vestidos",
  "Blusas",
  "Camisas",
  "Calças",
  "Saias",
  "Shorts",
  "Macacões",
  "Casacos",
  "Acessórios",
  "Praia",
];

export const TAMANHOS = ["PP", "P", "M", "G", "GG", "36", "38", "U"];

export const CORES = [
  "Preto",
  "Off White",
  "Bege",
  "Nude",
  "Vinho",
  "Rosé",
  "Azul Marinho",
  "Verde Oliva",
  "Terracota",
  "Estampado Floral",
];

export const FORMAS_PAGAMENTO = [
  "Dinheiro",
  "Pix",
  "Cartão de Débito",
  "Cartão de Crédito",
  "Crediário",
];

function iso(diasAtras: number): string {
  return new Date(Date.now() - diasAtras * 86_400_000).toISOString();
}

function margem(custo: number, venda: number): number {
  if (custo <= 0) return 0;
  return Number((((venda - custo) / custo) * 100).toFixed(2));
}

interface VarianteSeed {
  cor: string;
  /** Foto da variante (uma por cor). O card monta a galeria com todas elas. */
  foto?: string;
  tamanhos: [string, number][];
}

interface ProdutoSeed {
  cod: string;
  nome: string;
  descricao: string;
  categoria: string;
  custo: number;
  venda: number;
  novidade?: boolean;
  promocao?: boolean;
  precoPromocional?: number;
  colecaoId?: string;
  campanhaId?: string;
  fornecedorId?: string;
  criadoDiasAtras: number;
  variantes: VarianteSeed[];
}

const SEEDS: ProdutoSeed[] = [
  {
    cod: "PROD-0001",
    nome: "Vestido Midi Amalfi",
    descricao: "Vestido midi em viscose com decote V e amarração na cintura.",
    categoria: "Vestidos",
    custo: 89.9,
    venda: 259.9,
    novidade: true,
    colecaoId: "col_001",
    campanhaId: "cam_001",
    fornecedorId: "for_001",
    criadoDiasAtras: 4,
    variantes: [
      {
        cor: "Preto",
        foto: vestido1,
        tamanhos: [
          ["P", 4],
          ["M", 6],
          ["G", 3],
        ],
      },
      {
        cor: "Terracota",
        foto: vestido2,
        tamanhos: [
          ["P", 2],
          ["M", 5],
        ],
      },
      {
        cor: "Off White",
        tamanhos: [
          ["M", 3],
          ["G", 1],
        ],
      },
    ],
  },
  {
    cod: "PROD-0002",
    nome: "Blusa Cropped Nice",
    descricao: "Blusa cropped canelada de manga curta.",
    categoria: "Blusas",
    custo: 32.5,
    venda: 99.9,
    promocao: true,
    precoPromocional: 79.9,
    colecaoId: "col_002",
    fornecedorId: "for_002",
    criadoDiasAtras: 20,
    variantes: [
      {
        cor: "Rosé",
        foto: blusa1,
        tamanhos: [
          ["PP", 5],
          ["P", 8],
          ["M", 4],
        ],
      },
      {
        cor: "Preto",
        tamanhos: [
          ["P", 6],
          ["M", 6],
          ["G", 2],
        ],
      },
    ],
  },
  {
    cod: "PROD-0003",
    nome: "Calça Pantalona Sorrento",
    descricao: "Pantalona de alfaiataria com pregas frontais.",
    categoria: "Calças",
    custo: 74.0,
    venda: 219.9,
    colecaoId: "col_001",
    fornecedorId: "for_003",
    criadoDiasAtras: 35,
    variantes: [
      {
        cor: "Azul Marinho",
        tamanhos: [
          ["36", 2],
          ["38", 3],
        ],
      },
      {
        cor: "Bege",
        foto: calca1,
        tamanhos: [
          ["36", 1],
          ["38", 2],
        ],
      },
    ],
  },
  {
    cod: "PROD-0004",
    nome: "Camisa Linho Positano",
    descricao: "Camisa em linho leve com botões de madrepérola.",
    categoria: "Camisas",
    custo: 68.0,
    venda: 199.9,
    novidade: true,
    fornecedorId: "for_001",
    criadoDiasAtras: 7,
    variantes: [
      {
        cor: "Off White",
        tamanhos: [
          ["P", 3],
          ["M", 4],
          ["G", 3],
          ["GG", 1],
        ],
      },
    ],
  },
  {
    cod: "PROD-0005",
    nome: "Saia Plissada Verona",
    descricao: "Saia plissada midi com cós elástico.",
    categoria: "Saias",
    custo: 55.0,
    venda: 169.9,
    promocao: true,
    precoPromocional: 129.9,
    campanhaId: "cam_002",
    fornecedorId: "for_004",
    criadoDiasAtras: 60,
    variantes: [
      {
        cor: "Vinho",
        tamanhos: [
          ["P", 2],
          ["M", 1],
        ],
      },
      {
        cor: "Preto",
        tamanhos: [
          ["M", 2],
          ["G", 1],
        ],
      },
    ],
  },
  {
    cod: "PROD-0006",
    nome: "Macacão Capri",
    descricao: "Macacão pantalona com alças finas.",
    categoria: "Macacões",
    custo: 96.0,
    venda: 289.9,
    colecaoId: "col_003",
    fornecedorId: "for_002",
    criadoDiasAtras: 15,
    variantes: [
      {
        cor: "Verde Oliva",
        tamanhos: [
          ["P", 1],
          ["M", 2],
        ],
      },
    ],
  },
  {
    cod: "PROD-0007",
    nome: "Lenço de Seda Bellagio",
    descricao: "Lenço quadrado em seda com estampa exclusiva.",
    categoria: "Acessórios",
    custo: 24.0,
    venda: 89.9,
    novidade: true,
    fornecedorId: "for_005",
    criadoDiasAtras: 3,
    variantes: [
      { cor: "Estampado Floral", tamanhos: [["U", 12]] },
      { cor: "Nude", tamanhos: [["U", 8]] },
    ],
  },
  {
    cod: "PROD-0008",
    nome: "Casaco Trench Milano",
    descricao: "Trench coat com cinto e forro acetinado.",
    categoria: "Casacos",
    custo: 180.0,
    venda: 529.9,
    colecaoId: "col_002",
    fornecedorId: "for_003",
    criadoDiasAtras: 90,
    variantes: [
      {
        cor: "Bege",
        tamanhos: [
          ["P", 1],
          ["M", 1],
        ],
      },
    ],
  },
  {
    cod: "PROD-0009",
    nome: "Short Alfaiataria Riviera",
    descricao: "Short de alfaiataria com bolsos embutidos.",
    categoria: "Shorts",
    custo: 42.0,
    venda: 139.9,
    fornecedorId: "for_004",
    criadoDiasAtras: 48,
    variantes: [],
  },
  {
    cod: "PROD-0010",
    nome: "Vestido Longo Sicília",
    descricao: "Vestido longo fluido com fenda lateral.",
    categoria: "Vestidos",
    custo: 128.0,
    venda: 389.9,
    promocao: true,
    precoPromocional: 299.9,
    colecaoId: "col_003",
    campanhaId: "cam_001",
    fornecedorId: "for_001",
    criadoDiasAtras: 25,
    variantes: [
      {
        cor: "Vinho",
        tamanhos: [
          ["P", 3],
          ["M", 3],
          ["G", 2],
        ],
      },
      {
        cor: "Preto",
        tamanhos: [
          ["P", 4],
          ["M", 5],
          ["G", 4],
          ["GG", 2],
        ],
      },
      { cor: "Estampado Floral", tamanhos: [["M", 2]] },
    ],
  },
  {
    cod: "PROD-0011",
    nome: "Biquíni Ipanema",
    descricao: "Biquíni cortininha com bojo removível.",
    categoria: "Praia",
    custo: 38.0,
    venda: 129.9,
    novidade: true,
    campanhaId: "cam_003",
    fornecedorId: "for_005",
    criadoDiasAtras: 2,
    variantes: [
      {
        cor: "Rosé",
        tamanhos: [
          ["P", 4],
          ["M", 4],
        ],
      },
      {
        cor: "Preto",
        tamanhos: [
          ["P", 0],
          ["M", 0],
        ],
      },
    ],
  },
  {
    cod: "PROD-0012",
    nome: "Blusa Tricot Como",
    descricao: "Tricot leve de gola alta.",
    categoria: "Blusas",
    custo: 61.0,
    venda: 189.9,
    fornecedorId: "for_002",
    criadoDiasAtras: 70,
    variantes: [
      {
        cor: "Nude",
        tamanhos: [
          ["P", 0],
          ["M", 0],
          ["G", 0],
        ],
      },
    ],
  },
  {
    cod: "PROD-0013",
    nome: "Cinto Couro Firenze",
    descricao: "Cinto de couro legítimo com fivela dourada.",
    categoria: "Acessórios",
    custo: 29.0,
    venda: 109.9,
    fornecedorId: "for_005",
    criadoDiasAtras: 110,
    variantes: [{ cor: "Preto", tamanhos: [["U", 1]] }],
  },
  {
    cod: "PROD-0014",
    nome: "Calça Wide Leg Genova",
    descricao: "Calça wide leg em sarja com barra desfiada.",
    categoria: "Calças",
    custo: 79.9,
    venda: 249.9,
    colecaoId: "col_001",
    fornecedorId: "for_003",
    criadoDiasAtras: 12,
    variantes: [
      {
        cor: "Azul Marinho",
        tamanhos: [
          ["36", 3],
          ["38", 4],
        ],
      },
      {
        cor: "Off White",
        tamanhos: [
          ["36", 2],
          ["38", 2],
        ],
      },
    ],
  },
  {
    cod: "PROD-0015",
    nome: "Saída de Praia Búzios",
    descricao: "Saída de praia em tecido vazado, tamanho único.",
    categoria: "Praia",
    custo: 45.0,
    venda: 159.9,
    promocao: true,
    precoPromocional: 119.9,
    campanhaId: "cam_003",
    fornecedorId: "for_004",
    criadoDiasAtras: 30,
    variantes: [{ cor: "Off White", tamanhos: [["U", 10]] }],
  },
  {
    cod: "PROD-0016",
    nome: "Vestido Curto Portofino",
    descricao: "Vestido curto com manga bufante.",
    categoria: "Vestidos",
    custo: 72.0,
    venda: 229.9,
    novidade: true,
    colecaoId: "col_002",
    fornecedorId: "for_001",
    criadoDiasAtras: 5,
    variantes: [
      {
        cor: "Terracota",
        tamanhos: [
          ["P", 2],
          ["M", 3],
          ["G", 1],
        ],
      },
      {
        cor: "Preto",
        tamanhos: [
          ["P", 1],
          ["M", 2],
        ],
      },
    ],
  },
  {
    cod: "PROD-0017",
    nome: "Camisa Oversized Bolonha",
    descricao: "Camisa oversized em tricoline.",
    categoria: "Camisas",
    custo: 58.0,
    venda: 179.9,
    fornecedorId: "for_002",
    criadoDiasAtras: 55,
    variantes: [],
  },
];

export function seedProdutos(): Produto[] {
  return SEEDS.map((seed, indexProduto) => {
    const variantes: Variante[] = seed.variantes.map((variante, indexVariante) => {
      const tamanhos = variante.tamanhos.map(([tamanho, quantidade], indexTamanho) => ({
        id: `tam_${indexProduto + 1}_${indexVariante + 1}_${indexTamanho + 1}`,
        tamanho,
        quantidade,
      }));
      return {
        id: `var_${indexProduto + 1}_${indexVariante + 1}`,
        codVariante: formatarCodigoVariante(seed.cod, variante.cor),
        cor: variante.cor,
        quantidadeVariante: tamanhos.reduce((total, t) => total + t.quantidade, 0),
        foto: variante.foto ?? null,
        video: null,
        tamanhos,
      };
    });

    const quantidadeTotal = variantes.reduce((total, v) => total + v.quantidadeVariante, 0);
    const precoVigente =
      seed.promocao && seed.precoPromocional ? seed.precoPromocional : seed.venda;

    return {
      id: `prd_${String(indexProduto + 1).padStart(3, "0")}`,
      codProduto: seed.cod,
      nome: seed.nome,
      descricao: seed.descricao,
      categoria: seed.categoria,
      colecaoId: seed.colecaoId ?? null,
      campanhaId: seed.campanhaId ?? null,
      fornecedorId: seed.fornecedorId ?? null,
      precoCusto: seed.custo,
      margemLucro: margem(seed.custo, precoVigente),
      precoVenda: seed.venda,
      ehNovidade: seed.novidade ?? false,
      ehPromocao: seed.promocao ?? false,
      precoPromocional: seed.precoPromocional ?? null,
      quantidadeTotal,
      fotoPrincipalVarianteId: null,
      estoqueZeradoEm: quantidadeTotal === 0 ? iso(Math.min(seed.criadoDiasAtras, 10)) : null,
      variantes,
      criadoEm: iso(seed.criadoDiasAtras),
      atualizadoEm: iso(Math.max(0, seed.criadoDiasAtras - 1)),
    } satisfies Produto;
  });
}

export function seedConfiguracoes(): Configuracoes {
  return {
    loja: {
      nome: "Mariela Moda Feminina",
      logo: "",
      telefone: "(11) 3555-0110",
      whatsapp: "(11) 99820-4477",
      email: "contato@mariela.com.br",
      endereco: {
        cep: "01310-100",
        logradouro: "Avenida Paulista",
        numero: "1400",
        complemento: "Loja 12",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        estado: "SP",
      },
    },
    categorias: [...CATEGORIAS],
    tamanhos: [...TAMANHOS],
    cores: [...CORES],
    formasPagamento: [...FORMAS_PAGAMENTO],
    atualizadoEm: iso(1),
  };
}

export function seedFornecedores(): Fornecedor[] {
  const base: [string, string, string, string, string, string, string, boolean, number][] = [
    [
      "for_001",
      "Ateliê Bella Vita",
      "Renata Prado",
      "(11) 98123-0011",
      "contato@bellavita.com.br",
      "12.345.678/0001-90",
      "@atelierbellavita",
      true,
      200,
    ],
    [
      "for_002",
      "Malharia Vittoria",
      "Carlos Menezes",
      "(11) 97722-8090",
      "comercial@malhariavittoria.com.br",
      "23.456.789/0001-01",
      "@malhariavittoria",
      true,
      190,
    ],
    [
      "for_003",
      "Alfaiataria Duarte",
      "Marina Duarte",
      "(21) 98455-1200",
      "marina@alfaiatariaduarte.com.br",
      "",
      "@alfaiatariaduarte",
      true,
      150,
    ],
    [
      "for_004",
      "Confecções Lumière",
      "Paula Ferraz",
      "(31) 99111-3322",
      "",
      "34.567.890/0001-12",
      "",
      true,
      120,
    ],
    [
      "for_005",
      "Acessórios Dolce",
      "Iris Nakamura",
      "(11) 96555-7788",
      "iris@acessoriosdolce.com.br",
      "",
      "@acessoriosdolce",
      false,
      80,
    ],
  ];
  return base.map(
    ([id, nome, contato, telefone, email, cnpj, instagram, ativo, dias], indice): Fornecedor => ({
      id,
      codigo: formatarCodigo("fornecedor", indice + 1),
      nome,
      foto: null,
      contato,
      telefone,
      email,
      cnpj,
      instagram,
      ativo,
      criadoEm: iso(dias),
      atualizadoEm: iso(Math.max(0, dias - 5)),
    }),
  );
}

function dia(diasAtras: number): string {
  return new Date(Date.now() - diasAtras * 86_400_000).toISOString().slice(0, 10);
}

export function seedColecoes(): Colecao[] {
  return [
    {
      id: "col_001",
      codigo: formatarCodigo("colecao", 1),
      nome: "Alta Estação",
      descricao: "Peças-chave do verão com cartela clara e tecidos fluidos.",
      inicio: dia(120),
      fim: dia(-40),
      ativo: true,
      destaque: true,
      banner: true,
      fotoDestaque: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80",
      fotoBanner: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=80",
      criadoEm: iso(120),
    },
    {
      id: "col_002",
      codigo: formatarCodigo("colecao", 2),
      nome: "Essenciais Mariela",
      descricao: "Coleção atemporal de básicos sofisticados de reposição contínua.",
      inicio: dia(300),
      fim: dia(-200),
      ativo: true,
      destaque: true,
      banner: false,
      fotoDestaque: "https://images.unsplash.com/photo-1509319117193-57bab727e09d?auto=format&fit=crop&w=900&q=80",
      fotoBanner: null,
      criadoEm: iso(300),
    },
    {
      id: "col_003",
      codigo: formatarCodigo("colecao", 3),
      nome: "Riviera",
      descricao: "Cápsula resort com alfaiataria leve e praia.",
      inicio: dia(60),
      fim: dia(-15),
      ativo: false,
      destaque: false,
      banner: false,
      fotoDestaque: null,
      fotoBanner: null,
      criadoEm: iso(60),
    },
  ];
}

export function seedCampanhas(): Campanha[] {
  return [
    {
      id: "cam_001",
      codigo: formatarCodigo("campanha", 1),
      nome: "Lançamento Verão",
      descricao: "Divulgação das novidades de verão nas redes e vitrine.",
      inicio: dia(90),
      fim: dia(-30),
      ativo: true,
      destaque: true,
      banner: true,
      fotoDestaque: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
      fotoBanner: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1600&q=80",
      criadoEm: iso(90),
    },
    {
      id: "cam_002",
      codigo: formatarCodigo("campanha", 2),
      nome: "Liquida Inverno",
      descricao: "Queima de estoque das peças de inverno.",
      inicio: dia(150),
      fim: dia(110),
      ativo: false,
      destaque: false,
      banner: true,
      fotoDestaque: null,
      fotoBanner: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1600&q=80",
      criadoEm: iso(150),
    },
    {
      id: "cam_003",
      codigo: formatarCodigo("campanha", 3),
      nome: "Semana da Praia",
      descricao: "Ação focada em praia e saídas de praia.",
      inicio: dia(40),
      fim: dia(-5),
      ativo: true,
      destaque: false,
      banner: false,
      fotoDestaque: null,
      fotoBanner: null,
      criadoEm: iso(40),
    },
  ];
}

export function seedClientes(): Cliente[] {
  const base: [string, string, string, string, string, boolean, number][] = [
    [
      "cli_001",
      "Ana Beatriz Souza",
      "(11) 99811-2233",
      "1992-04-18",
      "Prefere vestidos midi.",
      true,
      45,
    ],
    [
      "cli_002",
      "Camila Ferreira",
      "(11) 98444-9090",
      "1988-11-02",
      "Cliente de crediário.",
      true,
      30,
    ],
    ["cli_003", "Juliana Martins", "(21) 99700-1010", "1995-07-25", "", true, 20],
    [
      "cli_004",
      "Larissa Nogueira",
      "(31) 98222-3131",
      "1990-01-09",
      "Sempre pede novidades de acessórios.",
      true,
      10,
    ],
    ["cli_005", "Patrícia Lima", "(11) 97333-4545", "", "Cadastro incompleto.", false, 5],
  ];
  return base.map(([id, nome, telefone, dataNascimento, observacao, ativo, dias], indice) => ({
    id,
    codigo: formatarCodigo("cliente", indice + 1),
    nome,
    foto: null,
    telefone,
    dataNascimento: dataNascimento || null,
    observacao,
    ativo,
    criadoEm: iso(dias),
    atualizadoEm: iso(Math.max(0, dias - 2)),
  }));
}

export function seedVendedores(): Vendedor[] {
  const base: [string, string, string, string, string, boolean, number][] = [
    [
      "ven_001",
      "Mariana Alves",
      "(11) 99444-1122",
      "1994-03-12",
      "Responsável pelo turno da manhã.",
      true,
      120,
    ],
    [
      "ven_002",
      "Fernanda Rocha",
      "(11) 98333-7744",
      "1991-09-30",
      "Atende principalmente clientes de crediário.",
      true,
      95,
    ],
    ["ven_003", "Bianca Teixeira", "(11) 97555-2211", "1998-06-05", "", true, 60],
    [
      "ven_004",
      "Sabrina Costa",
      "(11) 96222-8899",
      "1989-12-19",
      "Afastada temporariamente.",
      false,
      30,
    ],
  ];
  return base.map(
    ([id, nome, telefone, dataNascimento, observacao, ativo, dias], indice): Vendedor => ({
      id,
      codigo: formatarCodigo("vendedor", indice + 1),
      nome,
      foto: null,
      telefone,
      dataNascimento: dataNascimento || null,
      observacao,
      ativo,
      criadoEm: iso(dias),
      atualizadoEm: iso(Math.max(0, dias - 3)),
    }),
  );
}
