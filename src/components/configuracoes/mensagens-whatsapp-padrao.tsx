import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { useExcluirMensagemPadrao, useSalvarMensagemPadrao } from "@/hooks/use-configuracoes";
import { mensagemDeErro } from "@/services/api/client";
import { ApiError } from "@/types/api";
import {
  LIMITES_MENSAGEM_PADRAO_WHATSAPP as LIMITES,
  type MensagemPadraoWhatsapp,
} from "@/types/configuracoes";

/**
 * Fase 22.8.9.10.7.3 — mensagens padrão de WhatsApp nas Configurações. São textos de APOIO que o operador escolhe e
 * edita no dialog de envio; salvar aqui não envia nada a ninguém.
 */
export function MensagensWhatsappPadrao({ mensagens }: { mensagens: MensagemPadraoWhatsapp[] }) {
  const [editando, setEditando] = useState<MensagemPadraoWhatsapp | "nova" | null>(null);
  const [excluir, setExcluir] = useState<MensagemPadraoWhatsapp | null>(null);
  const excluirMensagem = useExcluirMensagemPadrao();
  const noLimite = mensagens.length >= LIMITES.quantidade;

  async function confirmarExclusao() {
    if (!excluir) return;
    try {
      await excluirMensagem.mutateAsync(excluir.id);
      toast.success("Mensagem padrão excluída.");
    } catch (erro) {
      toast.error(mensagemDeErro(erro, "Não foi possível excluir a mensagem."));
      throw erro;
    }
  }

  return (
    <Card className="border-border shadow-card">
      <CardHeader className="gap-1.5 border-b border-border/70 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-display text-xl leading-none">Mensagens de WhatsApp</CardTitle>
          <Badge variant="outline">
            {mensagens.length} {mensagens.length === 1 ? "mensagem" : "mensagens"}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Textos prontos que você escolhe e ajusta na hora de falar com um cliente. Salvar uma
          mensagem aqui não envia nada.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {noLimite
              ? `Limite de ${LIMITES.quantidade} mensagens atingido. Exclua uma para criar outra.`
              : `Até ${LIMITES.quantidade} mensagens.`}
          </p>
          <Button type="button" onClick={() => setEditando("nova")} disabled={noLimite}>
            <Plus aria-hidden className="size-4" />
            Nova mensagem
          </Button>
        </div>

        {mensagens.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface/50 px-4 py-10 text-center">
            <p className="text-sm font-medium">Nenhuma mensagem padrão cadastrada</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Crie mensagens para agilizar o atendimento pelo WhatsApp.
            </p>
          </div>
        ) : (
          <ul
            className="divide-y divide-border rounded-lg border border-border"
            aria-label="Mensagens padrão de WhatsApp"
          >
            {mensagens.map((m) => (
              <li
                key={m.id}
                data-mensagem-padrao={m.titulo}
                className="flex items-start justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <MessageSquareText aria-hidden className="size-4 shrink-0 text-primary" />
                    {m.titulo}
                  </p>
                  <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {m.conteudo}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${m.titulo}`}
                    onClick={() => setEditando(m)}
                  >
                    <Pencil aria-hidden className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${m.titulo}`}
                    onClick={() => setExcluir(m)}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <EditorMensagemPadrao alvo={editando} onFechar={() => setEditando(null)} />

      <ConfirmDialog
        open={excluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setExcluir(null);
        }}
        titulo="Excluir mensagem padrão"
        descricao={`Excluir a mensagem "${excluir?.titulo ?? ""}"? Ela deixa de aparecer no envio de WhatsApp. Mensagens já enviadas não são afetadas.`}
        confirmarLabel="Excluir"
        onConfirm={() => confirmarExclusao()}
      />
    </Card>
  );
}

/** Criação (`alvo === "nova"`) ou edição de uma mensagem padrão, com prévia do texto como será exibido. */
function EditorMensagemPadrao({
  alvo,
  onFechar,
}: {
  alvo: MensagemPadraoWhatsapp | "nova" | null;
  onFechar: () => void;
}) {
  const aberto = alvo !== null;
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [erros, setErros] = useState<{ titulo?: string; conteudo?: string; geral?: string }>({});
  const [alvoCarregado, setAlvoCarregado] = useState<typeof alvo>(null);
  const salvar = useSalvarMensagemPadrao();
  // Guarda síncrona contra duplo clique (o `isPending` só muda no próximo render).
  const salvandoRef = useRef(false);

  if (alvo !== alvoCarregado) {
    setAlvoCarregado(alvo);
    setTitulo(alvo && alvo !== "nova" ? alvo.titulo : "");
    setConteudo(alvo && alvo !== "nova" ? alvo.conteudo : "");
    setErros({});
  }

  function validar(): boolean {
    const proximos: typeof erros = {};
    if (!titulo.trim()) proximos.titulo = "Informe um título.";
    else if (titulo.trim().length > LIMITES.titulo)
      proximos.titulo = `Use no máximo ${LIMITES.titulo} caracteres.`;
    if (!conteudo.trim()) proximos.conteudo = "Informe o texto da mensagem.";
    else if (conteudo.trim().length > LIMITES.conteudo)
      proximos.conteudo = `Use no máximo ${LIMITES.conteudo} caracteres.`;
    setErros(proximos);
    return Object.keys(proximos).length === 0;
  }

  async function onSalvar() {
    if (salvandoRef.current || !validar()) return;
    salvandoRef.current = true;
    try {
      await salvar.mutateAsync({
        id: alvo && alvo !== "nova" ? alvo.id : null,
        payload: { titulo: titulo.trim(), conteudo: conteudo.trim() },
      });
      toast.success(alvo === "nova" ? "Mensagem padrão criada." : "Mensagem padrão atualizada.");
      onFechar();
    } catch (erro) {
      const porCampo: typeof erros = {};
      if (erro instanceof ApiError) {
        for (const e of erro.errors ?? []) {
          if (e.field === "titulo" || e.field === "conteudo") porCampo[e.field] = e.message;
        }
      }
      porCampo.geral = mensagemDeErro(erro, "Não foi possível salvar a mensagem.");
      setErros(porCampo);
    } finally {
      salvandoRef.current = false;
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximo) => {
        if (!proximo && !salvandoRef.current) onFechar();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {alvo === "nova" ? "Nova mensagem padrão" : "Editar mensagem padrão"}
          </DialogTitle>
          <DialogDescription>
            O texto fica salvo nas configurações. Ele só é usado quando alguém o escolhe no envio de
            WhatsApp — e pode ser ajustado antes de cada envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field id="mensagem-padrao-titulo" label="Título" erro={erros.titulo}>
            <Input
              id="mensagem-padrao-titulo"
              value={titulo}
              maxLength={LIMITES.titulo}
              placeholder="Ex.: Pedido pronto para retirada"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </Field>
          <Field id="mensagem-padrao-conteudo" label="Mensagem" erro={erros.conteudo}>
            <Textarea
              id="mensagem-padrao-conteudo"
              value={conteudo}
              rows={6}
              maxLength={LIMITES.conteudo}
              onChange={(e) => setConteudo(e.target.value)}
            />
          </Field>
          <p className="text-right text-xs text-muted-foreground">
            {conteudo.trim().length}/{LIMITES.conteudo}
          </p>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Prévia
            </p>
            <p
              data-testid="previa-mensagem-padrao"
              className="min-h-12 whitespace-pre-wrap rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm text-foreground"
            >
              {conteudo.trim() || "A prévia aparece aqui."}
            </p>
          </div>
          {erros.geral ? <p className="text-sm text-destructive">{erros.geral}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvar.isPending} onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvar.isPending} onClick={() => void onSalvar()}>
            {salvar.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Salvar mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
