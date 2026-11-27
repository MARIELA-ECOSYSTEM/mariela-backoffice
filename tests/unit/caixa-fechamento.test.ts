/**
 * Fase 22.8.9.12 — fechamento de caixa pelo DINHEIRO FÍSICO da gaveta. Executar com: `bun test tests/unit`.
 *
 * - `conferenciaDoFechamento` (prévia da tela): o contado é conferido contra `resumo.dinheiroEsperado`; PIX e cartões
 *   ficam só em `outrasFormas` e nunca viram falta. Com um servidor anterior (sem `dinheiroEsperado`), a prévia
 *   continua igual ao que esse servidor grava (saldo de todas as formas).
 * - `resumoDaGaveta` (Mock API): espelho do `gaveta.util.ts` do backend.
 * Tudo sintético e em memória.
 */
import { describe, expect, test } from "bun:test";
import { conferenciaDoFechamento } from "@/utils/caixa";
import { resumoDaGaveta } from "@/services/mock/caixas.lancamentos";
import type { MovimentacaoCaixa, ResumoCaixa } from "@/types/caixa";

type Mov = Pick<MovimentacaoCaixa, "formaPagamento" | "valor" | "sentido">;
const entrada = (formaPagamento: string, valor: number): Mov => ({ formaPagamento, valor, sentido: "entrada" });
const saida = (formaPagamento: string, valor: number): Mov => ({ formaPagamento, valor, sentido: "saida" });

/** Resumo como o backend devolve, a partir dos movimentos (saldo = todas as formas). */
function resumo(valorInicial: number, movimentos: Mov[]): ResumoCaixa {
  const soma = (sentido: "entrada" | "saida") =>
    movimentos.filter((m) => m.sentido === sentido).reduce((t, m) => t + m.valor, 0);
  return {
    valorAbertura: valorInicial,
    totalVendas: soma("entrada"),
    recebimentos: 0,
    entradasManuais: 0,
    totalEntradas: soma("entrada"),
    saidasManuais: 0,
    devolucoes: soma("saida"),
    totalSaidas: soma("saida"),
    saldoEsperado: Number((valorInicial + soma("entrada") - soma("saida")).toFixed(2)),
    quantidadeVendas: 0,
    quantidadeMovimentacoes: movimentos.length,
    ...resumoDaGaveta(movimentos, valorInicial),
  };
}

describe("resumoDaGaveta — só 'Dinheiro' movimenta a gaveta (espelho do backend)", () => {
  test("cenário 1 — dinheiro: 100 + 230 → 330", () => {
    expect(resumoDaGaveta([entrada("Dinheiro", 230)], 100).dinheiroEsperado).toBe(330);
  });

  test.each([
    ["PIX", 134],
    ["Crédito", 130],
    ["Débito", 130],
  ])("cenários 2 a 4 — %s não mexe na gaveta: 100 + %d → 100", (forma, valor) => {
    const r = resumoDaGaveta([entrada(forma, valor)], 100);
    expect(r.dinheiroEsperado).toBe(100);
    expect(r.porFormaPagamento).toEqual([{ forma, dinheiroFisico: false, entradas: valor, saidas: 0, saldo: valor }]);
  });

  test("cenário 5 — combinado (dados do CAIXA-0001): só a parte em dinheiro entra", () => {
    const r = resumoDaGaveta(
      [
        entrada("Dinheiro", 100),
        entrada("PIX", 134),
        entrada("Dinheiro", 130),
        entrada("Crédito", 130),
        entrada("Débito", 130),
        saida("Débito", 130),
      ],
      100,
    );
    expect(r.dinheiroEsperado).toBe(330);
    expect(r.porFormaPagamento?.map((g) => [g.forma, g.saldo])).toEqual([
      ["Dinheiro", 230],
      ["Crédito", 130],
      ["Débito", 0],
      ["PIX", 134],
    ]);
  });

  test("cenários 6 a 8 — cancelamento/sangria em dinheiro tiram da gaveta; suprimento põe; estorno eletrônico não mexe", () => {
    const r = resumoDaGaveta(
      [entrada("Dinheiro", 200), entrada("PIX", 150), saida("PIX", 150), saida("Dinheiro", 80), saida("Dinheiro", 50), entrada("Dinheiro", 40)],
      100,
    );
    expect(r.dinheiroEsperado).toBe(210); // 100 + 200 − 80 − 50 + 40
  });

  test("cenário 10 — forma desconhecida nunca vira dinheiro; variações de escrita de 'Dinheiro' são reconhecidas", () => {
    const r = resumoDaGaveta([entrada("Vale-presente", 60), entrada("Espécie", 15), entrada("  DINHEIRO ", 20)], 100);
    expect(r.dinheiroEsperado).toBe(120);
    expect(r.porFormaPagamento?.filter((g) => !g.dinheiroFisico).map((g) => g.forma)).toEqual(["Espécie", "Vale-presente"]);
  });
});

describe("conferenciaDoFechamento — prévia da tela de fechamento", () => {
  const caixa0001 = resumo(100, [
    entrada("Dinheiro", 100),
    entrada("PIX", 134),
    entrada("Dinheiro", 130),
    entrada("Crédito", 130),
    entrada("Débito", 130),
    saida("Débito", 130),
  ]);

  test("o defeito: gaveta certa (330) com PIX e cartão NÃO mostra falta", () => {
    expect(caixa0001.saldoEsperado).toBe(594); // o valor antigo, que gerava "Falta de R$ 264,00"
    const c = conferenciaDoFechamento(caixa0001, "330");
    expect(c.regraDinheiroFisico).toBe(true);
    expect(c.esperado).toBe(330);
    expect(c.diferenca).toBe(0);
    expect(c.situacao).toBe("conferido");
    expect(c.exigeObservacao).toBe(false);
    expect(c.outrasFormas.map((g) => [g.forma, g.saldo])).toEqual([
      ["Crédito", 130],
      ["Débito", 0],
      ["PIX", 134],
    ]);
  });

  test("cenário 9 — diferença física REAL continua aparecendo e exigindo observação", () => {
    const falta = conferenciaDoFechamento(caixa0001, "320,50");
    expect(falta.diferenca).toBe(-9.5);
    expect(falta.situacao).toBe("falta");
    expect(falta.exigeObservacao).toBe(true);
    const sobra = conferenciaDoFechamento(caixa0001, "335");
    expect(sobra.situacao).toBe("sobra");
    expect(sobra.diferenca).toBe(5);
  });

  test("só PIX e cartões: conferido com o valor de abertura", () => {
    const r = resumo(100, [entrada("PIX", 134), entrada("Crédito", 130), entrada("Débito", 130)]);
    expect(conferenciaDoFechamento(r, "100")).toMatchObject({ esperado: 100, diferenca: 0, situacao: "conferido" });
  });

  test("valor vazio ou inválido não gera diferença nem exige observação; negativo é aceito (caixa pode fechar negativo)", () => {
    for (const digitado of ["", "  ", "abc"]) {
      expect(conferenciaDoFechamento(caixa0001, digitado)).toMatchObject({ informadoInvalido: true, diferenca: 0, exigeObservacao: false });
    }
    const negativo = conferenciaDoFechamento(resumo(0, [saida("Dinheiro", 50)]), "-50");
    expect(negativo).toMatchObject({ informadoInvalido: false, esperado: -50, diferenca: 0, situacao: "conferido" });
  });

  test("contrato: servidor ANTERIOR (sem dinheiroEsperado) — a prévia segue o saldo de todas as formas, como o servidor grava", () => {
    const { dinheiroEsperado: _d, porFormaPagamento: _p, ...antigo } = caixa0001;
    const c = conferenciaDoFechamento(antigo, "330");
    expect(c.regraDinheiroFisico).toBe(false);
    expect(c.esperado).toBe(594);
    expect(c.diferenca).toBe(-264);
    expect(c.outrasFormas).toEqual([]);
  });
});
