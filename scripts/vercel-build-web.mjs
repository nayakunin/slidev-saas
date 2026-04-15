import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function formatArg(arg) {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

export function getBuildPlan(vercelEnv = process.env.VERCEL_ENV) {
  if (vercelEnv === "production") {
    return {
      mode: "production",
      command: "pnpm",
      args: [
        "--dir",
        "apps/backend",
        "run",
        "deploy",
        "--cmd",
        "cd ../web && pnpm build",
        "--cmd-url-env-var-name",
        "VITE_CONVEX_URL",
      ],
    };
  }

  return {
    mode: vercelEnv ?? "local",
    command: "pnpm",
    args: ["--dir", "apps/web", "build"],
  };
}

export function runBuildPlan(plan) {
  const result = spawnSync(plan.command, plan.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    console.error(`[vercel-build-web] Command terminated by signal: ${result.signal}`);
    return 1;
  }

  return result.status ?? 1;
}

export function main() {
  const plan = getBuildPlan();
  const label =
    plan.mode === "production" ? "production Convex deploy + web build" : "web-only build";

  console.log(`[vercel-build-web] VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"} -> ${label}`);
  console.log(
    `[vercel-build-web] Running: ${[plan.command, ...plan.args].map(formatArg).join(" ")}`,
  );

  const status = runBuildPlan(plan);
  if (status !== 0) {
    process.exit(status);
  }
}

if (import.meta.main) {
  main();
}
