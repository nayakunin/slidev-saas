import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getSignInUrlFn, loadInitialAuthFn } from "@/integrations/workos/auth.functions";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const initialAuth = await loadInitialAuthFn();

    if (!initialAuth?.user) {
      throw redirect({ href: await getSignInUrlFn() });
    }
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return <Outlet />;
}
