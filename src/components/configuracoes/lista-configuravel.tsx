import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  // Guarda síncrona via ref: `adicionar.isPending` só reflete a mutação em
  // andamento após o próximo render, o que não é rápido o suficiente para
  // barrar um duplo clique real (o segundo clique pode disparar antes do
  // botão ser desabilitado). Um ref muda de valor imediatamente.
  const adicionandoRef = useRef(false);

  async function onAdicionar() {
    if (adicionandoRef.current) return;
    const limpo = valor.trim();
    if (!limpo) {
      setErro("Informe um valor.");
      return;
    }
    setErro(null);
    adicionandoRef.current = true;
    try {
      await adicionar.mutateAsync({ lista, valor: limpo });
      setValor("");
      toast.success("Item adicionado com sucesso.");
    } catch (error) {
      setErro(mensagemDeErro(error, "Não foi possível adicionar o item."));
      toast.error(mensagemDeErro(error, "Não foi possível adicionar o item."));
    } finally {
      adicionandoRef.current = false;
    }
  }

  async function onRemover() {
    if (!remover) return;
    try {
      await removerItem.mutateAsync({ lista, valor: remover });
      toast.success("Item removido com sucesso.");
    } catch (error) {
      toast.error(mensagemDeErro(error, "Não foi possível remover o item."));
      throw error;
    }
  }

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="gap-1.5 border-b border-border/70 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-display text-xl leading-none">{titulo}</CardTitle>
          <Badge variant="outline">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{descricao}</p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Input
              aria-label={`Adicionar em ${titulo}`}
              className="h-10"
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
              {...(erro ? { "aria-describedby": `${lista}-erro` } : {})}
            />
            {erro ? (
              <p id={`${lista}-erro`} className="mt-1.5 text-xs text-destructive">
                {erro}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Pressione Enter para adicionar rapidamente.
              </p>
            )}
          </div>
          <Button
            onClick={() => void onAdicionar()}
            disabled={adicionar.isPending}
            className="sm:min-w-32"
          >
            {adicionar.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            Adicionar
          </Button>
        </div>

        {itens.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 px-4 py-10 text-center">
            <p className="text-sm font-medium">Não há itens em {titulo.toLowerCase()}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Os itens adicionados aqui ficam disponíveis nos cadastros do catálogo.
            </p>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {itens.map((item) => (
              <li
                key={item}
                className="group flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1.5 text-sm transition-colors hover:border-primary/35 hover:bg-primary-soft/60"
              >
                <span className="leading-none">{item}</span>
                <button
                  type="button"
                  aria-label={`Remover ${item}`}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => setRemover(item)}
                >
                  <X aria-hidden className="size-3.5" />
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
        onConfirm={() => onRemover()}
      />
    </Card>
  );
}
