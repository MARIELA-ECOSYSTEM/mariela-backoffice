import { useState } from "react";
import { VideoOff } from "lucide-react";

/**
 * Fase 22.8.9.9.6 (M4) — player do vídeo do produto: controles NATIVOS, sem reprodução automática e com
 * `preload="metadata"` (só os metadados são baixados até o operador apertar "reproduzir" — nunca o arquivo inteiro de
 * antemão). A URL é a pública devolvida pela galeria (ou a URL antiga da variante); nada é montado aqui. Erro de
 * carregamento/reprodução (URL indisponível, origem fora da CSP `media-src`, formato) vira mensagem clara.
 */
export function PlayerVideo({ url, titulo }: { url: string; titulo: string }) {
  const [falhaEm, setFalhaEm] = useState<string | null>(null);
  if (falhaEm === url) {
    return (
      <div
        role="alert"
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted p-4 text-center text-sm text-muted-foreground"
      >
        <VideoOff aria-hidden className="size-6" />
        <p>Não foi possível reproduzir o vídeo.</p>
        <p className="text-xs">
          O arquivo pode estar indisponível no momento ou num endereço que o aplicativo não permite.
        </p>
      </div>
    );
  }
  return (
    <video
      key={url}
      src={url}
      controls
      preload="metadata"
      playsInline
      aria-label={titulo}
      className="aspect-video w-full rounded-lg border border-border bg-black"
      onError={() => setFalhaEm(url)}
    />
  );
}
