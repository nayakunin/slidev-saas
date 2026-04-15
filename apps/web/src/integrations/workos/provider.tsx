import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import type { AuthKitProviderProps } from "@workos/authkit-tanstack-react-start/client";
import { ConvexProviderWithAuth } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

function useConvexAuthFromWorkOS() {
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

export function WorkOSAuthProvider({
  children,
  convexClient,
  initialAuth,
}: {
  children: React.ReactNode;
  convexClient: ConvexReactClient;
  initialAuth: AuthKitProviderProps["initialAuth"];
}) {
  return (
    <AuthKitProvider initialAuth={initialAuth}>
      <ConvexProviderWithAuth client={convexClient} useAuth={useConvexAuthFromWorkOS}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
