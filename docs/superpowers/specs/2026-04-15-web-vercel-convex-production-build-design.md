# Web Vercel + Convex Production Build Design

## Goal

Configure the `apps/web` Vercel project so production deployments also deploy the Convex backend, while preview deployments build only the web app.

## Current State

- The repository is a pnpm monorepo with `apps/web` and `apps/backend`.
- `apps/backend` already exposes `pnpm deploy`, which runs `convex deploy`.
- `apps/web` already builds correctly with `pnpm build` and outputs to `dist/client` and `dist/server`.
- There is no existing Vercel project configuration in this repository.
- In the older `mono` repository, Vercel only handled frontend builds. Convex production deploys were run separately by GitHub Actions.

## Desired Behavior

- The Vercel project root remains `apps/web`.
- Vercel installs dependencies from the monorepo root so workspace packages resolve correctly.
- Preview deployments only run the web build.
- Production deployments run `convex deploy` for `apps/backend` and use Convex's `--cmd` hook to build the web app after the backend deploy succeeds.
- The build remains deterministic and does not depend on shell-specific inline conditionals in the Vercel dashboard.

## Recommended Approach

Use a checked-in build script as the single Vercel build entrypoint.

### Why

- It keeps deployment logic in version control instead of hidden in dashboard settings.
- It avoids a second deployment system such as GitHub Actions.
- It matches Convex's documented Vercel integration model for production deploys.
- It keeps preview deploys safe by not attempting backend mutations.

## Proposed Changes

### 1. Add `apps/web/vercel.json`

Add a Vercel config file in `apps/web` with:

- `installCommand`: `cd ../.. && pnpm install --frozen-lockfile`
- `buildCommand`: `cd ../.. && node scripts/vercel-build-web.mjs`
- `outputDirectory`: `dist/client`
- `framework`: `null`

This keeps the Vercel project pointed at `apps/web` while still letting installs and builds operate from the monorepo root.

### 2. Add `scripts/vercel-build-web.mjs`

Add a small Node script that:

1. Reads `VERCEL_ENV`
2. If `VERCEL_ENV === "production"`, runs:
   `pnpm --filter @app/backend deploy --cmd 'cd ../web && pnpm build'`
3. Otherwise runs:
   `pnpm --dir apps/web build`

The script should fail fast on non-zero exit codes and echo which path it chose.

### 3. Keep app-local web build

Do not route the web build through `turbo run build` for this integration.

Reason:

- `apps/web` already has a complete direct build command.
- Running through Turbo would require extra environment plumbing for strict env behavior without adding meaningful value to this deployment path.

## Environment Requirements

Vercel project environment variables must include:

- Production only:
  - `CONVEX_DEPLOY_KEY`
- Preview and Production:
  - `VITE_CONVEX_URL`
- Any existing web build requirements:
  - `WORKOS_API_KEY`
  - `WORKOS_CLIENT_ID`
  - `WORKOS_COOKIE_PASSWORD`
  - `WORKOS_REDIRECT_URI`

`VITE_CONVEX_URL` can point to the production Convex deployment in both Preview and Production since Convex preview deployments are intentionally out of scope.

## Execution Flow

### Preview deployment

1. Vercel checks out the repo with root directory `apps/web`
2. `installCommand` installs from monorepo root
3. `buildCommand` runs `scripts/vercel-build-web.mjs`
4. Script detects `VERCEL_ENV=preview`
5. Script runs only `pnpm --dir apps/web build`
6. Vercel publishes the web output

### Production deployment

1. Vercel checks out the repo with root directory `apps/web`
2. `installCommand` installs from monorepo root
3. `buildCommand` runs `scripts/vercel-build-web.mjs`
4. Script detects `VERCEL_ENV=production`
5. Script runs `pnpm --filter @app/backend deploy --cmd 'cd ../web && pnpm build'`
6. Convex deploys backend code, schema, and generated artifacts
7. Convex invokes the web build command with the deployment URL wired into the build environment
8. Vercel publishes the web output

## Error Handling

- If Convex deploy fails in production, the Vercel deployment fails.
- If the web build fails in either preview or production, the Vercel deployment fails.
- The build helper should print which mode it is in so deployment logs clearly show whether Convex was attempted.

## Verification

Implementation should be verified with:

1. Local dry run of the helper script in a non-production environment.
2. Local production-path dry run of the helper script up to command construction, or a real production deploy only if credentials are present and explicitly intended.
3. Validation that `apps/web/vercel.json` resolves the monorepo install/build from the Vercel app root.
4. A final review of required Vercel environment variables to set in the dashboard.

## Out of Scope

- Convex preview deployments
- GitHub Actions deployment workflows
- Turbo environment refactors
- Frontend code changes unrelated to deployment configuration
