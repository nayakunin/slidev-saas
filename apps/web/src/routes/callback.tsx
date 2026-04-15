import { createFileRoute } from "@tanstack/react-router";

import { workOSCallbackHandlers } from "@/integrations/workos/callback";

export const Route = createFileRoute("/callback")({
  server: {
    handlers: workOSCallbackHandlers,
  },
});
