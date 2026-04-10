import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function getEnv() {
  const env = createEnv({
    server: {
      CONVEX_CALLBACK_SHARED_SECRET: z.string().min(1),
      EXPORTER_MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().optional(),
      EXPORTER_SHARED_SECRET: z.string().min(1),
      EXPORTS_BUCKET_ACCESS_KEY_ID: z.string().min(1),
      EXPORTS_BUCKET_ENDPOINT: z.url().optional(),
      EXPORTS_BUCKET_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
      EXPORTS_BUCKET_NAME: z.string().min(1),
      EXPORTS_BUCKET_REGION: z.string().min(1),
      EXPORTS_BUCKET_SECRET_ACCESS_KEY: z.string().min(1),
      HOST: z.string().min(1).optional(),
      PORT: z.coerce.number().int().positive().optional(),
      TMP_DIR: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
  });

  return {
    ...env,
    EXPORTER_MAX_CONCURRENT_JOBS: env.EXPORTER_MAX_CONCURRENT_JOBS ?? 1,
    EXPORTS_BUCKET_FORCE_PATH_STYLE: env.EXPORTS_BUCKET_FORCE_PATH_STYLE === "true",
    HOST: env.HOST ?? "0.0.0.0",
    PORT: env.PORT ?? 3001,
  };
}

export type ExporterEnv = ReturnType<typeof getEnv>;
