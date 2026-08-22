import { ArrowDownRight, ArrowUpRight, Image as ImageIcon, Pencil, Plus, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Produto } from "@/types/produto";
import type { Variante } from "@/types/variante";

export function VarianteCard({
  produto,
  variante,
  onEditar,
  onAdicionarTamanho,
  onEntrada,
  onSaida,
  onExcluir,
}: {
  produto: Produto;
  variante: Variante;
  onEditar: (variante: Variante) => void;
  onAdicionarTamanho: (variante: Variante) => void;
  onEntrada: (variante: Variante) => void;
  onSaida: (variante: Variante) => void;
  onExcluir: (variante: Variante) => void;
}) {
  const semTamanhos = variante.tamanhos.length === 0;

  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-col gap-5 py-5 lg:flex-row">
        <div className="flex gap-4">
          {variante.foto ? (
            <img
              src={variante.foto}
              alt={`${produto.nome} — ${variante.cor}`}
              className="size-24 rounded-md object-cover"
              loading="lazy"
            />
          ) : (
            <span
              aria-label="Sem foto"
              className="flex size-24 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <ImageIcon aria-hidden className="size-6" />
            </span>
          )}
          <div className="min-w-40">
            <p className="font-display text-xl leading-tight">{variante.cor}</p>
            <p className="font-mono text-xs text-muted-foreground">{variante.codVariante}</p>
            <p className="mt-2 text-sm">
              <span className="tabular-nums font-medium">{variante.quantidadeVariante}</span> peças na
              variante
            </p>
            {variante.video ? (
              <a
                href={variante.video}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Video aria-hidden className="size-3" /> Ver vídeo
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex-1">
          <p className="text-eyebrow mb-2">Tamanhos</p>
          {semTamanhos ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Nenhum tamanho cadastrado nesta variante.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {variante.tamanhos.map((tamanho) => (
                <Badge
                  key={tamanho.id}
                  variant="outline"
                  className={
                    tamanho.quantidade === 0
                      ? "border-destructive/30 bg-destructive/5 text-destructive"
                      : "border-border bg-secondary"
                  }
                >
                  {tamanho.tamanho} · {tamanho.quantidade}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onEditar(variante)}>
              <Pencil aria-hidden className="size-3.5" /> Editar variante
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAdicionarTamanho(variante)}>
              <Plus aria-hidden className="size-3.5" /> Adicionar tamanho
            </Button>
            <Button variant="outline" size="sm" disabled={semTamanhos} onClick={() => onEntrada(variante)}>
              <ArrowUpRight aria-hidden className="size-3.5" /> Entrada
            </Button>
            <Button variant="outline" size="sm" disabled={semTamanhos} onClick={() => onSaida(variante)}>
              <ArrowDownRight aria-hidden className="size-3.5" /> Saída
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onExcluir(variante)}
            >
              <Trash2 aria-hidden className="size-3.5" /> Excluir
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
