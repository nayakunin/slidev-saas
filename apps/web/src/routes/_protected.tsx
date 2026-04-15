import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";

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
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm border border-border bg-card px-6 py-5">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Authenticating
          </div>
          <div className="mt-2 text-sm text-foreground">
            Restoring your session and loading project data.
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
