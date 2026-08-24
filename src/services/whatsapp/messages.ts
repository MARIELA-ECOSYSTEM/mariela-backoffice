/**
 * Mensagens pré-definidas do WhatsApp.
 *
 * Centralizadas aqui para que, no futuro, o administrador possa configurá-las em
 * Configurações → Integrações → WhatsApp sem alterar nenhum componente de UI.
 */

export type TipoMensagemWhatsapp = "geral" | "aniversario" | "fornecedor" | "vendedor";

export interface TemplateWhatsapp {
  tipo: TipoMensagemWhatsapp;
  titulo: string;
  descricao: string;
  /** `{{nome}}` é substituído pelo primeiro nome do cliente. */
  corpo: string;
}

export const TEMPLATES_WHATSAPP: Record<TipoMensagemWhatsapp, TemplateWhatsapp> = {
  geral: {
    tipo: "geral",
    titulo: "Enviar mensagem",
    descricao: "Mensagem de relacionamento enviada para a cliente.",
    corpo: `Olá, {{nome}}! 💜
Passando para desejar um ótimo dia!
Estamos com novidades na MARIELA e será um prazer receber você em nossa loja.`,
  },
  fornecedor: {
    tipo: "fornecedor",
    titulo: "Enviar mensagem",
    descricao: "Mensagem operacional enviada ao contato do fornecedor.",
    corpo: `Olá, {{nome}}! 💜
Aqui é a equipe da MARIELA Moda Feminina.
Gostaríamos de alinhar disponibilidade de peças e prazos do próximo pedido.`,
  },
  vendedor: {
    tipo: "vendedor",
    titulo: "Enviar mensagem",
    descricao: "Mensagem interna enviada à vendedora da loja.",
    corpo: `Olá, {{nome}}! 💜
Mensagem da administração da MARIELA.
Passando um recado rápido sobre a operação da loja.`,
  },
  aniversario: {
    tipo: "aniversario",
    titulo: "Mensagem de aniversário",
    descricao: "Mensagem comemorativa para a aniversariante.",
    corpo: `Olá, {{nome}}! 💜
A equipe MARIELA deseja a você um feliz aniversário! 🎂✨
Que seu novo ciclo seja cheio de coisas boas, saúde, felicidade e muitos momentos especiais.
Esperamos você na MARIELA! 💜`,
  },
};

/** Primeiro nome, usado na personalização das mensagens. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome.trim();
}

/** Monta a mensagem final substituindo as variáveis do template. */
export function montarMensagem(tipo: TipoMensagemWhatsapp, nome: string): string {
  return TEMPLATES_WHATSAPP[tipo].corpo.replaceAll("{{nome}}", primeiroNome(nome));
}

/**
 * Mensagem em lote de aniversário (Dialog de Aniversariantes).
 * Não contém `{{nome}}`: a personalização com o primeiro nome de cada cliente é
 * aplicada automaticamente no envio (ver `montarMensagemLote`).
 */
export const MENSAGEM_ANIVERSARIO_LOTE = `🎉 Feliz Aniversário! 🎂

A Mariela Moda Feminina deseja um dia maravilhoso repleto de alegrias e conquistas! ✨

Como presente especial, você ganhou 10% de desconto na sua próxima compra! 🎁

Venha nos visitar! 💜`;

/** Prefixa a saudação personalizada ao corpo escrito pelo administrador. */
export function montarMensagemLote(corpo: string, nome: string): string {
  return `Olá, ${primeiroNome(nome)}!\n\n${corpo.replaceAll("{{nome}}", primeiroNome(nome))}`;
}
