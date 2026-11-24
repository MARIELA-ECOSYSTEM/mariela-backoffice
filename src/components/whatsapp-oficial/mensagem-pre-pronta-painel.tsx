import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/common/states";
import { useConfiguracoes } from "@/hooks/use-configuracoes";
import { LIMITES_MENSAGEM_PADRAO_WHATSAPP as LIMITES } from "@/types/configuracoes";
import { Aviso, Rotulo } from "./comum";

/**
 * Fase 22.8.9.10.7.3 — mensagem pré-pronta no dialog do WhatsApp oficial: o operador escolhe uma mensagem padrão
 * (Configurações → Mensagens de WhatsApp), o texto vai para um campo EDITÁVEL e a prévia mostra destinatário e texto
 * final.
 *
 * O ENVIO deste texto não existe: o backend oficial só aceita modelos aprovados pela Meta (`POST /envios` recebe a
 * chave do modelo, nunca texto). Este painel não chama nenhuma rota de envio, nem a Meta, nem a Evolution — o botão
 * de confirmação do dialog fica desabilitado neste modo, com a explicação abaixo.
 */
export function MensagemPreProntaPainel({
  nomeCliente,
  telefoneMascarado,
}: {
  nomeCliente: string;
  telefoneMascarado: string | null | undefined;
}) {
  const configuracoes = useConfiguracoes();
  const [mensagemId, setMensagemId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const mensagens = configuracoes.data?.mensagensWhatsapp ?? [];

  function escolher(id: string) {
    const m = mensagens.find((item) => item.id === id);
    setMensagemId(id);
    setTexto(m?.conteudo ?? "");
  }

  return (
    <div className="space-y-4" data-testid="painel-mensagem-pre-pronta">
      <div className="space-y-1 rounded-lg border border-border px-3 py-2.5">
        <Rotulo>Destinatário</Rotulo>
        <p className="text-sm text-foreground" data-testid="destinatario-pre-pronta">
          {nomeCliente} · {telefoneMascarado ?? "telefone do cadastro"}
        </p>
        <p className="text-xs text-muted-foreground">
          Número do cadastro do cliente — não pode ser alterado aqui.
        </p>
      </div>

      {configuracoes.isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Carregando mensagens padrão…
        </div>
      ) : configuracoes.isError ? (
        <ErrorState
          error={configuracoes.error}
          onRetry={() => void configuracoes.refetch()}
          fallback="Não foi possível carregar as mensagens padrão."
        />
      ) : mensagens.length === 0 ? (
        <Aviso tom="informacao">
          Nenhuma mensagem padrão cadastrada. Cadastre em{" "}
          <Link to="/configuracoes" className="underline">
            Configurações → Mensagens de WhatsApp
          </Link>
          .
        </Aviso>
      ) : (
        <div className="space-y-1.5">
          <Rotulo>Mensagem padrão</Rotulo>
          <Select value={mensagemId ?? ""} onValueChange={escolher}>
            <SelectTrigger aria-label="Mensagem padrão">
              <SelectValue placeholder="Escolha uma mensagem" />
            </SelectTrigger>
            <SelectContent>
              {mensagens.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mensagemId !== null ? (
        <>
          <div className="space-y-1.5">
            <Rotulo>Texto (edite à vontade)</Rotulo>
            <Textarea
              aria-label="Texto da mensagem"
              value={texto}
              rows={6}
              maxLength={LIMITES.conteudo}
              onChange={(e) => setTexto(e.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {texto.trim().length}/{LIMITES.conteudo} · a edição vale só para esta conversa; a
              mensagem padrão salva não muda.
            </p>
          </div>
          <div className="space-y-1.5">
            <Rotulo>Prévia do texto final</Rotulo>
            <p
              data-testid="previa-pre-pronta"
              className="min-h-12 whitespace-pre-wrap rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm text-foreground"
            >
              {texto.trim() || "(texto vazio)"}
            </p>
          </div>
        </>
      ) : null}

      <Aviso
        tom="informacao"
        titulo="Envio de texto editável indisponível"
        testId="aviso-texto-livre"
      >
        O WhatsApp oficial do MARIELA só envia, hoje, modelos aprovados pela Meta. O envio de texto
        livre exige uma extensão do backend (dentro da janela de atendimento de 24 h aberta por uma
        mensagem do cliente) e ainda não existe — nada é enviado a partir desta aba. Para enviar
        agora, use a aba “Modelo aprovado”.
      </Aviso>
    </div>
  );
}
