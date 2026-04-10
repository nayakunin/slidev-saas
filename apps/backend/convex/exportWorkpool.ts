import { Workpool } from "@convex-dev/workpool";

import { components } from "./_generated/api";

export const exportPool = new Workpool(components.exportWorkpool, {
  maxParallelism: Number.parseInt(process.env.EXPORT_WORKPOOL_MAX_PARALLELISM ?? "1", 10) || 1,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 1_000,
    base: 2,
  },
});
