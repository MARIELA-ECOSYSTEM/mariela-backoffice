import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { VarianteCard } from "./variante-card";
import { VarianteDialog } from "./variante-dialog";
import { TamanhoDialog } from "./tamanho-dialog";
import {
  MovimentacaoDialog,
  type TipoMovimentacao,
} from "@/components/estoque/movimentacao-dialog";
import { useExcluirVariante } from "@/hooks/use-variantes";
import { mensagemDeErro } from "@/services/api/client";
import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";

export function GerenciarVariantes({ produto }: { produto: Produto }) {
  const [varianteDialog, setVarianteDialog] = useState<{
    open: boolean;
    variante: Variante | null;
  }>({
    open: false,
    variante: null,
  });
  const [tamanhoVariante, setTamanhoVariante] = useState<Variante | null>(null);
  const [movimentacao, setMovimentacao] = useState<{
    tipo: TipoMovimentacao;
    variante: Variante;
  } | null>(null);
  const [varianteExclusao, setVarianteExclusao] = useState<Variante | null>(null);
  const excluir = useExcluirVariante(produto.id);

  async function confirmarExclusao() {
    if (!varianteExclusao) return;
    try {
      await excluir.mutateAsync(varianteExclusao.id);
      toast.success("Variante excluída com sucesso.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível excluir a variante."));
      throw error;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">Variantes</h2>
          <p className="text-sm text-muted-foreground">
            Cada variante representa uma cor. Não é permitido repetir a mesma cor no produto.
          </p>
        </div>
        <Button onClick={() => setVarianteDialog({ open: true, variante: null })}>
          <Plus aria-hidden className="size-4" /> Adicionar variante
        </Button>
      </div>

      {produto.variantes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma variante cadastrada"
          descricao="Este produto ainda não possui cores cadastradas, portanto não possui estoque."
          acao={
            <Button onClick={() => setVarianteDialog({ open: true, variante: null })}>
              Adicionar variante
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {produto.variantes.map((variante) => (
            <VarianteCard
              key={variante.id}
              produto={produto}
              variante={variante}
              onEditar={(item) => setVarianteDialog({ open: true, variante: item })}
              onAdicionarTamanho={setTamanhoVariante}
              onEntrada={(item) => setMovimentacao({ tipo: "entrada", variante: item })}
              onSaida={(item) => setMovimentacao({ tipo: "saida", variante: item })}
              onExcluir={setVarianteExclusao}
            />
          ))}
        </div>
      )}

      <VarianteDialog
        produtoId={produto.id}
        codProduto={produto.codProduto}
        variante={varianteDialog.variante}
        open={varianteDialog.open}
        onOpenChange={(aberto) =>
          setVarianteDialog({ open: aberto, variante: aberto ? varianteDialog.variante : null })
        }
      />

      <TamanhoDialog
        produtoId={produto.id}
        variante={tamanhoVariante}
        open={tamanhoVariante !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setTamanhoVariante(null);
        }}
      />

      {movimentacao ? (
        <MovimentacaoDialog
          tipo={movimentacao.tipo}
          produto={produto}
          variante={movimentacao.variante}
          open
          onOpenChange={(aberto) => {
            if (!aberto) setMovimentacao(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={varianteExclusao !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setVarianteExclusao(null);
        }}
        titulo="Excluir variante"
        descricao={`Tem certeza que deseja excluir a variante ${varianteExclusao?.cor ?? ""}? Os tamanhos e o estoque dela serão removidos.`}
        confirmarLabel="Excluir"
        onConfirm={() => confirmarExclusao()}
      />
    </div>
  );
}
