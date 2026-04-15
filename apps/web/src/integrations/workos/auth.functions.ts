import { createServerFn } from "@tanstack/react-start";
import { getSignInUrl } from "@workos/authkit-tanstack-react-start";

import { loadInitialAuth, requireAuthenticatedUser } from "@/integrations/workos/auth.server";

export const loadInitialAuthFn = createServerFn({ method: "GET" }).handler(async () => {
  return loadInitialAuth();
});

export const requireAuthenticatedUserFn = createServerFn({ method: "GET" }).handler(async () => {
  return requireAuthenticatedUser();
});

export const getSignInUrlFn = createServerFn({ method: "GET" }).handler(async () => {
  return getSignInUrl();
});
