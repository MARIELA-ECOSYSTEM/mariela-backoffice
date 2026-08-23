/**
 * Mapa visual de cores: converte o NOME cadastrado da variante em um valor CSS
 * apenas para exibição (bolinha indicadora). O valor salvo nunca é alterado.
 */
const MAPA_CORES: Record<string, string> = {
  preto: "#1a1a1a",
  branco: "#f8f8f8",
  "off white": "#f2ede4",
  offwhite: "#f2ede4",
  cru: "#e8dfd0",
  bege: "#e3d3bb",
  nude: "#e6cdbb",
  caramelo: "#a9682f",
  marrom: "#6b4423",
  chocolate: "#4a2c1a",
  cinza: "#8c8c8c",
  "cinza claro": "#c9c9c9",
  "cinza escuro": "#4d4d4d",
  grafite: "#3a3a3a",
  prata: "#c0c0c0",
  dourado: "#c9a227",
  amarelo: "#f2c531",
  mostarda: "#c9971f",
  laranja: "#e8792b",
  coral: "#f0796b",
  salmao: "#f4a08a",
  vermelho: "#c62828",
  marsala: "#8c2f39",
  vinho: "#6e1b2a",
  bordo: "#5c1526",
  rosa: "#e79ab5",
  "rosa claro": "#f4c7d6",
  "rosa bebe": "#f7d3de",
  pink: "#e0338c",
  fucsia: "#d6249f",
  roxo: "#6f4a8e",
  lilas: "#9b7bb5",
  lavanda: "#c5b3dc",
  violeta: "#7b3fa0",
  azul: "#2f6fbb",
  "azul claro": "#8dbbe6",
  "azul marinho": "#1f2f56",
  "azul royal": "#1f45a8",
  jeans: "#4a6b96",
  turquesa: "#2fb4b0",
  verde: "#2f8f4e",
  "verde claro": "#8fce9b",
  "verde militar": "#4b5320",
  "verde oliva": "#6b7a3a",
  "verde agua": "#a8d8cb",
  esmeralda: "#137a5a",
  estampado: "#b39ddb",
  multicolor: "#b39ddb",
};

function normalizar(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Cor CSS aproximada para o indicador visual; fallback neutro quando desconhecida. */
export function corVisual(nome: string): string {
  const chave = normalizar(nome);
  const direta = MAPA_CORES[chave];
  if (direta) return direta;
  // Nomes compostos ("Azul Marinho Escuro"): usa o primeiro termo conhecido.
  for (const termo of chave.split(" ")) {
    const parcial = MAPA_CORES[termo];
    if (parcial) return parcial;
  }
  return "#cfc6d8";
}
