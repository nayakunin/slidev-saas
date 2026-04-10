import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { getExportEnv } from "./exportEnv";

const http = httpRouter();

function isAuthorizedCallback(req: Request) {
  const env = getExportEnv();
  return req.headers.get("authorization") === `Bearer ${env.EXPORT_CALLBACK_SHARED_SECRET}`;
}

http.route({
  path: "/exports/callback",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!isAuthorizedCallback(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: unknown;

    try {
      payload = await req.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    if (!payload || typeof payload !== "object") {
      return new Response("Invalid callback payload", { status: 400 });
    }

    const body = payload as Record<string, unknown>;

    if (typeof body.jobId !== "string" || typeof body.status !== "string") {
      return new Response("Invalid callback payload", { status: 400 });
    }

    if (
      body.status !== "rendering" &&
      body.status !== "succeeded" &&
      body.status !== "failed"
    ) {
      return new Response("Invalid callback status", { status: 400 });
    }

    const result = await ctx.runMutation(internal.exports.applyExporterCallback, {
      jobId: body.jobId as Id<"exportJobs">,
      status: body.status,
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : undefined,
      bucketKey: typeof body.bucketKey === "string" ? body.bucketKey : undefined,
      etag: typeof body.etag === "string" ? body.etag : undefined,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
      fingerprint: typeof body.fingerprint === "string" ? body.fingerprint : undefined,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
      sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : undefined,
    });

    if (result.oldBucketKey) {
      await ctx.runAction(internal.exportsActions.deleteBucketObject, {
        bucketKey: result.oldBucketKey,
      });
    }

    return Response.json({ ok: true });
  }),
});

export default http;
