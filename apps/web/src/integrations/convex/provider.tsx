import { ConvexProvider, ConvexReactClient } from "convex/react";

import { env } from "@/env";

export function getContext() {
  return {
    convexClient: new ConvexReactClient(env.VITE_CONVEX_URL),
  };
}

export default function AppConvexProvider({
  children,
  client,
}: {
  children: React.ReactNode;
  client: ConvexReactClient;
}) {
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
