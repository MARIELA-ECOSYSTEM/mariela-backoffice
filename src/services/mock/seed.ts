import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";
import type { Configuracoes } from "@/types/configuracoes";
import type { Cliente } from "@/types/cliente";
import type { EnderecoFornecedor, Fornecedor } from "@/types/fornecedor";
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
  /**
   * Endereço é OPCIONAL: alguns fornecedores nascem sem endereço de propósito
   * para exercitar as facetas "Com endereço" / "Sem endereço".
   */
  const enderecos: Record<string, EnderecoFornecedor> = {
    for_001: {
      cep: "01310-100",
      logradouro: "Av. Paulista",
      numero: "1200",
      complemento: "Sala 42",
      bairro: "Bela Vista",
      cidade: "São Paulo",
      estado: "SP",
    },
    for_002: {
      cep: "03010-050",
      logradouro: "Rua da Mooca",
      numero: "870",
      complemento: "",
      bairro: "Mooca",
      cidade: "São Paulo",
      estado: "SP",
    },
    for_003: {
      cep: "22041-080",
      logradouro: "Rua Barata Ribeiro",
      numero: "310",
      complemento: "Loja 3",
      bairro: "Copacabana",
      cidade: "Rio de Janeiro",
      estado: "RJ",
    },
    for_005: {
      cep: "30140-071",
      logradouro: "Av. Afonso Pena",
      numero: "1500",
      complemento: "",
      bairro: "Centro",
      cidade: "Belo Horizonte",
      estado: "MG",
    },
  };

  const observacoes: Record<string, string> = {
    for_001: "Produção sob medida com prazo médio de 20 dias.",
    for_002: "Melhor custo em malha; pedido mínimo de 30 peças.",
    for_004: "Contato apenas por telefone comercial.",
  };

  return base.map(
    ([id, nome, contato, telefone, email, cnpj, instagram, , dias], indice): Fornecedor => ({
      id,
      codigo: formatarCodigo("fornecedor", indice + 1),
      nome,
      foto: null,
      contato,
      telefone,
      email,
      cnpj,
      instagram,
      observacao: observacoes[id] ?? "",
      endereco: enderecos[id] ?? null,
      criadoEm: iso(dias),
      atualizadoEm: iso(Math.max(0, dias - 5)),
      // Agregados recalculados pela camada de dados a partir dos produtos.
      produtosVinculados: 0,
      valorEmCusto: 0,
      ultimaEntrada: null,
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
      fotoDestaque:
        "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80",
      fotoBanner:
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=80",
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
      fotoDestaque:
        "https://images.unsplash.com/photo-1509319117193-57bab727e09d?auto=format&fit=crop&w=900&q=80",
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
      fotoDestaque:
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
      fotoBanner:
        "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1600&q=80",
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
      fotoBanner:
        "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1600&q=80",
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

/**
 * Aniversário determinístico: mesmo dia/mês de "hoje + offsetDias",
 * com o ano informado. Garante clientes aniversariando hoje, amanhã,
 * nesta semana e neste mês em qualquer data de execução.
 */
function nascimento(offsetDias: number, ano: number): string {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + offsetDias);
  const mes = String(base.getMonth() + 1).padStart(2, "0");
  const dia = String(base.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

interface SeedCliente {
  id: string;
  nome: string;
  telefone: string;
  /** Offset em dias para o aniversário; null = sem data cadastrada. */
  aniversarioEmDias: number | null;
  anoNascimento: number;
  observacao: string;
  diasCadastro: number;
  /** Dias atrás de cada compra da cliente — determinístico, sem aleatoriedade. */
  compras: number[];
}

const CLIENTES_SEED: SeedCliente[] = [
  {
    id: "cli_001",
    nome: "Ana Beatriz Souza",
    telefone: "(11) 99811-2233",
    aniversarioEmDias: 0,
    anoNascimento: 1992,
    observacao: "Prefere vestidos midi.",
    diasCadastro: 420,
    compras: [2, 16, 44, 91, 150, 220],
  },
  {
    id: "cli_002",
    nome: "Camila Ferreira",
    telefone: "(11) 98444-9090",
    aniversarioEmDias: 1,
    anoNascimento: 1988,
    observacao: "Cliente de crediário.",
    diasCadastro: 360,
    compras: [9, 38, 120],
  },
  {
    id: "cli_003",
    nome: "Juliana Martins",
    telefone: "(21) 99700-1010",
    aniversarioEmDias: 3,
    anoNascimento: 1995,
    observacao: "",
    diasCadastro: 280,
    compras: [45],
  },
  {
    id: "cli_004",
    nome: "Larissa Nogueira",
    telefone: "(31) 98222-3131",
    aniversarioEmDias: 5,
    anoNascimento: 1990,
    observacao: "Sempre pede novidades de acessórios.",
    diasCadastro: 240,
    compras: [1, 5, 12, 21, 33, 60, 88, 130],
  },
  {
    id: "cli_005",
    nome: "Patrícia Lima",
    telefone: "(11) 97333-4545",
    aniversarioEmDias: null,
    anoNascimento: 1991,
    observacao: "Cadastro incompleto.",
    diasCadastro: 200,
    compras: [],
  },
  {
    id: "cli_006",
    nome: "Bianca Rezende",
    telefone: "(11) 99120-7788",
    aniversarioEmDias: 12,
    anoNascimento: 1997,
    observacao: "Gosta de peças de festa.",
    diasCadastro: 190,
    compras: [70, 105],
  },
  {
    id: "cli_007",
    nome: "Renata Andrade",
    telefone: "(11) 98511-2020",
    aniversarioEmDias: 20,
    anoNascimento: 1985,
    observacao: "",
    diasCadastro: 320,
    compras: [140, 200],
  },
  {
    id: "cli_008",
    nome: "Gabriela Pontes",
    telefone: "(41) 99666-1414",
    aniversarioEmDias: 45,
    anoNascimento: 1993,
    observacao: "Compra para revenda ocasional.",
    diasCadastro: 500,
    compras: [230, 300, 380],
  },
  {
    id: "cli_009",
    nome: "Fernanda Sales",
    telefone: "(11) 97444-3322",
    aniversarioEmDias: 60,
    anoNascimento: 1999,
    observacao: "",
    diasCadastro: 120,
    compras: [4],
  },
  {
    id: "cli_010",
    nome: "Débora Castro",
    telefone: "(11) 98800-1177",
    aniversarioEmDias: 6,
    anoNascimento: 1980,
    observacao: "Prefere atendimento por WhatsApp.",
    diasCadastro: 460,
    compras: [55, 96, 190, 260],
  },
  {
    id: "cli_011",
    nome: "Marina Teixeira",
    telefone: "(11) 99333-8181",
    aniversarioEmDias: 90,
    anoNascimento: 1996,
    observacao: "",
    diasCadastro: 150,
    compras: [],
  },
  {
    id: "cli_012",
    nome: "Sabrina Duarte",
    telefone: "(11) 96555-4040",
    aniversarioEmDias: 14,
    anoNascimento: 1987,
    observacao: "Indicou várias amigas.",
    diasCadastro: 600,
    compras: [3, 8, 19, 27, 40, 58, 75, 99, 128, 170],
  },
  {
    id: "cli_013",
    nome: "Aline Barros",
    telefone: "(11) 98122-6363",
    aniversarioEmDias: 200,
    anoNascimento: 1994,
    observacao: "",
    diasCadastro: 260,
    compras: [210],
  },
  {
    id: "cli_014",
    nome: "Tatiane Moraes",
    telefone: "(11) 97711-9090",
    aniversarioEmDias: 2,
    anoNascimento: 2001,
    observacao: "Primeira compra pelo Instagram.",
    diasCadastro: 40,
    compras: [30],
  },
];

/** Plano determinístico de compras por cliente (dias atrás de cada venda). */
export const PLANO_COMPRAS_CLIENTES: { clienteId: string; diasAtras: number[] }[] =
  CLIENTES_SEED.map((cliente) => ({ clienteId: cliente.id, diasAtras: cliente.compras }));

export function seedClientes(): Cliente[] {
  return CLIENTES_SEED.map((cliente, indice) => ({
    id: cliente.id,
    codigo: formatarCodigo("cliente", indice + 1),
    nome: cliente.nome,
    foto: null,
    telefone: cliente.telefone,
    dataNascimento:
      cliente.aniversarioEmDias === null
        ? null
        : nascimento(cliente.aniversarioEmDias, cliente.anoNascimento),
    observacao: cliente.observacao,
    criadoEm: iso(cliente.diasCadastro),
    atualizadoEm: iso(Math.max(0, cliente.diasCadastro - 2)),
    // Agregados recalculados pela camada de dados a partir das vendas.
    compras: 0,
    totalComprado: 0,
    ultimaCompra: null,
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
      // Agregados recalculados pela camada de dados a partir das vendas.
      vendas: 0,
      totalVendido: 0,
      ultimaVenda: null,
    }),
  );
}
