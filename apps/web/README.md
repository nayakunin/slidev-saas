# Web App

`apps/web` is the TanStack Start frontend for the presentation editor. It uses WorkOS for auth, Convex for app data and file operations, Tailwind v4 for styling, and T3 Env for client env validation.

## Commands

Run these from the repo root:

```bash
pnpm --dir apps/web dev
pnpm --dir apps/web build
pnpm --dir apps/web preview
pnpm --dir apps/web test
pnpm --dir apps/web check-types
pnpm --dir apps/web lint
pnpm --dir apps/web fmt:check
```

## Environment

Validated in [`src/env.ts`](./src/env.ts):

- `VITE_CONVEX_URL` is required
- `VITE_APP_TITLE` is optional

Use `.env.local` for local overrides.

## Structure

The folder rules in [`AGENTS.md`](./AGENTS.md) are intentional:

- `src/components` is only for reusable generic components and `shadcn/ui`
- `src/hooks` is only for generic hooks
- `src/integrations` contains third-party wiring such as Convex, TanStack Query, and WorkOS
- `src/lib` contains shared cross-space utilities
- `src/layouts` contains shared app-specific page shells that are reused across spaces
- `src/routes` stays thin and should mostly define route config, params, loaders, and render a space entrypoint
- `src/spaces` contains feature-specific code

Current spaces:

- `home` for the public landing page
- `dashboard` for the authenticated project list
- `project` for the editor, file tree, preview, and export flow

New feature work should usually start in `src/spaces/*`, not in top-level `src/components`.

## Routing And Auth

- `src/routes/__root.tsx` owns the document shell and app-wide providers
- `src/routes/_protected.tsx` gates authenticated routes with `beforeLoad`
- `src/integrations/workos` owns WorkOS middleware, callback handlers, client hooks, and server auth helpers

## Notes

- This app uses file-based routing. Moving or renaming route files will regenerate `src/routeTree.gen.ts`.
- The project uses `@t3-oss/env-core`, `tsgo`, `oxlint`, `oxfmt`, and `vitest`.
- Be careful when addressing files with `$` in shell commands because TanStack route filenames can be expanded by the shell.
