import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import type { TipoDestinatarioWhatsapp } from "@/services/api/whatsapp.api";
import { abrirConversaWhatsapp } from "@/services/whatsapp/abrir-conversa";
import { TEMPLATES_WHATSAPP, type TipoMensagemWhatsapp } from "@/services/whatsapp/messages";
import { formatarTelefone } from "@/utils/cliente";
import {
  encontrarMensagemPadraoAniversario,
  montarLinkWhatsapp,
  preencherNome,
} from "@/utils/whatsapp-link";

/**
 * Destinatário genérico: serve para cliente, fornecedor e vendedor. `tipoMensagem` escolhe a sugestão de texto.
 * (`id`/`entidade` identificam o cadastro; o link `wa.me` usa só o telefone.)
 */
export interface AlvoMensagemWhatsapp {
  id: string;
  nome: string;
  telefone: string;
  entidade: TipoDestinatarioWhatsapp;
  tipoMensagem: TipoMensagemWhatsapp;
  /** Rótulo do tipo de destinatário exibido no resumo (ex.: "Fornecedor"). */
  papel?: string;
}

const SUGESTAO = "__sugestao__";
const EM_BRANCO = "__em_branco__";

/**
 * Diálogo de mensagem de WhatsApp (Clientes, Fornecedores e Vendedores).
 *
 * Fase 1 (`wa.me`) — monta o link oficial `https://wa.me/55DDDNUMERO?text=...` com a mensagem ATUAL (escolhida entre a
 * sugestão da loja e as mensagens padrão de Configurações, com `{nome}`/`{{nome}}` trocado pelo primeiro nome, e
 * editada à vontade) e abre a conversa no WhatsApp. NADA é enviado por aqui: a pessoa confere e envia no WhatsApp.
 * Fase 2 — com `tipoMensagem: "aniversario"`, a mensagem inicial é a padrão de aniversário das Configurações, se houver.
 */
export function DialogMensagemWhatsapp({
  alvo,
  onOpenChange,
}: {
  alvo: AlvoMensagemWhatsapp | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const { data: configuracoes } = useConfiguracoes();
  const padroes = useMemo(() => configuracoes?.mensagensWhatsapp ?? [], [configuracoes]);
  const [escolha, setEscolha] = useState(SUGESTAO);
  const [mensagem, setMensagem] = useState("");

  const template = alvo ? TEMPLATES_WHATSAPP[alvo.tipoMensagem] : null;
  const telefone = alvo ? formatarTelefone(alvo.telefone) : "";
  const link = alvo ? montarLinkWhatsapp(alvo.telefone, mensagem) : null;
  // Fase 2 — aniversário: começa pela mensagem padrão de aniversário das Configurações, se houver.
  const padraoAniversario = useMemo(() => encontrarMensagemPadraoAniversario(padroes), [padroes]);

  useEffect(() => {
    if (!alvo) return;
    const padrao = alvo.tipoMensagem === "aniversario" ? padraoAniversario : undefined;
    setEscolha(padrao ? padrao.id : SUGESTAO);
    setMensagem(
      preencherNome(
        padrao ? padrao.conteudo : TEMPLATES_WHATSAPP[alvo.tipoMensagem].corpo,
        alvo.nome,
      ),
    );
  }, [alvo, padraoAniversario]);

  function escolher(valor: string) {
    if (!alvo) return;
    setEscolha(valor);
    if (valor === EM_BRANCO) setMensagem("");
    else if (valor === SUGESTAO) {
      setMensagem(preencherNome(TEMPLATES_WHATSAPP[alvo.tipoMensagem].corpo, alvo.nome));
    } else {
      const padrao = padroes.find((item) => item.id === valor);
      if (padrao) setMensagem(preencherNome(padrao.conteudo, alvo.nome));
    }
  }

  async function abrir() {
    if (!link?.valido) return;
    try {
      await abrirConversaWhatsapp(link.url);
      toast.success("Conversa aberta no WhatsApp. Confira a mensagem e envie por lá.");
      onOpenChange(false);
    } catch {
      toast.error("Não foi possível abrir o WhatsApp.");
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-3xl">
            <MessageCircle aria-hidden className="size-6 text-success" />
            {template?.titulo ?? "Enviar mensagem"}
          </DialogTitle>
          <DialogDescription>
            O WhatsApp abre com a mensagem pronta. Nada é enviado por aqui: você confere e envia no
            próprio WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-primary/15 bg-primary-soft/30 px-3 py-2.5 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                {alvo?.papel ?? "Para"}
              </p>
              <p className="truncate text-sm text-foreground">{alvo?.nome}</p>
            </div>
            <div className="min-w-0">
              <p className="font-brand text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                Telefone
              </p>
              <p className="truncate text-sm text-foreground">
                {telefone || "Sem telefone cadastrado"}
              </p>
            </div>
          </div>

          {link && !link.valido ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              Telefone inválido para o WhatsApp: {link.motivo}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="mensagem-whatsapp-padrao">Mensagem padrão</Label>
            <Select value={escolha} onValueChange={escolher}>
              <SelectTrigger id="mensagem-whatsapp-padrao">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SUGESTAO}>Sugestão da loja</SelectItem>
                {padroes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.titulo}
                  </SelectItem>
                ))}
                <SelectItem value={EM_BRANCO}>Em branco</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mensagem-whatsapp">Mensagem</Label>
            <Textarea
              id="mensagem-whatsapp"
              rows={8}
              maxLength={1000}
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Você pode editar a mensagem antes de abrir o WhatsApp.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void abrir()} disabled={!link?.valido}>
            <ExternalLink aria-hidden className="size-4" />
            Abrir no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
