import { registerMock } from "./mock-transport";
import {
  agora,
  clonar,
  db,
  gerarId,
  recalcularProduto,
  sincronizarAgregadosClientes,
  sincronizarAgregadosVendedores,
} from "./db";
import { ApiError } from "@/types/api";
import type {
  CancelamentoPayload,
  ItemDevolvido,
  VendaDetalhe,
  VendaResumo,
  VendasEstatisticas,
} from "@/types/venda";

function arredondar(valor: number): number {
  return Number(valor.toFixed(2));
}

function encontrar(id: string): VendaDetalhe {
  const venda = db.vendasDetalhes.find((item) => item.id === id);
  if (!venda) throw ApiError.notFound("Venda não encontrada.");
  return venda;
}

function resumoDe(id: string): VendaResumo | undefined {
  return db.vendas.find((item) => item.id === id);
}

/** Reprojeta os campos do resumo a partir do detalhamento (papel do NestJS). */
function sincronizarResumo(venda: VendaDetalhe): void {
  const resumo = resumoDe(venda.id);
  if (!resumo) return;
  Object.assign(resumo, {
    status: venda.status,
    valorPago: venda.valorPago,
    valorPendente: venda.valorPendente,
    valorDevolvido: venda.valorDevolvido,
    parcelasPagas: venda.parcelas.filter((parcela) => parcela.pagoEm).length,
    totalItens: venda.totalItens,
  });
  sincronizarAgregadosClientes();
  sincronizarAgregadosVendedores();
}

/** Devolução física ao estoque: o item volta para o tamanho de origem. */
function devolverAoEstoque(produtoId: string, varianteId: string | null, tamanho: string | null, quantidade: number): void {
  const produto = db.produtos.find((item) => item.id === produtoId);
  if (!produto || quantidade <= 0) return;
  const variante =
    produto.variantes.find((item) => item.id === varianteId) ?? produto.variantes[0];
  if (!variante) return;
  const alvo = variante.tamanhos.find((item) => item.tamanho === tamanho) ?? variante.tamanhos[0];
  if (!alvo) return;
  alvo.quantidade += quantidade;
  recalcularProduto(produto);
}

function estatisticas(vendas: VendaResumo[]): VendasEstatisticas {
  const faturaveis = vendas.filter((venda) => venda.status !== "cancelada");
  const canceladas = vendas.filter((venda) => venda.status === "cancelada");
  const emPagamento = vendas.filter((venda) => venda.status === "em_pagamento");
  const faturamento = arredondar(
    faturaveis.reduce((total, venda) => total + venda.valorFinal - venda.valorDevolvido, 0),
  );
  return {
    totalVendas: vendas.length,
    faturamento,
    ticketMedio: faturaveis.length ? arredondar(faturamento / faturaveis.length) : 0,
    itensVendidos: faturaveis.reduce((total, venda) => total + venda.totalItens, 0),
    vendasEmPagamento: emPagamento.length,
    valorEmAberto: arredondar(emPagamento.reduce((total, venda) => total + venda.valorPendente, 0)),
    vendasCanceladas: canceladas.length,
    valorCancelado: arredondar(canceladas.reduce((total, venda) => total + venda.valorFinal, 0)),
    descontoConcedido: arredondar(
      faturaveis.reduce((total, venda) => total + venda.descontoTotal, 0),
    ),
  };
}

export function registerVendasMocks(): void {
  /** Estatísticas precisam ser registradas ANTES de /vendas/:id. */
  registerMock("GET", "/vendas/estatisticas", () => ({ data: estatisticas(db.vendas) }));

  registerMock("GET", "/vendas", () => ({
    data: clonar(db.vendas),
    meta: { total: db.vendas.length },
  }));

  registerMock("GET", "/vendas/:id", ({ params }) => ({ data: clonar(encontrar(params["id"]!)) }));

  /** Baixa de parcela: quando o pendente chega a zero, a venda vira CONCLUIDA. */
  registerMock("POST", "/vendas/:id/parcelas/:parcelaId/baixa", ({ params, body }) => {
    const venda = encontrar(params["id"]!);
    if (venda.status === "cancelada")
      throw ApiError.validation("Venda cancelada não aceita novas baixas.");

    const parcela = venda.parcelas.find((item) => item.id === params["parcelaId"]);
    if (!parcela) throw ApiError.notFound("Parcela não encontrada.");
    if (parcela.pagoEm) throw ApiError.validation("Esta parcela já está baixada.");

    const payload = (body ?? {}) as { formaPagamento?: string };
    const forma = (payload.formaPagamento ?? venda.formaPagamento).trim() || venda.formaPagamento;

    parcela.pagoEm = agora();
    parcela.formaPagamento = forma;
    venda.pagamentos.push({
      id: gerarId("pag"),
      forma,
      valor: parcela.valor,
      dataPagamento: parcela.pagoEm,
      parcelas: parcela.total,
      observacao: `Parcela ${parcela.numero}/${parcela.total} (baixa no backoffice)`,
    });
    venda.valorPago = arredondar(
      venda.pagamentos.reduce((total, pagamento) => total + pagamento.valor, 0),
    );
    venda.valorPendente = arredondar(Math.max(0, venda.valorFinal - venda.valorPago));
    venda.parcelasPagas = venda.parcelas.filter((item) => item.pagoEm).length;
    if (venda.valorPendente === 0) venda.status = "concluida";
    venda.historico.push({
      id: gerarId("ev"),
      dataHora: parcela.pagoEm,
      tipo: "baixa_parcela",
      descricao: `Baixa da parcela ${parcela.numero}/${parcela.total} em ${forma}`,
      autor: "Backoffice",
    });

    sincronizarResumo(venda);
    return { data: clonar(venda) };
  });

  /**
   * Cancelamento/devolução — único caminho de correção de uma venda finalizada.
   * `integral` cancela a venda inteira; `parcial` devolve apenas os itens
   * informados e mantém a venda ativa.
   */
  registerMock("POST", "/vendas/:id/cancelamento", ({ params, body }) => {
    const venda = encontrar(params["id"]!);
    if (venda.status === "cancelada") throw ApiError.validation("Esta venda já está cancelada.");

    const payload = (body ?? {}) as Partial<CancelamentoPayload>;
    const motivo = (payload.motivo ?? "").trim();
    if (!motivo)
      throw ApiError.validation("Dados inválidos.", [
        { field: "motivo", message: "Informe o motivo do cancelamento." },
      ]);

    const tipo = payload.tipo === "parcial" ? "parcial" : "integral";
    const devolvidos: ItemDevolvido[] = [];

    if (tipo === "integral") {
      venda.itens.forEach((item) => {
        const restante = item.quantidade - item.quantidadeDevolvida;
        if (restante <= 0) return;
        devolverAoEstoque(item.produtoId, item.varianteId, item.tamanho, restante);
        item.quantidadeDevolvida = item.quantidade;
        devolvidos.push({
          itemId: item.id,
          codProduto: item.codProduto,
          nome: item.nome,
          quantidade: restante,
          valor: arredondar(item.precoPraticado * restante),
        });
      });
    } else {
      const solicitados = payload.itens ?? [];
      if (!solicitados.length)
        throw ApiError.validation("Dados inválidos.", [
          { field: "itens", message: "Selecione ao menos um item para devolver." },
        ]);

      solicitados.forEach((solicitado) => {
        const item = venda.itens.find((registro) => registro.id === solicitado.itemId);
        if (!item) throw ApiError.notFound("Item da venda não encontrado.");
        const restante = item.quantidade - item.quantidadeDevolvida;
        const quantidade = Math.min(Math.max(0, Math.floor(solicitado.quantidade)), restante);
        if (quantidade <= 0) return;
        devolverAoEstoque(item.produtoId, item.varianteId, item.tamanho, quantidade);
        item.quantidadeDevolvida += quantidade;
        devolvidos.push({
          itemId: item.id,
          codProduto: item.codProduto,
          nome: item.nome,
          quantidade,
          valor: arredondar(item.precoPraticado * quantidade),
        });
      });

      if (!devolvidos.length)
        throw ApiError.validation("Nenhuma quantidade disponível para devolução.");
    }

    const valorDevolvido = arredondar(devolvidos.reduce((total, item) => total + item.valor, 0));
    const dataHora = agora();

    venda.valorDevolvido = arredondar(venda.valorDevolvido + valorDevolvido);
    venda.cancelamento = {
      tipo,
      motivo,
      dataHora,
      autor: "Backoffice",
      valorDevolvido,
      itens: devolvidos,
    };
    venda.historico.push({
      id: gerarId("ev"),
      dataHora,
      tipo: tipo === "integral" ? "cancelamento" : "devolucao",
      descricao:
        tipo === "integral"
          ? `Venda cancelada integralmente · ${motivo}`
          : `Devolução parcial de ${devolvidos.length} item(ns) · ${motivo}`,
      autor: "Backoffice",
    });

    if (tipo === "integral") {
      venda.status = "cancelada";
      venda.valorPendente = 0;
    } else {
      const todosDevolvidos = venda.itens.every(
        (item) => item.quantidadeDevolvida >= item.quantidade,
      );
      if (todosDevolvidos) {
        venda.status = "cancelada";
        venda.valorPendente = 0;
      }
    }

    sincronizarResumo(venda);
    return { data: clonar(venda) };
  });
}
