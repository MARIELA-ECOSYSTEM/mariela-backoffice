/**
 * Fase 1 (WhatsApp via `wa.me`) — monta o link oficial de conversa do WhatsApp com a mensagem pré-preenchida. Nada é
 * enviado: o link só abre a conversa; quem envia é a pessoa, no próprio WhatsApp.
 *
 * Regras do telefone (só Brasil, sem heurísticas):
 *   - aceita apenas dígitos e formatação comum: espaços, parênteses, hífen, ponto, barra e um "+" no início;
 *     qualquer outro caractere (letras, ramal, "#"…) → rejeitado;
 *   - 10 ou 11 dígitos = DDD + número; 12 ou 13 dígitos começando com 55 = DDI 55 + DDD + número. O DDI 55 é
 *     acrescentado só quando falta — nunca duplicado. Um número de 11 dígitos que começa com 55 é DDD 55 (RS), não DDI;
 *   - o DDD precisa existir (lista oficial da Anatel);
 *   - 11 dígitos: celular — o número começa com 9;
 *   - 10 dígitos: fixo — o número começa com 2, 3, 4 ou 5. Um celular SEM o nono dígito (começando com 6–9) é
 *     rejeitado: o dígito nunca é inventado;
 *   - qualquer outro tamanho → rejeitado.
 */

/** DDDs válidos no Brasil (Anatel). */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const FORMATACAO_PERMITIDA = /^\+?[\d\s().\-/]*$/;

export type TelefoneWhatsapp =
  | { valido: true; /** Só dígitos, com DDI 55 (ex.: 5583999991234). */ numero: string }
  | { valido: false; motivo: string };

export function normalizarTelefoneWhatsapp(telefone: string | null | undefined): TelefoneWhatsapp {
  const bruto = (telefone ?? "").trim();
  if (!bruto) return { valido: false, motivo: "Sem telefone cadastrado." };
  if (!FORMATACAO_PERMITIDA.test(bruto)) {
    return { valido: false, motivo: "O telefone tem caracteres que não são de um número." };
  }

  const digitos = bruto.replace(/\D/g, "");
  let nacional: string;
  if (digitos.length === 10 || digitos.length === 11) nacional = digitos;
  else if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    nacional = digitos.slice(2);
  } else {
    return { valido: false, motivo: "Informe DDD + número (10 ou 11 dígitos)." };
  }

  if (!DDDS_VALIDOS.has(Number(nacional.slice(0, 2)))) {
    return { valido: false, motivo: "DDD inválido." };
  }
  const assinante = nacional.slice(2);
  if (assinante.length === 9 && assinante[0] !== "9") {
    return { valido: false, motivo: "Celular com 9 dígitos precisa começar com 9." };
  }
  if (assinante.length === 8 && !/^[2-5]/.test(assinante)) {
    return {
      valido: false,
      motivo: "Parece um celular sem o nono dígito. Confira o número no cadastro.",
    };
  }
  return { valido: true, numero: `55${nacional}` };
}

export type LinkWhatsapp = { valido: true; url: string } | { valido: false; motivo: string };

/**
 * `https://wa.me/55DDDNUMERO?text=...`. A mensagem vai como está (acentos, emojis, quebras de linha e espaços
 * preservados), codificada para URL; mensagem vazia ou só com espaços → link sem `text` (abre a conversa em branco).
 */
export function montarLinkWhatsapp(
  telefone: string | null | undefined,
  mensagem = "",
): LinkWhatsapp {
  const tel = normalizarTelefoneWhatsapp(telefone);
  if (!tel.valido) return tel;
  const base = `https://wa.me/${tel.numero}`;
  return {
    valido: true,
    url: mensagem.trim() ? `${base}?text=${encodeURIComponent(mensagem)}` : base,
  };
}

/** Substitui `{{nome}}` e `{nome}` pelo primeiro nome do destinatário. */
export function preencherNome(texto: string, nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return texto.replaceAll("{{nome}}", primeiro).replaceAll("{nome}", primeiro);
}

/**
 * Fase 2 (aniversariantes) — a mensagem padrão de aniversário das Configurações. As mensagens padrão não têm tipo (só
 * título e conteúdo), então vale a primeira cujo TÍTULO contém "aniversário" (sem diferenciar maiúsculas nem acento).
 * Nenhuma → `undefined` (quem chama usa a sugestão da loja).
 */
export function encontrarMensagemPadraoAniversario<T extends { titulo: string }>(
  padroes: readonly T[],
): T | undefined {
  return padroes.find((item) =>
    item.titulo.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes("aniversario"),
  );
}
