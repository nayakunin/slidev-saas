import { createStart } from "@tanstack/react-start";

import { workOSRequestMiddleware } from "@/integrations/workos/middleware";

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [workOSRequestMiddleware],
  };
});
