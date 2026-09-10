import { formatarCodigo } from "@/lib/codigos";
import type { Caixa, MovimentacaoCaixa, ResumoCaixa } from "@/types/caixa";
import type { VendaDetalhe, VendaResumo } from "@/types/venda";
import type { Vendedor } from "@/types/vendedor";

/**
 * Caixas de demonstração derivados das vendas já existentes.
 *
 * Cada DIA de operação vira um caixa (`CAIXA-0001`…), o último dia permanece
 * ABERTO e os anteriores são fechados com conferência. Nada é aleatório: os
 * mesmos dados de venda produzem sempre os mesmos caixas, para que a interface
 * possa exercitar todos os estados (conferido, sobra, falta).
 *
 * REGRA FINANCEIRA respeitada aqui: somente valores EFETIVAMENTE RECEBIDOS
 * entram no caixa. O valor pendente de uma venda EM_PAGAMENTO não é lançado;
 * ele só aparece quando a parcela é baixada (movimentação de recebimento).
 */

export interface CaixasSeed {
  caixas: Caixa[];
  movimentacoes: MovimentacaoCaixa[];
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

function dia(iso: string): string {
  return iso.slice(0, 10);
}

function comHorario(diaIso: string, hora: number, minuto: number): string {
  const data = new Date(`${diaIso}T00:00:00`);
  data.setHours(hora, minuto, 0, 0);
  return data.toISOString();
}

function resumoVazio(valorAbertura: number): ResumoCaixa {
  return {
    valorAbertura,
    totalVendas: 0,
    recebimentos: 0,
    entradasManuais: 0,
    totalEntradas: 0,
    saidasManuais: 0,
    devolucoes: 0,
    totalSaidas: 0,
    saldoEsperado: valorAbertura,
    quantidadeVendas: 0,
    quantidadeMovimentacoes: 0,
  };
}

const VALORES_ABERTURA = [150, 200, 250, 180];
const MOTIVOS_SAIDA_SEED = [
  "Material de limpeza",
  "Compra emergencial",
  "Pequenas despesas",
  "Retirada",
];
const DESCRICOES_SAIDA_SEED = [
  "Produtos de limpeza da loja",
  "Sacolas e embalagens",
  "Lanche da equipe",
  "Retirada para depósito bancário",
];

/**
 * Resumo derivado das movimentações — mesma fórmula usada pelo serviço mock.
 * Etapa 18.6 — `recebimentos` é sempre 0: o conceito de "recebimento de
 * parcela" como movimento distinto de "venda" foi abolido (Etapa 18.2 do
 * backend); qualquer entrada de uma venda, à vista ou parcela paga depois,
 * já está somada em `totalVendas` (tipo único `"venda"`).
 */
export function resumoDeMovimentacoes(
  valorAbertura: number,
  movimentacoes: MovimentacaoCaixa[],
): ResumoCaixa {
  const somar = (tipos: MovimentacaoCaixa["tipo"][]) =>
    arredondar(
      movimentacoes
        .filter((item) => tipos.includes(item.tipo))
        .reduce((total, item) => total + item.valor, 0),
    );

  const totalVendas = somar(["venda"]);
  const recebimentos = 0;
  const entradasManuais = somar(["injecao"]);
  const saidasManuais = somar(["sangria"]);
  const devolucoes = somar(["cancelamento"]);
  const totalEntradas = arredondar(totalVendas + recebimentos + entradasManuais);
  const totalSaidas = arredondar(saidasManuais + devolucoes);

  return {
    valorAbertura,
    totalVendas,
    recebimentos,
    entradasManuais,
    totalEntradas,
    saidasManuais,
    devolucoes,
    totalSaidas,
    saldoEsperado: arredondar(valorAbertura + totalEntradas - totalSaidas),
    quantidadeVendas: new Set(
      movimentacoes.filter((item) => item.tipo === "venda").map((item) => item.vendaId),
    ).size,
    quantidadeMovimentacoes: movimentacoes.length,
  };
}

export function seedCaixas(
  vendas: VendaResumo[],
  detalhes: VendaDetalhe[],
  vendedores: Vendedor[],
): CaixasSeed {
  const equipe = vendedores.filter((vendedor) => vendedor.ativo);
  if (!vendas.length || !equipe.length) return { caixas: [], movimentacoes: [] };

  // Um caixa por DIA de movimento: vendas, pagamentos de parcela e devoluções.
  const diasSet = new Set(vendas.map((venda) => dia(venda.dataVenda)));
  detalhes.forEach((detalhe) => {
    detalhe.pagamentos.forEach((pagamento) => diasSet.add(dia(pagamento.dataPagamento)));
    if (detalhe.cancelamento) diasSet.add(dia(detalhe.cancelamento.dataHora));
  });
  const dias = Array.from(diasSet).sort();
  const caixas: Caixa[] = dias.map((diaIso, indice) => {
    const responsavel = equipe[indice % equipe.length]!;
    const valorInicial = VALORES_ABERTURA[indice % VALORES_ABERTURA.length]!;
    return {
      id: `cx_${indice + 1}`,
      codigo: formatarCodigo("caixa", indice + 1),
      status: "fechado",
      abertura: {
        dataHora: comHorario(diaIso, 8, 30),
        responsavelId: responsavel.id,
        responsavelNome: responsavel.nome,
        valorInicial,
        observacao: indice % 4 === 0 ? "Troco conferido na abertura." : "",
      },
      fechamento: null,
      resumo: resumoVazio(valorInicial),
    };
  });

  const porDia = new Map(dias.map((diaIso, indice) => [diaIso, caixas[indice]!]));

  /** Caixa responsável por uma data: o do próprio dia ou o último anterior. */
  function caixaDaData(iso: string): Caixa {
    const alvo = dia(iso);
    const exato = porDia.get(alvo);
    if (exato) return exato;
    const anteriores = dias.filter((item) => item <= alvo);
    const escolhido = anteriores.length ? anteriores[anteriores.length - 1]! : dias[0]!;
    return porDia.get(escolhido)!;
  }

  const movimentacoes: MovimentacaoCaixa[] = [];
  let sequencia = 0;

  function idMovimentacao(): string {
    sequencia += 1;
    return `mov_${sequencia}`;
  }

  const detalhePorId = new Map(detalhes.map((detalhe) => [detalhe.id, detalhe]));

  vendas.forEach((venda) => {
    const caixaVenda = caixaDaData(venda.dataVenda);
    venda.caixaId = caixaVenda.id;
    venda.caixaCodigo = caixaVenda.codigo;

    const detalhe = detalhePorId.get(venda.id);
    if (!detalhe) return;
    detalhe.caixaId = caixaVenda.id;
    detalhe.caixaCodigo = caixaVenda.codigo;

    detalhe.pagamentos.forEach((pagamento, indice) => {
      const noAto = dia(pagamento.dataPagamento) === dia(venda.dataVenda) && indice === 0;
      const caixa = noAto ? caixaVenda : caixaDaData(pagamento.dataPagamento);
      const parcela = detalhe.parcelas.find(
        (item) => item.pagoEm === pagamento.dataPagamento && item.numero > 1,
      );
      const recebimentoDeParcela = !noAto && Boolean(parcela);

      // Etapa 18.6 — recebimento de parcela é só mais um movimento
      // `tipo: "venda"` (o Caixa não distingue mais "à vista" de "baixa de
      // parcela"); a descrição continua diferenciando os dois casos para o
      // operador, exatamente como o backend real faz.
      const movimentacao: MovimentacaoCaixa = {
        id: idMovimentacao(),
        caixaId: caixa.id,
        dataHora: pagamento.dataPagamento,
        tipo: "venda",
        origem: "venda",
        descricao: recebimentoDeParcela
          ? `Recebimento da parcela ${parcela!.numero}/${parcela!.total} · ${venda.clienteNome}`
          : `Venda ${venda.codigo} · ${venda.clienteNome}`,
        referencia: venda.codigo,
        vendaId: venda.id,
        vendaCodigo: venda.codigo,
        formaPagamento: pagamento.forma,
        valor: arredondar(pagamento.valor),
        sentido: "entrada",
        observacao: pagamento.observacao ?? "",
        motivo: null,
      };
      movimentacoes.push(movimentacao);
    });

    // Devolução/cancelamento: saída limitada ao valor efetivamente recebido.
    if (detalhe.cancelamento && detalhe.valorPago > 0) {
      const cancelamento = detalhe.cancelamento;
      const caixa = caixaDaData(cancelamento.dataHora);
      const valor = arredondar(Math.min(cancelamento.valorDevolvido, detalhe.valorPago));
      if (valor > 0) {
        // Etapa 18.6 — cancelamento/devolução (total ou parcial) é sempre
        // `tipo: "cancelamento"` (o Caixa não distingue mais os dois); a
        // distinção continua só na descrição, mesma regra do backend real.
        movimentacoes.push({
          id: idMovimentacao(),
          caixaId: caixa.id,
          dataHora: cancelamento.dataHora,
          tipo: "cancelamento",
          origem: "cancelamento",
          descricao:
            cancelamento.tipo === "integral"
              ? `Cancelamento da venda ${venda.codigo} · ${venda.clienteNome}`
              : `Devolução parcial da venda ${venda.codigo} · ${venda.clienteNome}`,
          referencia: venda.codigo,
          vendaId: venda.id,
          vendaCodigo: venda.codigo,
          formaPagamento: venda.formaPagamento,
          valor,
          sentido: "saida",
          observacao: cancelamento.motivo,
          motivo: cancelamento.motivo,
        });
      }
    }
  });

  // Movimentações manuais determinísticas (entradas e saídas de rotina).
  caixas.forEach((caixa, indice) => {
    const diaIso = dia(caixa.abertura.dataHora);
    if (indice % 3 === 0) {
      movimentacoes.push({
        id: idMovimentacao(),
        caixaId: caixa.id,
        dataHora: comHorario(diaIso, 11, 15),
        tipo: "injecao",
        origem: "manual",
        descricao: "Suprimento de troco",
        referencia: null,
        vendaId: null,
        vendaCodigo: null,
        formaPagamento: "Dinheiro",
        valor: 100,
        sentido: "entrada",
        observacao: "Reforço de troco solicitado pela loja.",
        motivo: null,
      });
    }
    if (indice % 2 === 0) {
      const posicao = indice % MOTIVOS_SAIDA_SEED.length;
      movimentacoes.push({
        id: idMovimentacao(),
        caixaId: caixa.id,
        dataHora: comHorario(diaIso, 16, 40),
        tipo: "sangria",
        origem: "manual",
        descricao: DESCRICOES_SAIDA_SEED[posicao]!,
        referencia: null,
        vendaId: null,
        vendaCodigo: null,
        formaPagamento: "Dinheiro",
        valor: 30 + posicao * 10,
        sentido: "saida",
        observacao: "",
        motivo: MOTIVOS_SAIDA_SEED[posicao]!,
      });
    }
  });

  movimentacoes.sort((a, b) => a.dataHora.localeCompare(b.dataHora));

  // Resumo financeiro de cada caixa, sempre derivado das movimentações.
  caixas.forEach((caixa) => {
    caixa.resumo = resumoDeMovimentacoes(
      caixa.abertura.valorInicial,
      movimentacoes.filter((item) => item.caixaId === caixa.id),
    );
  });

  // Fechamento: o último caixa permanece ABERTO; os demais são conferidos.
  const DIFERENCAS = [0, 12.5, 0, -8.4, 0];
  caixas.forEach((caixa, indice) => {
    if (indice === caixas.length - 1) {
      caixa.status = "aberto";
      return;
    }
    const esperado = caixa.resumo.saldoEsperado;
    const diferenca = DIFERENCAS[indice % DIFERENCAS.length]!;
    const informado = arredondar(esperado + diferenca);
    caixa.fechamento = {
      dataHora: comHorario(dia(caixa.abertura.dataHora), 19, 30),
      responsavelId: caixa.abertura.responsavelId,
      responsavelNome: caixa.abertura.responsavelNome,
      valorInformado: informado,
      valorEsperado: esperado,
      diferenca: arredondar(diferenca),
      observacao:
        diferenca === 0
          ? ""
          : diferenca > 0
            ? "Sobra identificada na conferência da gaveta."
            : "Falta identificada: troco entregue a mais durante o dia.",
    };
  });

  return { caixas, movimentacoes };
}
