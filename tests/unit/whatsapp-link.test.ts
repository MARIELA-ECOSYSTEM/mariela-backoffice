/**
 * Fase 1 (WhatsApp via `wa.me`) — normalização do telefone e montagem do link. Executar com: `bun test tests/unit`.
 * Função pura, sem rede.
 */
import { describe, expect, test } from "bun:test";
import {
  montarLinkWhatsapp,
  normalizarTelefoneWhatsapp,
  preencherNome,
} from "@/utils/whatsapp-link";

const numero = (telefone: string) => {
  const r = normalizarTelefoneWhatsapp(telefone);
  return r.valido ? r.numero : null;
};
const url = (telefone: string, texto?: string) => {
  const r = montarLinkWhatsapp(telefone, texto);
  return r.valido ? r.url : null;
};

describe("telefone — aceitos", () => {
  test("1. celular brasileiro com formatação", () => {
    expect(numero("(83) 99999-1234")).toBe("5583999991234");
  });

  test("2. com DDI 55 já presente (com e sem +)", () => {
    expect(numero("+55 (83) 99999-1234")).toBe("5583999991234");
    expect(numero("55 83 99999-1234")).toBe("5583999991234");
    expect(numero("5583999991234")).toBe("5583999991234");
  });

  test("3. sem formatação", () => {
    expect(numero("83999991234")).toBe("5583999991234");
  });

  test("4. DDD de várias regiões; fixo com 10 dígitos", () => {
    expect(numero("11 98765-4321")).toBe("5511987654321");
    expect(numero("(21) 3456-7890")).toBe("552134567890");
    expect(numero("+55 21 3456-7890")).toBe("552134567890");
    expect(numero("99 91234-5678")).toBe("5599912345678");
  });

  test("12. não duplica o DDI", () => {
    expect(numero("+55 55 99999-1234")).toBe("5555999991234");
    expect(url("+5583999991234")).toBe("https://wa.me/5583999991234");
  });

  test("DDD 55 (RS) sem DDI não é confundido com o DDI", () => {
    expect(numero("(55) 99999-1234")).toBe("5555999991234");
  });

  test("outras formatações comuns: ponto, barra e espaços extras", () => {
    expect(numero("  83.99999.1234 ")).toBe("5583999991234");
    expect(numero("83/99999-1234")).toBe("5583999991234");
  });
});

describe("telefone — rejeitados", () => {
  test("9. vazio, só espaços, null e undefined", () => {
    for (const vazio of ["", "   ", null, undefined]) {
      expect(normalizarTelefoneWhatsapp(vazio)).toEqual({
        valido: false,
        motivo: "Sem telefone cadastrado.",
      });
    }
  });

  test("10. inválido: letras, ramal, símbolos", () => {
    for (const t of [
      "abc",
      "83 9999-ABCD",
      "(83) 99999-1234 ramal 2",
      "83#999991234",
      "83*999991234",
    ]) {
      expect(numero(t)).toBeNull();
    }
  });

  test("11. incompleto ou longo demais", () => {
    for (const t of ["9999-1234", "83 9999-123", "839999912345", "55839999912345", "+55 83 9999"]) {
      expect(numero(t)).toBeNull();
    }
  });

  test("13. celular sem o nono dígito: rejeitado, sem inventar dígito", () => {
    expect(normalizarTelefoneWhatsapp("(83) 9999-1234")).toEqual({
      valido: false,
      motivo: "Parece um celular sem o nono dígito. Confira o número no cadastro.",
    });
    expect(numero("+55 83 8888-1234")).toBeNull();
  });

  test("14a. DDD inexistente ou com zero", () => {
    for (const t of ["(20) 99999-1234", "(10) 99999-1234", "(01) 99999-1234", "(23) 3456-7890"]) {
      expect(normalizarTelefoneWhatsapp(t)).toMatchObject({
        valido: false,
        motivo: "DDD inválido.",
      });
    }
  });

  test("14b. 11 dígitos que não começam com 9 no número", () => {
    expect(numero("(83) 89999-1234")).toBeNull();
  });

  test("14c. DDI estrangeiro e prefixo de operadora/zero não são adivinhados", () => {
    expect(numero("+1 (415) 555-1234")).toBeNull();
    expect(numero("0 83 99999-1234")).toBeNull();
    expect(numero("0xx83999991234")).toBeNull();
  });

  test("14d. '+' fora do início é rejeitado", () => {
    expect(numero("83+999991234")).toBeNull();
  });

  test("link nunca é gerado para telefone inválido", () => {
    expect(montarLinkWhatsapp("123", "Oi")).toMatchObject({ valido: false });
  });
});

describe("mensagem — codificação no link", () => {
  test("5. espaços viram %20 (nunca '+')", () => {
    expect(url("83999991234", "Olá mundo")).toBe(
      "https://wa.me/5583999991234?text=Ol%C3%A1%20mundo",
    );
  });

  test("6. acentos e cedilha", () => {
    const texto = "Promoção de verão: calças, saias e blusões!";
    const r = url("83999991234", texto)!;
    expect(r).not.toMatch(/[çãõé ]/);
    expect(new URL(r).searchParams.get("text")).toBe(texto);
  });

  test("7. emojis", () => {
    const texto = "Feliz aniversário 🎂💜✨";
    const r = url("83999991234", texto)!;
    expect(r).toContain("%F0%9F%8E%82");
    expect(new URL(r).searchParams.get("text")).toBe(texto);
  });

  test("pontuação reservada de URL (&, ?, #, +, =, %) e quebras de linha preservadas", () => {
    const texto = "Oi, Ana!\nDesconto 10% & frete? Use #MARIELA + cupom=VERAO";
    const r = url("83999991234", texto)!;
    expect(r.split("?text=")[1]).not.toMatch(/[&#+=\n ]/);
    expect(new URL(r).searchParams.get("text")).toBe(texto);
  });

  test("espaços no início e no fim da mensagem não são removidos", () => {
    expect(new URL(url("83999991234", "  oi  ")!).searchParams.get("text")).toBe("  oi  ");
  });

  test("8. texto vazio ou só espaços → link sem `text` (conversa em branco)", () => {
    expect(url("83999991234", "")).toBe("https://wa.me/5583999991234");
    expect(url("83999991234", "   ")).toBe("https://wa.me/5583999991234");
    expect(url("83999991234")).toBe("https://wa.me/5583999991234");
  });

  test("o link é sempre https://wa.me/ com só dígitos no caminho", () => {
    expect(url("+55 (83) 99999-1234", "x")).toMatch(/^https:\/\/wa\.me\/\d+\?text=x$/);
  });
});

describe("preencherNome", () => {
  test("troca {nome} e {{nome}} pelo primeiro nome", () => {
    expect(preencherNome("Olá, {{nome}}! Tudo bem, {nome}?", "  Ana Maria Souza ")).toBe(
      "Olá, Ana! Tudo bem, Ana?",
    );
  });

  test("sem placeholder, o texto fica igual", () => {
    expect(preencherNome("Bom dia!", "Ana")).toBe("Bom dia!");
  });
});
