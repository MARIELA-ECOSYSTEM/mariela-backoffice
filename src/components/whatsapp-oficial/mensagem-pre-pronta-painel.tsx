import { CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { UseQueryResult } from "@tanstack/react-query";
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
import {
  LIMITE_TEXTO_LIVRE_WHATSAPP,
  type ElegibilidadeTextoWhatsapp,
} from "@/types/whatsapp-oficial";
import { formatarDataHora } from "@/utils/format";
import { Aviso, Rotulo } from "./comum";

/**
 * Fase 22.8.9.10.7.3 / 22.8.9.10.7.4 — mensagem pré-pronta no dialog do WhatsApp oficial: o operador escolhe uma
 * mensagem padrão (Configurações → Mensagens de WhatsApp), edita o texto e vê a prévia do texto final.
 *
 * O texto editado vive SÓ no dialog (estado controlado pelo pai): nada aqui grava nas Configurações. A disponibilidade
 * do envio é a que o BACKEND informou (`GET /clientes/:id/texto-livre`) — a interface nunca presume a janela de 24 h
 * aberta; sem resposta do backend, o envio fica indisponível.
 */
export function MensagemPreProntaPainel({
  nomeCliente,
  telefoneMascarado,
  mensagemId,
  texto,
  onEscolher,
  onTexto,
  elegibilidade,
  desabilitado,
}: {
  nomeCliente: string;
  telefoneMascarado: string | null | undefined;
  mensagemId: string | null;
  texto: string;
  onEscolher: (id: string, conteudo: string) => void;
  onTexto: (texto: string) => void;
  elegibilidade: UseQueryResult<ElegibilidadeTextoWhatsapp>;
  desabilitado: boolean;
}) {
  const configuracoes = useConfiguracoes();
  const mensagens = configuracoes.data?.mensagensWhatsapp ?? [];
  const tamanho = texto.trim().length;

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

      <DisponibilidadeTextoLivre elegibilidade={elegibilidade} />

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
          <Select
            value={mensagemId ?? ""}
            disabled={desabilitado}
            onValueChange={(id) =>
              onEscolher(id, mensagens.find((item) => item.id === id)?.conteudo ?? "")
            }
          >
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
              maxLength={LIMITE_TEXTO_LIVRE_WHATSAPP}
              disabled={desabilitado}
              onChange={(e) => onTexto(e.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">
              {tamanho}/{LIMITE_TEXTO_LIVRE_WHATSAPP} · a edição vale só para este envio; a mensagem
              padrão salva não muda.
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
    </div>
  );
}

/** Situação do envio de texto livre exatamente como o backend informou. */
function DisponibilidadeTextoLivre({
  elegibilidade,
}: {
  elegibilidade: UseQueryResult<ElegibilidadeTextoWhatsapp>;
}) {
  if (elegibilidade.isPending) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="disponibilidade-texto"
        data-situacao="consultando"
      >
        <Loader2 aria-hidden className="size-4 animate-spin" /> Verificando se o texto livre pode
        ser enviado…
      </div>
    );
  }
  if (elegibilidade.isError) {
    return (
      <div data-testid="disponibilidade-texto" data-situacao="erro">
        <ErrorState
          error={elegibilidade.error}
          onRetry={() => void elegibilidade.refetch()}
          fallback="Não foi possível confirmar com o servidor se o texto livre pode ser enviado. O envio fica indisponível até a confirmação."
        />
      </div>
    );
  }
  const e = elegibilidade.data;
  if (e.permitido) {
    return (
      <div
        data-testid="disponibilidade-texto"
        data-situacao="permitido"
        className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/[0.06] px-3 py-2.5 text-sm text-foreground"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          {e.mensagem}
          {e.janelaExpiraEm ? (
            <span className="block text-xs text-muted-foreground">
              Disponível até {formatarDataHora(e.janelaExpiraEm)} (confirmado de novo no envio).
            </span>
          ) : null}
        </span>
      </div>
    );
  }
  return (
    <Aviso tom="informacao" titulo="Texto livre indisponível agora" testId="disponibilidade-texto">
      <span data-situacao="indisponivel" data-motivo={e.motivo ?? ""}>
        {e.mensagem}
      </span>
    </Aviso>
  );
}
