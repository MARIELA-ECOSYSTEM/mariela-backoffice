/**
 * Fase 22.8.9.10.7.7 — faixa fixa de AMBIENTE DE HOMOLOGAÇÃO. Só aparece quando `VITE_AMBIENTE_HOMOLOGACAO` está
 * definida (o `iniciar.ps1` da homologação local define); os builds de produção e do desktop não a definem, então nada
 * é renderizado neles. O texto vem da configuração local e é exibido como texto (nunca como HTML).
 */
const ROTULO = import.meta.env.VITE_AMBIENTE_HOMOLOGACAO?.trim().slice(0, 60);

export function FaixaAmbiente() {
  if (!ROTULO) return null;
  return (
    <div
      role="status"
      data-testid="faixa-ambiente"
      className="sticky top-0 z-[100] w-full bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-black"
    >
      HOMOLOGAÇÃO · {ROTULO} — não é produção. Use apenas dados e números de teste.
    </div>
  );
}
