import type { ExportJobSubmission } from "@app/backend/export-contract";
import { describe, expect, it, vi } from "vitest";

import type { ExporterEnv } from "./env";
import { createExporterApp } from "./app";

function createEnv(overrides: Partial<ExporterEnv> = {}): ExporterEnv {
  return {
    CONVEX_CALLBACK_SHARED_SECRET: "convex-secret",
    EXPORTER_MAX_CONCURRENT_JOBS: 2,
    EXPORTER_BUCKET_ACCESS_KEY_ID: "access-key",
    EXPORTER_BUCKET_ENDPOINT: "https://t3.storageapi.dev",
    EXPORTER_BUCKET_FORCE_PATH_STYLE: true,
    EXPORTER_BUCKET_NAME: "exports",
    EXPORTER_BUCKET_REGION: "sjc",
    EXPORTER_BUCKET_SECRET_ACCESS_KEY: "secret-key",
    EXPORTER_SHARED_SECRET: "exporter-secret",
    HOST: "127.0.0.1",
    PORT: 3001,
    TMP_DIR: undefined,
    ...overrides,
  };
}

function createSubmission(overrides: Partial<ExportJobSubmission> = {}): ExportJobSubmission {
  return {
    callbackUrl: "https://example.com/callback",
    entryFilePath: "slides.md",
    files: [
      {
        path: "slides.md",
        kind: "text",
        mimeType: "text/markdown",
        textContent: "# Hello",
        downloadUrl: null,
        sha256: "abc123",
      },
    ],
    fingerprint: "fingerprint-123",
    format: "pdf",
    jobId: "job-123",
    pipelineVersion: "v1",
    projectId: "project-123",
    projectTitle: "Quarterly Review",
    ...overrides,
  };
}

async function requestJson(
  app: ReturnType<typeof createExporterApp>,
  init: RequestInit,
  path = "/jobs",
) {
  const response = await app.request(`http://localhost${path}`, init);

  return {
    body: await response.json(),
    status: response.status,
  };
}

function createDeferred() {
  let resolvePromise!: () => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

describe("createExporterApp", () => {
  it("returns health information", async () => {
    const activeJobs = new Set(["job-1"]);
    const app = createExporterApp({
      activeJobs,
      env: createEnv(),
      processJob: vi.fn().mockResolvedValue(undefined),
    });

    const response = await app.request("http://localhost/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      activeJobs: 1,
      ok: true,
    });
  });

  it("rejects unauthorized job submissions", async () => {
    const app = createExporterApp({
      env: createEnv(),
      processJob: vi.fn().mockResolvedValue(undefined),
    });

    const response = await requestJson(app, {
      body: JSON.stringify(createSubmission()),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("rejects invalid JSON bodies", async () => {
    const app = createExporterApp({
      env: createEnv(),
      processJob: vi.fn().mockResolvedValue(undefined),
    });

    const response = await requestJson(app, {
      body: "{",
      headers: {
        authorization: "Bearer exporter-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid JSON body" });
  });

  it("rejects invalid submissions", async () => {
    const app = createExporterApp({
      env: createEnv(),
      processJob: vi.fn().mockResolvedValue(undefined),
    });

    const response = await requestJson(app, {
      body: JSON.stringify({ jobId: "job-123" }),
      headers: {
        authorization: "Bearer exporter-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Invalid export submission",
    });
    expect(response.body.issues).toBeInstanceOf(Array);
  });

  it("returns duplicate responses for active jobs", async () => {
    const app = createExporterApp({
      activeJobs: new Set(["job-123"]),
      env: createEnv(),
      processJob: vi.fn().mockResolvedValue(undefined),
    });

    const response = await requestJson(app, {
      body: JSON.stringify(createSubmission()),
      headers: {
        authorization: "Bearer exporter-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true, duplicate: true });
  });

  it("returns saturation responses when the exporter is full", async () => {
    const app = createExporterApp({
      activeJobs: new Set(["job-1"]),
      env: createEnv({ EXPORTER_MAX_CONCURRENT_JOBS: 1 }),
      processJob: vi.fn().mockResolvedValue(undefined),
    });

    const response = await requestJson(app, {
      body: JSON.stringify(createSubmission()),
      headers: {
        authorization: "Bearer exporter-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Exporter is saturated" });
  });

  it("accepts valid submissions and clears active jobs after completion", async () => {
    const activeJobs = new Set<string>();
    const completion = createDeferred();
    const processJob = vi.fn().mockImplementation(async () => {
      await completion.promise;
    });
    const app = createExporterApp({
      activeJobs,
      env: createEnv(),
      processJob,
    });

    const response = await requestJson(app, {
      body: JSON.stringify(createSubmission()),
      headers: {
        authorization: "Bearer exporter-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true });
    expect(processJob).toHaveBeenCalledWith(createSubmission());
    expect(activeJobs.has("job-123")).toBe(true);

    completion.resolve();
    await completion.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(activeJobs.size).toBe(0);
  });
});
