import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useAdicionarItemLista, useRemoverItemLista } from "@/hooks/use-configuracoes";
import { mensagemDeErro } from "@/services/api/client";
import type { ListaConfiguravel as NomeLista } from "@/types/configuracoes";

export function ListaConfiguravel({
  lista,
  titulo,
  descricao,
  itens,
  placeholder,
}: {
  lista: NomeLista;
  titulo: string;
  descricao: string;
  itens: string[];
  placeholder: string;
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [remover, setRemover] = useState<string | null>(null);
  const adicionar = useAdicionarItemLista();
  const removerItem = useRemoverItemLista();

  async function onAdicionar() {
    const limpo = valor.trim();
    if (!limpo) {
      setErro("Informe um valor.");
      return;
    }
    setErro(null);
    try {
      await adicionar.mutateAsync({ lista, valor: limpo });
      setValor("");
      toast.success("Item adicionado com sucesso.");
    } catch (error) {
      setErro(mensagemDeErro(error, "Não foi possível adicionar o item."));
      toast.error(mensagemDeErro(error, "Não foi possível adicionar o item."));
    }
  }

  async function onRemover() {
    if (!remover) return;
    try {
      await removerItem.mutateAsync({ lista, valor: remover });
      toast.success("Item removido com sucesso.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível remover o item."));
    } finally {
      setRemover(null);
    }
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">{titulo}</CardTitle>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              aria-label={`Adicionar em ${titulo}`}
              placeholder={placeholder}
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void onAdicionar();
                }
              }}
              aria-invalid={Boolean(erro)}
            />
            {erro ? <p className="mt-1 text-xs text-destructive">{erro}</p> : null}
          </div>
          <Button onClick={() => void onAdicionar()} disabled={adicionar.isPending}>
            <Plus aria-hidden className="size-4" /> Adicionar
          </Button>
        </div>

        {itens.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum item cadastrado.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {itens.map((item) => (
              <li
                key={item}
                className="flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-sm"
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remover ${item}`}
                  className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setRemover(item)}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={remover !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setRemover(null);
        }}
        titulo="Remover item"
        descricao={`Tem certeza que deseja remover "${remover ?? ""}" de ${titulo.toLowerCase()}?`}
        confirmarLabel="Remover"
        onConfirm={() => void onRemover()}
      />
    </Card>
  );
}
