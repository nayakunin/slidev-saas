import { createFileRoute, redirect } from "@tanstack/react-router";

import { loadInitialAuthFn } from "@/integrations/workos/auth.functions";
import { HomePage } from "@/spaces/home/page";

export const Route = createFileRoute("/")({
  loader: async () => {
    const initialAuth = await loadInitialAuthFn();

    if (initialAuth?.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: HomePage,
});
