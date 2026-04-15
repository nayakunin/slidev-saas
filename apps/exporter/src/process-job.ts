import {
  EXPORT_PIPELINE_VERSION,
  getExportFileName,
  getExportMimeType,
  getExportObjectKey,
  type ExportJobCallbackPayload,
  type ExportJobSubmission,
} from "@app/backend/export-contract";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import type { ExporterEnv } from "./env";
import { getEnv } from "./env";

function getS3Client(env: ExporterEnv) {
  return new S3Client({
    region: env.EXPORTER_BUCKET_REGION,
    endpoint: env.EXPORTER_BUCKET_ENDPOINT,
    forcePathStyle: env.EXPORTER_BUCKET_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.EXPORTER_BUCKET_ACCESS_KEY_ID,
      secretAccessKey: env.EXPORTER_BUCKET_SECRET_ACCESS_KEY,
    },
  });
}

function ensureProjectPath(rootDir: string, filePath: string) {
  const absolutePath = resolve(rootDir, filePath);

  if (!absolutePath.startsWith(`${rootDir}/`) && absolutePath !== rootDir) {
    throw new Error(`Unsafe project path: ${filePath}`);
  }

  return absolutePath;
}

async function downloadToFile(url: string, targetPath: string) {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download asset: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}

async function materializeProject(submission: ExportJobSubmission, rootDir: string) {
  for (const file of submission.files) {
    const absolutePath = ensureProjectPath(rootDir, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });

    if (file.kind === "text") {
      await writeFile(absolutePath, file.textContent ?? "", "utf8");
      continue;
    }

    if (!file.downloadUrl) {
      throw new Error(`Asset is missing a download URL: ${file.path}`);
    }

    await downloadToFile(file.downloadUrl, absolutePath);
  }
}

async function runMarpCli(
  submission: ExportJobSubmission,
  projectRoot: string,
  outputPath: string,
) {
  const args = [
    "exec",
    "marp",
    "--allow-local-files",
    submission.entryFilePath,
    `--${submission.format}`,
    "--output",
    outputPath,
  ];

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("pnpm", args, {
      cwd: projectRoot,
      env: process.env,
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", rejectPromise);
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(stderr.trim() || `Marp CLI exited with code ${code ?? "unknown"}.`),
      );
    });
  });
}

async function uploadArtifact({
  bucketKey,
  env,
  filePath,
  mimeType,
}: {
  bucketKey: string;
  env: ExporterEnv;
  filePath: string;
  mimeType: string;
}) {
  const client = getS3Client(env);
  const body = await readFile(filePath);
  const response = await client.send(
    new PutObjectCommand({
      Bucket: env.EXPORTER_BUCKET_NAME,
      Key: bucketKey,
      Body: body,
      ContentType: mimeType,
    }),
  );

  return {
    etag: response.ETag ?? null,
    sizeBytes: body.byteLength,
  };
}

async function postCallback(
  callbackUrl: string,
  env: ExporterEnv,
  payload: ExportJobCallbackPayload,
) {
  let lastError: Error | null = null;

  for (const delayMs of [0, 500, 1_500]) {
    if (delayMs > 0) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }

    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CONVEX_CALLBACK_SHARED_SECRET}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Callback failed with status ${response.status}.`);
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Callback request failed.");
    }
  }

  throw lastError ?? new Error("Callback request failed.");
}

export async function processJob(
  submission: ExportJobSubmission,
  env: ExporterEnv = getEnv(),
) {
  const baseDir = await mkdtemp(join(env.TMP_DIR ?? tmpdir(), "slidev-export-"));
  const projectRoot = join(baseDir, "project");

  try {
    await mkdir(projectRoot, { recursive: true });
    await postCallback(submission.callbackUrl, env, {
      jobId: submission.jobId,
      status: "rendering",
    });

    await materializeProject(submission, projectRoot);

    const fileName = getExportFileName({
      title: submission.projectTitle,
      format: submission.format,
    });
    const outputPath = join(baseDir, fileName);
    await runMarpCli(submission, projectRoot, outputPath);

    const bucketKey = getExportObjectKey({
      projectId: submission.projectId,
      format: submission.format,
      fingerprint: submission.fingerprint,
      pipelineVersion: submission.pipelineVersion || EXPORT_PIPELINE_VERSION,
    });
    const mimeType = getExportMimeType(submission.format);
    const upload = await uploadArtifact({
      bucketKey,
      env,
      filePath: outputPath,
      mimeType,
    });

    await postCallback(submission.callbackUrl, env, {
      jobId: submission.jobId,
      status: "succeeded",
      fingerprint: submission.fingerprint,
      bucketKey,
      fileName,
      mimeType,
      sizeBytes: upload.sizeBytes,
      etag: upload.etag,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exporter job failed.";
    console.error(`[exporter] job ${submission.jobId} failed`, error);

    try {
      await postCallback(submission.callbackUrl, env, {
        jobId: submission.jobId,
        status: "failed",
        errorMessage: message,
      });
    } catch (callbackError) {
      console.error(`[exporter] callback failed for job ${submission.jobId}`, callbackError);
    }
  } finally {
    await rm(baseDir, { force: true, recursive: true });
  }
}
