import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ConvexReactClient } from "convex/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { loadInitialAuthFn } from "@/integrations/workos/auth.functions";
import { WorkOSAuthProvider } from "@/integrations/workos/provider";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import TanstackQueryProvider from "../integrations/tanstack-query/root-provider";

import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Presentation Editor" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  loader: async () => {
    return {
      initialAuth: await loadInitialAuthFn(),
    };
  },
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { initialAuth } = Route.useLoaderData();
  const { convexClient, queryClient } = Route.useRouteContext();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <WorkOSAuthProvider convexClient={convexClient} initialAuth={initialAuth}>
          <TanstackQueryProvider queryClient={queryClient}>
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
        </WorkOSAuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
