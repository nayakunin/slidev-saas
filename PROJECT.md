# Presentation Editor

A hosted platform to create, edit, preview, and publish markdown-based presentations with instant in-browser rendering.

## Tech Stack

| Concern | Choice |
|---|---|
| Frontend | TanStack Start |
| Auth | WorkOS AuthKit |
| Data + file storage | Convex |
| Presentation renderer | `@marp-team/marp-core` in the browser |
| AI | Vercel AI Gateway → Claude |

## Project Model

Each presentation is stored as a Convex-backed project tree:

```text
my-deck/
  slides.md
  public/
```

Text files are stored inline in Convex. Binary assets are stored in Convex Storage and exposed through signed download URLs.

## Runtime Architecture

```text
Browser
  └─ editor textarea
  └─ Marp renders markdown to HTML + CSS
  └─ preview isolated in iframe srcDoc

TanStack Start
  └─ auth shell and application UI

Convex
  └─ projects table
  └─ projectFiles table
  └─ storage for uploaded assets
```

There is no sandbox-manager, worker process, Docker layer, or session hydration pipeline. Opening a project simply loads its files from Convex. Editing markdown updates the preview locally and persists the file back to Convex on debounce.

## Editor Flow

1. User opens a project.
2. The web app loads the file tree and the active file from Convex.
3. The main markdown file is rendered locally with Marp.
4. The rendered HTML and CSS are injected into an isolated iframe via `srcDoc`.
5. Text edits autosave back to Convex.
6. Uploaded assets are stored in Convex Storage and can be referenced by URL from markdown.

## Auth

WorkOS AuthKit handles authentication via server-side middleware and Convex validates the resulting JWTs for authenticated queries and mutations.

## Monorepo Structure

```text
apps/
  backend/        # Convex schema, queries, mutations, shared backend types
  web/            # TanStack Start UI and client-side Marp preview
packages/
  typescript-config/
```
