import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@workos/authkit-tanstack-react-start";
import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import { ConvexProviderWithAuth } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import TanstackQueryProvider from "../integrations/tanstack-query/root-provider";

import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

const fetchWorkosAuth = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await getAuth();
  const { user } = auth;
  return {
    userId: user?.id ?? null,
    token: user ? auth.accessToken : null,
  };
});

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Presentation Editor" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  beforeLoad: async () => {
    const { userId, token } = await fetchWorkosAuth();
    return { userId, token };
  },
  shellComponent: RootDocument,
});

function useAuthFromWorkOS() {
  const { loading, user } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) return null;
      if (forceRefreshToken) return (await refresh()) ?? null;
      return (await getAccessToken()) ?? null;
    },
    [user, refresh, getAccessToken],
  );

  return useMemo(
    () => ({
      isLoading: loading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [loading, user, fetchAccessToken],
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const context = useRouteContext({ from: Route.id });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <AuthKitProvider>
          <ConvexProviderWithAuth client={context.convexClient} useAuth={useAuthFromWorkOS}>
            <TanstackQueryProvider queryClient={context.queryClient}>
              <TooltipProvider>{children}</TooltipProvider>
              <TanStackDevtools
                config={{ position: "bottom-right" }}
                plugins={[
                  {
                    name: "Tanstack Router",
                    render: <TanStackRouterDevtoolsPanel />,
                  },
                  TanStackQueryDevtools,
                ]}
              />
            </TanstackQueryProvider>
          </ConvexProviderWithAuth>
        </AuthKitProvider>
        <Scripts />
      </body>
    </html>
  );
}
