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
import {
  caixaAberto,
  registrarDevolucao,
  registrarRecebimentoParcela,
  registrarRecebimentoPosterior,
} from "./caixas.lancamentos";
import { ApiError } from "@/types/api";
import {
  MODALIDADES_PAGAMENTO,
  type BaixaParcelaPayload,
  type CancelamentoPayload,
  type ItemDevolvido,
  type ModalidadePagamento,
  type RegistrarRecebimentoPayload,
  type VendaDetalhe,
  type VendaResumo,
  type VendasEstatisticas,
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

    const payload = (body ?? {}) as Partial<BaixaParcelaPayload>;
    const idempotencyKey = payload.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existente = venda.pagamentos.find((item) => item.idempotencyKey === idempotencyKey);
      if (existente) {
        if (arredondar(existente.valor) !== arredondar(parcela.valor))
          throw ApiError.conflict(
            "Esta idempotencyKey já foi usada para baixar outra parcela desta venda. Gere uma nova chave para esta operação.",
          );
        return { data: clonar(venda) };
      }
    }

    if (parcela.pagoEm) throw ApiError.validation("Esta parcela já está baixada.");

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
      ...(idempotencyKey ? { idempotencyKey } : {}),
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

    // O valor recebido entra no caixa aberto (regra financeira do módulo Caixa).
    registrarRecebimentoParcela(venda, parcela, forma);

    sincronizarResumo(venda);
    return { data: clonar(venda) };
  });

  /**
   * Recebimento posterior (Etapa 18.29) — valor livre contra o saldo
   * pendente, independente de parcela formal. Espelha
   * `VendasService.receberPagamento` do mariela-backend, incluindo a
   * deduplicação por `idempotencyKey`.
   */
  registerMock("POST", "/vendas/:id/recebimentos", ({ params, body }) => {
    const venda = encontrar(params["id"]!);
    if (venda.status === "cancelada")
      throw ApiError.validation("Venda cancelada não aceita novos recebimentos.");

    if (!caixaAberto())
      throw ApiError.validation("Nenhum caixa aberto. Abra o caixa antes de registrar o recebimento.");

    const payload = (body ?? {}) as Partial<RegistrarRecebimentoPayload>;
    const forma = (payload.forma ?? "").trim();
    const valor = Number(payload.valor);

    if (!forma)
      throw ApiError.validation("Dados inválidos.", [
        { field: "forma", message: "Informe a forma de pagamento." },
      ]);
    if (!Number.isFinite(valor) || valor <= 0)
      throw ApiError.validation("Dados inválidos.", [
        { field: "valor", message: "Informe um valor maior que zero." },
      ]);

    if (venda.valorPendente <= 0)
      throw ApiError.validation("Esta venda já está quitada; nenhum recebimento é necessário.");

    if (arredondar(valor) > venda.valorPendente)
      throw ApiError.validation("Dados inválidos.", [
        {
          field: "valor",
          message: `Recebimento maior que o saldo pendente (${venda.valorPendente.toFixed(2)}).`,
        },
      ]);

    const idempotencyKey = payload.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existente = venda.pagamentos.find((item) => item.idempotencyKey === idempotencyKey);
      if (existente) {
        if (arredondar(existente.valor) !== arredondar(valor))
          throw ApiError.conflict(
            "Esta idempotencyKey já foi usada para um recebimento com valor diferente. Gere uma nova chave para esta operação.",
          );
        return { data: clonar(venda) };
      }
    }

    const modalidade = payload.modalidade;
    if (modalidade !== undefined && !MODALIDADES_PAGAMENTO.includes(modalidade))
      throw ApiError.validation("Modalidade de pagamento inválida.");

    if (modalidade === "dinheiro" || modalidade === "pix") {
      if (payload.adquirenteId)
        throw ApiError.validation(
          "Adquirente não deve ser informado para pagamento em dinheiro/PIX.",
        );
    } else if (modalidade === "debito" || modalidade === "credito") {
      if (!payload.adquirenteId)
        throw ApiError.validation("Adquirente é obrigatório para pagamento no crédito/débito.");
      if (modalidade === "debito" && payload.parcelas !== undefined && payload.parcelas !== 1)
        throw ApiError.validation("Pagamento no débito deve ser em 1 parcela.");
      if (modalidade === "credito") {
        if (payload.parcelas === undefined)
          throw ApiError.validation("Parcelamento no crédito deve ser informado.");
        if (!Number.isInteger(payload.parcelas) || payload.parcelas < 1 || payload.parcelas > 24)
          throw ApiError.validation("Parcelamento no crédito deve estar entre 1 e 24 parcelas.");
      }
    }

    const dataHora = agora();
    const observacao = payload.observacao?.trim() || undefined;
    venda.pagamentos.push({
      id: gerarId("pag"),
      forma,
      valor: arredondar(valor),
      dataPagamento: dataHora,
      parcelas: payload.parcelas ?? 1,
      ...(observacao ? { observacao } : {}),
      ...(modalidade ? { modalidade: modalidade as ModalidadePagamento } : {}),
      ...(payload.adquirenteId ? { adquirenteId: payload.adquirenteId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    venda.valorPago = arredondar(
      venda.pagamentos.reduce((total, pagamento) => total + pagamento.valor, 0),
    );
    venda.valorPendente = arredondar(Math.max(0, venda.valorFinal - venda.valorPago));
    if (venda.valorPendente === 0) venda.status = "concluida";
    venda.historico.push({
      id: gerarId("ev"),
      dataHora,
      tipo: "pagamento",
      descricao: `Recebimento posterior de ${arredondar(valor).toFixed(2)} em ${forma}`,
      autor: "Backoffice",
    });

    registrarRecebimentoPosterior(venda, arredondar(valor), forma, dataHora);

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
    const payload = (body ?? {}) as Partial<CancelamentoPayload>;

    // Checagem de idempotência ANTES do status: um cancelamento PARCIAL bem
    // sucedido não muda o status da venda, então o retry precisa ser
    // reconhecido mesmo com a venda continuando ativa.
    const idempotencyKey = payload.idempotencyKey?.trim() || undefined;
    const tipoSolicitado = payload.tipo === "parcial" ? "parcial" : "integral";
    if (idempotencyKey && venda.cancelamento?.idempotencyKey === idempotencyKey) {
      const itensSolicitados = (payload.itens ?? [])
        .map((item) => item.itemId)
        .sort()
        .join(",");
      const itensRegistrados = venda.cancelamento.itens
        .map((item) => item.itemId)
        .sort()
        .join(",");
      const mesmaOperacao =
        venda.cancelamento.tipo === tipoSolicitado &&
        (tipoSolicitado === "integral" || itensSolicitados === itensRegistrados);
      if (!mesmaOperacao)
        throw ApiError.conflict(
          "Esta idempotencyKey já foi usada para um cancelamento diferente. Gere uma nova chave para esta operação.",
        );
      return { data: clonar(venda) };
    }

    if (venda.status === "cancelada") throw ApiError.validation("Esta venda já está cancelada.");

    const motivo = (payload.motivo ?? "").trim();
    if (!motivo)
      throw ApiError.validation("Dados inválidos.", [
        { field: "motivo", message: "Informe o motivo do cancelamento." },
      ]);

    const tipo = tipoSolicitado;
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
      ...(idempotencyKey ? { idempotencyKey } : {}),
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

    // Valor devolvido sai do caixa aberto, limitado ao que foi recebido.
    registrarDevolucao(venda, tipo, valorDevolvido, motivo);

    sincronizarResumo(venda);
    return { data: clonar(venda) };
  });
}
