import { redirect } from "@tanstack/react-router";
import { getAuth, getSignInUrl } from "@workos/authkit-tanstack-react-start";
import type { AuthKitProviderProps } from "@workos/authkit-tanstack-react-start/client";

type InitialAuth = AuthKitProviderProps["initialAuth"];

export async function loadInitialAuth(): Promise<InitialAuth> {
  const auth = await getAuth();

  if (!auth.user) {
    return { user: null };
  }

  const { accessToken: _accessToken, ...initialAuth } = auth;

  return initialAuth;
}

export async function requireAuthenticatedUser() {
  const auth = await getAuth();

  if (!auth.user) {
    throw redirect({ href: await getSignInUrl() });
  }

  return auth.user;
}
