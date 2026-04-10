import {
  type ExportJobSubmission,
  exportFormats,
} from "@app/backend/export-contract";
import { Hono } from "hono";
import { z } from "zod";

import type { ExporterEnv } from "./env";
import { getEnv } from "./env";
import { processJob as defaultProcessJob } from "./process-job";

const submissionSchema = z.object({
  callbackUrl: z.url(),
  entryFilePath: z.string().min(1),
  files: z.array(
    z.object({
      path: z.string().min(1),
      kind: z.enum(["text", "asset"]),
      mimeType: z.string().nullable(),
      textContent: z.string().nullable(),
      downloadUrl: z.url().nullable(),
      sha256: z.string().min(1),
    }),
  ),
  fingerprint: z.string().min(1),
  format: z.enum(exportFormats),
  jobId: z.string().min(1),
  pipelineVersion: z.string().min(1),
  projectId: z.string().min(1),
  projectTitle: z.string().min(1),
});

export interface CreateExporterAppOptions {
  activeJobs?: Set<string>;
  env?: ExporterEnv;
  processJob?: (submission: ExportJobSubmission) => Promise<void>;
}

function isAuthorized(req: Request, env: ExporterEnv) {
  return req.headers.get("authorization") === `Bearer ${env.EXPORTER_SHARED_SECRET}`;
}

export function createExporterApp(options: CreateExporterAppOptions = {}) {
  const env = options.env ?? getEnv();
  const activeJobs = options.activeJobs ?? new Set<string>();
  const processJob =
    options.processJob ?? ((submission: ExportJobSubmission) => defaultProcessJob(submission, env));

  const app = new Hono();

  app.onError((error, c) => {
    console.error("[exporter] unexpected request failure", error);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.get("/healthz", (c) => {
    return c.json({
      activeJobs: activeJobs.size,
      ok: true,
    });
  });

  app.post("/jobs", async (c) => {
    if (!isAuthorized(c.req.raw, env)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let payload: unknown;

    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const submission = submissionSchema.safeParse(payload);

    if (!submission.success) {
      return c.json(
        {
          error: "Invalid export submission",
          issues: submission.error.issues,
        },
        400,
      );
    }

    if (activeJobs.has(submission.data.jobId)) {
      return c.json({ accepted: true, duplicate: true }, 202);
    }

    if (activeJobs.size >= env.EXPORTER_MAX_CONCURRENT_JOBS) {
      return c.json({ error: "Exporter is saturated" }, 503);
    }

    activeJobs.add(submission.data.jobId);
    void processJob(submission.data).finally(() => {
      activeJobs.delete(submission.data.jobId);
    });

    return c.json({ accepted: true }, 202);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
