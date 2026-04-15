import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos/authkit-tanstack-react-start/client";
import type { AuthKitProviderProps } from "@workos/authkit-tanstack-react-start/client";
import { ConvexProviderWithAuth } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

function decodeJwtClaims(token: string) {
  try {
    const payload = token.split(".")[1];

    if (!payload) {
      return null;
    }

    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      aud?: string | string[];
      exp?: number;
      iat?: number;
      iss?: string;
      sub?: string;
    };
  } catch (error) {
    console.error("[auth-debug] Failed to decode WorkOS access token.", error);
    return null;
  }
}

function useConvexAuthFromWorkOS() {
  const { loading, user } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) {
        console.info("[auth-debug] Skipping WorkOS token fetch because there is no user.");
        return null;
      }

      console.info("[auth-debug] Fetching WorkOS access token for Convex.", {
        forceRefreshToken,
        userId: user.id,
      });

      try {
        const token = forceRefreshToken
          ? ((await refresh()) ?? null)
          : ((await getAccessToken()) ?? null);
        const claims = token ? decodeJwtClaims(token) : null;

        console.info("[auth-debug] WorkOS access token fetch result.", {
          aud: claims?.aud ?? null,
          exp: claims?.exp ?? null,
          hasToken: !!token,
          iat: claims?.iat ?? null,
          iss: claims?.iss ?? null,
          sub: claims?.sub ?? null,
        });

        return token;
      } catch (error) {
        console.error("[auth-debug] WorkOS access token fetch failed.", error);
        throw error;
      }
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
