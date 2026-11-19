/**
 * Fase 22.8.9.9.2 (M2) — armazenamento SIMULADO da Mock API (substitui o R2 no modo Mock). Determinístico, em
 * memória, sem nenhuma requisição de rede. Só é carregado por import dinâmico quando a Mock API está ativa (o build
 * de produção recusa a Mock API — `services/api/client.ts`).
 *
 * As "URLs assinadas" têm o esquema `mock-r2://` e só valem aqui. O `PUT` simulado confere o que o R2 confere por
 * causa da assinatura: método, cabeçalhos EXATOS (nenhum a mais, nenhum a menos, mesmos valores), tamanho do corpo
 * e validade. Divergência = 403, como o R2.
 *
 * Falhas simuláveis (uma vez cada, na ordem): `simularFalhasDeMidia([...])` nos testes, ou, no app em modo Mock,
 * `localStorage["mariela.mock.falhasMidia"] = "solicitacao-429,envio-rede"` (lista separada por vírgula).
 */
import type { RequisicaoArmazenamento } from "@/services/midia/envio-midia";

export const PREFIXO_URL_MOCK = "mock-r2://upload/";
export const CHAVE_FALHAS_MOCK = "mariela.mock.falhasMidia";

export type FalhaSimuladaMidia =
  | "solicitacao-403"
  | "solicitacao-409"
  | "solicitacao-429"
  | "solicitacao-503"
  | "envio-rede"
  | "envio-503"
  | "confirmacao-rede"
  | "confirmacao-503"
  /** Confirma (grava a mídia na galeria) e responde 503: a resposta "se perde" — exige reconciliação. */
  | "confirmacao-gravar-e-503"
  | "confirmacao-429";

interface Assinatura {
  chave: string;
  method: "PUT";
  headers: Record<string, string>;
  tamanho: number;
  venceEm: number;
}

interface ObjetoArmazenado {
  contentType: string;
  cacheControl: string;
  tamanho: number;
}

const assinaturas = new Map<string, Assinatura>();
const objetos = new Map<string, ObjetoArmazenado>();
let falhasEmMemoria: FalhaSimuladaMidia[] = [];
let relogio: () => number = () => Date.now();

/** Só testes: relógio controlado. */
export function definirRelogioMidiaMock(agora: (() => number) | null): void {
  relogio = agora ?? (() => Date.now());
}

export function agoraMidiaMock(): number {
  return relogio();
}

/** Só testes: zera assinaturas, objetos e falhas simuladas. */
export function reiniciarArmazenamentoMock(): void {
  assinaturas.clear();
  objetos.clear();
  falhasEmMemoria = [];
}

/** Agenda falhas para as próximas operações (cada uma é consumida uma vez). */
export function simularFalhasDeMidia(falhas: FalhaSimuladaMidia[]): void {
  falhasEmMemoria.push(...falhas);
}

/** Consome a próxima falha simulada desta etapa, se houver (memória primeiro; depois o `localStorage` do app). */
export function consumirFalha(
  etapa: "solicitacao" | "envio" | "confirmacao",
): FalhaSimuladaMidia | null {
  const i = falhasEmMemoria.findIndex((f) => f.startsWith(`${etapa}-`));
  if (i >= 0) return falhasEmMemoria.splice(i, 1)[0]!;
  try {
    if (typeof window === "undefined") return null;
    const lista = (window.localStorage.getItem(CHAVE_FALHAS_MOCK) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const j = lista.findIndex((f) => f.startsWith(`${etapa}-`));
    if (j < 0) return null;
    const [falha] = lista.splice(j, 1);
    if (lista.length) window.localStorage.setItem(CHAVE_FALHAS_MOCK, lista.join(","));
    else window.localStorage.removeItem(CHAVE_FALHAS_MOCK);
    return falha as FalhaSimuladaMidia;
  } catch {
    return null;
  }
}

/** "Assina" um envio: devolve a URL `mock-r2://` e registra o que o PUT precisa trazer. */
export function assinarEnvioMock(uploadId: string, assinatura: Assinatura): string {
  const url = `${PREFIXO_URL_MOCK}${encodeURIComponent(uploadId)}`;
  assinaturas.set(url, assinatura);
  return url;
}

export function objetoMock(chave: string): ObjetoArmazenado | null {
  return objetos.get(chave) ?? null;
}

const normalizar = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

/** O `PUT` simulado. Mesmo contrato do transporte real: `status` HTTP, `0` = sem resposta. */
export async function receberEnvioMock(req: RequisicaoArmazenamento): Promise<{ status: number }> {
  const simulada = consumirFalha("envio");
  if (simulada === "envio-rede") return { status: 0 };
  if (simulada === "envio-503") return { status: 503 };
  const assinatura = assinaturas.get(req.url);
  if (!assinatura) return { status: 403 };
  if (relogio() > assinatura.venceEm) return { status: 403 };
  const esperados = normalizar(assinatura.headers);
  const recebidos = normalizar(req.headers);
  const mesmasChaves =
    Object.keys(esperados).length === Object.keys(recebidos).length &&
    Object.entries(esperados).every(([k, v]) => recebidos[k] === v);
  if (req.method !== assinatura.method || !mesmasChaves || req.corpo.size !== assinatura.tamanho) {
    return { status: 403 };
  }
  req.onProgresso?.(req.corpo.size, req.corpo.size);
  objetos.set(assinatura.chave, {
    contentType: recebidos["content-type"]!,
    cacheControl: recebidos["cache-control"]!,
    tamanho: req.corpo.size,
  });
  return { status: 200 };
}
