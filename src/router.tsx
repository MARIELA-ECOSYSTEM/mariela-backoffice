import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Os dados oficiais vivem na API remota: nada é tratado como fresco por padrão.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
