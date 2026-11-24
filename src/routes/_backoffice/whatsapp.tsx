import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/layout/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BloqueiosLista } from "@/components/whatsapp-oficial/bloqueios-lista";
import { HistoricoMensagens } from "@/components/whatsapp-oficial/historico-mensagens";
import { SituacaoIntegracao } from "@/components/whatsapp-oficial/situacao-integracao";
import { useClientes } from "@/hooks/use-cadastros";

export const Route = createFileRoute("/_backoffice/whatsapp")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WhatsApp oficial — MARIELA Backoffice" },
      {
        name: "description",
        content: "Situação, histórico e bloqueios do WhatsApp oficial (Meta).",
      },
    ],
  }),
  component: WhatsappOficialPage,
});

type Aba = "situacao" | "historico" | "bloqueios";

/**
 * Fase 22.8.9.10.6 — WhatsApp OFICIAL (Cloud API da Meta, envio por modelo). O envio individual fica na ficha do
 * cliente e a campanha de aniversário na tela de Clientes; aqui ficam a situação, o histórico e os bloqueios.
 */
function WhatsappOficialPage() {
  const [aba, setAba] = useState<Aba>("situacao");
  const { data: clientes } = useClientes();
  const resumo = useMemo(
    () => (clientes ?? []).map((c) => ({ id: c.id, nome: c.nome })),
    [clientes],
  );

  return (
    <Page
      titulo="WhatsApp oficial"
      breadcrumbs={[{ label: "Integrações" }, { label: "WhatsApp oficial" }]}
      descricao="Mensagens por modelo aprovado pela Meta, enviadas pelo backend. Telefones aparecem sempre mascarados."
    >
      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList>
          <TabsTrigger value="situacao">Situação</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="bloqueios">Bloqueios</TabsTrigger>
        </TabsList>
        <TabsContent value="situacao" className="pt-4">
          <SituacaoIntegracao />
        </TabsContent>
        <TabsContent value="historico" className="pt-4">
          <HistoricoMensagens clientes={resumo} />
        </TabsContent>
        <TabsContent value="bloqueios" className="pt-4">
          <BloqueiosLista clientes={resumo} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
