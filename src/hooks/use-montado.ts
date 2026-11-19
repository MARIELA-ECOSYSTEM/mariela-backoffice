import { useEffect, useRef } from "react";

/**
 * Fase 22.8.9.9.9 (M4.1) — `ref.current` é `true` enquanto o componente está montado. Uma resposta que chega depois
 * de a tela sair (ex.: o operador abriu outro produto) não deve mostrar aviso de sucesso/erro como se fosse da tela
 * atual — o estado do servidor e o cache do produto de origem continuam sendo atualizados pelos hooks de consulta.
 */
export function useMontado() {
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  return montado;
}
