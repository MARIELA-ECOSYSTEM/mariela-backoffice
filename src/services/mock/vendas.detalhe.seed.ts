import type { Produto } from "@/types/produto";
import type {
  EventoVenda,
  ItemVenda,
  PagamentoVenda,
  ParcelaVenda,
  VendaDetalhe,
  VendaResumo,
} from "@/types/venda";
import { precoFinal } from "@/utils/produto";

/**
 * Detalhamento determinístico das vendas de demonstração.
 *
 * O MARIELA PDV é quem cria as vendas; aqui apenas reconstruímos um
 * detalhamento estável (itens, pagamentos, parcelas e histórico) a partir do
 * resumo já gerado pelos seeds, para que o Backoffice possa exercitar a
 * consulta, a baixa de parcela e o fluxo de cancelamento/devolução.
 *
 * Nada é aleatório: o mesmo `id` de venda produz sempre o mesmo detalhamento.
 */

/** Campos financeiros neutros usados pelos seeds antes do detalhamento. */
export function financeiroInicial(
  valorFinal: number,
  formaPagamento: string,
): Pick<
  VendaResumo,
  | "caixaId"
  | "caixaCodigo"
  | "valorBruto"
  | "descontoPromocional"
  | "descontoVenda"
  | "descontoTotal"
  | "valorPago"
  | "valorPendente"
  | "valorDevolvido"
  | "temPromocao"
  | "temDesconto"
  | "totalParcelas"
  | "parcelasPagas"
> {
  const parcelado = formaPagamento === "Crediário" || formaPagamento === "Cartão de Crédito";
  return {
    caixaId: null,
    caixaCodigo: null,
    valorBruto: valorFinal,
    descontoPromocional: 0,
    descontoVenda: 0,
    descontoTotal: 0,
    valorPago: valorFinal,
    valorPendente: 0,
    valorDevolvido: 0,
    temPromocao: false,
    temDesconto: false,
    totalParcelas: parcelado ? 3 : 1,
    parcelasPagas: parcelado ? 3 : 1,
  };
}

function semente(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

function somarDias(iso: string, dias: number): string {
  const data = new Date(iso);
  data.setDate(data.getDate() + dias);
  return data.toISOString();
}

const CAIXAS = ["CAIXA-0001", "CAIXA-0002", "CAIXA-0003"];

function montarItens(venda: VendaResumo, catalogo: Produto[], raiz: number): ItemVenda[] {
  const itens: ItemVenda[] = [];
  for (let indice = 0; indice < Math.max(1, venda.totalItens); indice += 1) {
    const produto = catalogo[(raiz + indice * 7) % catalogo.length]!;
    const variante = produto.variantes.length
      ? produto.variantes[(raiz + indice) % produto.variantes.length]
      : undefined;
    const tamanho = variante?.tamanhos.length
      ? variante.tamanhos[(raiz + indice) % variante.tamanhos.length]
      : undefined;
    const quantidade = 1 + ((raiz >> (indice + 1)) % 2);
    const precoOriginal = produto.precoVenda;
    const precoPraticado = precoFinal(produto);

    itens.push({
      id: `${venda.id}_item_${indice + 1}`,
      produtoId: produto.id,
      codProduto: produto.codProduto,
      nome: produto.nome,
      categoria: produto.categoria,
      varianteId: variante?.id ?? null,
      codVariante: variante?.codVariante ?? null,
      cor: variante?.cor ?? null,
      tamanho: tamanho?.tamanho ?? null,
      foto: variante?.foto ?? null,
      quantidade,
      precoOriginal,
      precoPraticado,
      emPromocao: precoPraticado < precoOriginal,
      subtotal: arredondar(precoPraticado * quantidade),
      quantidadeDevolvida: 0,
    });
  }
  return itens;
}

/** Reconstrói o detalhamento e SINCRONIZA os números do resumo. */
export function detalharVenda(venda: VendaResumo, catalogo: Produto[]): VendaDetalhe {
  const raiz = semente(venda.id);
  const itens = montarItens(venda, catalogo, raiz);

  const valorBruto = arredondar(
    itens.reduce((total, item) => total + item.precoOriginal * item.quantidade, 0),
  );
  const descontoPromocional = arredondar(
    itens.reduce(
      (total, item) => total + (item.precoOriginal - item.precoPraticado) * item.quantidade,
      0,
    ),
  );
  const subtotal = arredondar(valorBruto - descontoPromocional);
  // Uma parte das vendas recebe desconto do operador (5% do subtotal).
  const descontoVenda = raiz % 4 === 0 ? arredondar(subtotal * 0.05) : 0;
  const valorFinal = arredondar(subtotal - descontoVenda);

  const parcelado = venda.formaPagamento === "Crediário" || venda.formaPagamento === "Cartão de Crédito";
  const totalParcelas = parcelado ? 2 + (raiz % 3) : 1;

  const pagamentos: PagamentoVenda[] = [];
  const parcelas: ParcelaVenda[] = [];
  const historico: EventoVenda[] = [
    {
      id: `${venda.id}_ev_1`,
      dataHora: venda.dataVenda,
      tipo: "criacao",
      descricao: `Venda registrada no PDV com ${itens.length} item(ns) · estoque baixado`,
      autor: venda.vendedorNome,
    },
  ];

  const valorParcela = arredondar(valorFinal / totalParcelas);
  for (let numero = 1; numero <= totalParcelas; numero += 1) {
    const valor =
      numero === totalParcelas
        ? arredondar(valorFinal - valorParcela * (totalParcelas - 1))
        : valorParcela;
    parcelas.push({
      id: `${venda.id}_parc_${numero}`,
      numero,
      total: totalParcelas,
      valor,
      vencimento: somarDias(venda.dataVenda, (numero - 1) * 30),
      pagoEm: null,
      formaPagamento: null,
    });
  }

  // Quantas parcelas já foram baixadas: concluída paga tudo; em pagamento paga a 1ª.
  const pagas =
    venda.status === "concluida" ? totalParcelas : venda.status === "cancelada" ? totalParcelas : 1;

  parcelas.slice(0, pagas).forEach((parcela) => {
    parcela.pagoEm = parcela.numero === 1 ? venda.dataVenda : parcela.vencimento;
    parcela.formaPagamento = venda.formaPagamento;
    pagamentos.push({
      id: `${venda.id}_pag_${parcela.numero}`,
      forma: venda.formaPagamento,
      valor: parcela.valor,
      dataPagamento: parcela.pagoEm,
      parcelas: totalParcelas,
      ...(totalParcelas > 1 ? { observacao: `Parcela ${parcela.numero}/${totalParcelas}` } : {}),
    });
    historico.push({
      id: `${venda.id}_ev_pag_${parcela.numero}`,
      dataHora: parcela.pagoEm,
      tipo: totalParcelas > 1 ? "baixa_parcela" : "pagamento",
      descricao:
        totalParcelas > 1
          ? `Baixa da parcela ${parcela.numero}/${totalParcelas} em ${venda.formaPagamento}`
          : `Pagamento recebido em ${venda.formaPagamento}`,
      autor: venda.vendedorNome,
    });
  });

  const valorPago = arredondar(pagamentos.reduce((total, item) => total + item.valor, 0));
  const valorPendente = arredondar(Math.max(0, valorFinal - valorPago));
  const status = venda.status === "cancelada" ? "cancelada" : valorPendente > 0 ? "em_pagamento" : "concluida";

  const cancelamento =
    venda.status === "cancelada"
      ? {
          tipo: "integral" as const,
          motivo: "Cliente desistiu da compra.",
          dataHora: somarDias(venda.dataVenda, 1),
          autor: venda.vendedorNome,
          valorDevolvido: valorFinal,
          itens: itens.map((item) => ({
            itemId: item.id,
            codProduto: item.codProduto,
            nome: item.nome,
            quantidade: item.quantidade,
            valor: item.subtotal,
          })),
        }
      : null;

  if (cancelamento) {
    itens.forEach((item) => {
      item.quantidadeDevolvida = item.quantidade;
    });
    historico.push({
      id: `${venda.id}_ev_cancel`,
      dataHora: cancelamento.dataHora,
      tipo: "cancelamento",
      descricao: "Venda cancelada integralmente · itens devolvidos ao estoque",
      autor: cancelamento.autor,
    });
  }

  const caixaCodigo = CAIXAS[raiz % CAIXAS.length]!;

  // Sincroniza o resumo com o detalhamento (a API devolveria ambos coerentes).
  venda.valorBruto = valorBruto;
  venda.descontoPromocional = descontoPromocional;
  venda.descontoVenda = descontoVenda;
  venda.descontoTotal = arredondar(descontoPromocional + descontoVenda);
  venda.valorFinal = valorFinal;
  venda.valorPago = valorPago;
  venda.valorPendente = valorPendente;
  venda.valorDevolvido = cancelamento?.valorDevolvido ?? 0;
  venda.temPromocao = descontoPromocional > 0;
  venda.temDesconto = descontoVenda > 0;
  venda.totalParcelas = totalParcelas;
  venda.parcelasPagas = parcelas.filter((parcela) => parcela.pagoEm).length;
  venda.status = status;
  venda.caixaId = `cx_${caixaCodigo.toLowerCase()}`;
  venda.caixaCodigo = caixaCodigo;

  return {
    ...venda,
    observacao: raiz % 6 === 0 ? "Cliente pediu embalagem para presente." : "",
    itens,
    pagamentos,
    parcelas,
    historico: historico.sort((a, b) => a.dataHora.localeCompare(b.dataHora)),
    cancelamento,
  };
}

/** Detalha todas as vendas do seed, mantendo resumo e detalhe sincronizados. */
export function seedVendasDetalhes(vendas: VendaResumo[], produtos: Produto[]): VendaDetalhe[] {
  const catalogo = produtos.filter((produto) => produto.precoVenda > 0);
  if (!catalogo.length) return [];
  return vendas.map((venda) => detalharVenda(venda, catalogo));
}
