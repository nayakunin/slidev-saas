import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function getExportEnv() {
  const env = createEnv({
    server: {
      CONVEX_HTTP_BASE_URL: z.url(),
      EXPORT_CALLBACK_SHARED_SECRET: z.string().min(1),
      EXPORTER_BASE_URL: z.url(),
      EXPORTER_SHARED_SECRET: z.string().min(1),
      EXPORTS_BUCKET_ACCESS_KEY_ID: z.string().min(1),
      EXPORTS_BUCKET_ENDPOINT: z.url().optional(),
      EXPORTS_BUCKET_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
      EXPORTS_BUCKET_NAME: z.string().min(1),
      EXPORTS_BUCKET_REGION: z.string().min(1),
      EXPORTS_BUCKET_SECRET_ACCESS_KEY: z.string().min(1),
      EXPORT_URL_EXPIRES_SECONDS: z.coerce.number().int().positive().optional(),
      EXPORT_WORKPOOL_MAX_PARALLELISM: z.coerce.number().int().positive().optional(),
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
  });

  return {
    ...env,
    EXPORTS_BUCKET_FORCE_PATH_STYLE: env.EXPORTS_BUCKET_FORCE_PATH_STYLE === "true",
    EXPORT_URL_EXPIRES_SECONDS: env.EXPORT_URL_EXPIRES_SECONDS ?? 300,
    EXPORT_WORKPOOL_MAX_PARALLELISM: env.EXPORT_WORKPOOL_MAX_PARALLELISM ?? 1,
  };
}
