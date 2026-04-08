# Slidev SaaS

A hosted platform to create, edit, preview, and publish [Slidev](https://sli.dev/) presentations — no local setup required.

- **B2C**: Anyone can create markdown-based presentations in the browser, with AI assistance making it accessible to non-technical users.
- **B2B**: Teams get shared workspaces, branded themes, and SSO (later phases).
- **AI-native**: An embedded AI agent (like Claude Code) that can chat, plan, and directly edit project files.
- **Full Slidev compatibility**: Slidev runs as-is using its intended CLI and tooling — no forks, no hacks.

---

## Tech stack

| Concern | Choice |
|---|---|
| Frontend + server functions | TanStack Start on Vercel |
| Auth | WorkOS (SSO-ready for B2B) |
| Database + realtime backend | Convex |
| AI | Vercel AI Gateway → Claude |
| AWS infra management | SST v3 (TypeScript IaC) |
| Sandbox execution | AWS ECS Fargate (scale to zero) |
| File storage | AWS S3 |
| Preview + HMR routing | AWS ALB (WebSocket support) |
| Published decks | S3 + CloudFront |

---

## Core model: presentation as a project folder

Each presentation is a project with a real file system:

```
my-deck/
  slides.md          # main presentation content
  package.json       # baseline config, user can extend
  components/        # custom Vue components
  public/            # images and other assets
```

The file tree visible in the UI directly mirrors the file system inside the running sandbox. Files are snapshotted to S3 between sessions.

---

## Editor UI

Tiling window manager — panels can be resized and repositioned (VSCode/Hyprland-style):

| Panel | Description |
|---|---|
| **Editor** | CodeMirror — edit `slides.md` and other project files |
| **File tree** | Browse, create, upload files in the project |
| **Preview** | Live iframe of the running Slidev dev server (HMR) |
| **AI chat** | Agent interface — chat, plan, or directly edit files |

---

## Sandbox model

Sessions are on-demand. The Slidev dev server only runs while a project is open.

**Session lifecycle:**
1. User opens a project → Convex creates a session record
2. A Fargate task starts (or an existing task is assigned a slot)
3. Worker pulls project files from S3 into its working directory
4. `npm install` runs (skipped if deps match the pre-baked image)
5. `slidev dev` starts
6. Preview is reverse-proxied through ALB — WebSocket passthrough for Vite HMR
7. Idle timeout → dev server stops → files snapshot back to S3 → task terminates

**Session states:** `cold` (S3 only) → `warm` (task running, server not started) → `hot` (dev server live)

**Scale to zero:** ECS Fargate with min=0 tasks. You pay only while containers are running (~$0.05/hr per active slot). The fixed cost is the ALB (~$18/month).

**Cold start mitigation:** The Docker image ships with a pre-installed Slidev project (`node_modules` baked in). For projects using the default `package.json`, `npm install` is skipped entirely. Cold start is then just task spin-up + Vite startup (~5–10s).

**Bin-packing:** Multiple sessions can share one Fargate task — not one task per user.

---

## Worker vs Exporter

**Worker** (`apps/worker`) — long-running container, one per active session pool.
- Runs `slidev dev` for live editing
- Exposes an internal HTTP API used by both the AI agent and the editor:
  - `GET  /files/:path` — read a file
  - `PUT  /files/:path` — write a file
  - `GET  /files` — list project files
  - `POST /commands` — run an allowed command (e.g. package install)
- Streams file change events back to the frontend

**Exporter** (`apps/exporter`) — on-demand task, runs once per publish action.
- Triggered when user clicks "Publish"
- Runs `slidev build` against the project snapshot from S3
- Uploads static output to S3 → invalidates CloudFront cache
- Exits when done (Fargate task terminates, no idle cost)

Kept separate so a CPU-intensive export job never degrades an active editing session.

---

## AI agent

Lives in TanStack Start server functions — no separate AI service needed.

**Flow:**
1. User sends a message in the AI chat panel
2. TanStack Start server function calls Vercel AI Gateway → Claude (streaming)
3. Claude returns a tool call → server function executes it directly against the worker API
4. Result fed back to Claude → generation continues
5. Response streams back to the browser

**Tools available to the AI:**
- `read_file(sessionId, path)`
- `write_file(sessionId, path, content)`
- `list_files(sessionId)`
- `run_command(sessionId, cmd)` — restricted to an allowlist (e.g. `npm install <pkg>`)

No raw shell access. The AI operates through typed endpoints on the worker, not arbitrary bash.

Chat history is stored in Convex per project.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│            TanStack Start (Vercel)               │
│  Tiling UI: editor · preview · file tree · AI   │
│  Server functions: AI streaming + tool execution │
└──────────────┬───────────────────────┬───────────┘
               │                       │
               ▼                       ▼
     ┌──────────────────┐    ┌──────────────────┐
     │     Convex       │    │  Vercel AI       │
     │  projects        │    │  Gateway         │
     │  sessions        │    │  → Claude        │
     │  chat history    │    └──────────────────┘
     └────────┬─────────┘
              │ session state + routing
              ▼
┌─────────────────────────────────── AWS (SST) ────┐
│                                                  │
│  ALB ──► ECS Fargate Workers (min=0 tasks)       │
│               └─ session slot per project        │
│                   └─ slidev dev (port 3030)      │
│                   └─ file API (port 3031)        │
│                   └─ /srv/sessions/<id>/         │
│                                                  │
│  ECS Tasks (on-demand) ──► Exporter              │
│                             └─ slidev build      │
│                             └─ upload → S3       │
│                                                  │
│  S3          project snapshots + assets          │
│              build artifacts                     │
│  CloudFront  published static decks              │
└──────────────────────────────────────────────────┘
```

---

## AWS infrastructure (SST v3)

All AWS resources are defined as TypeScript in `sst.config.ts` using SST v3 (Pulumi-based).

Resources:
- `Service` — ECS Fargate for worker pool and exporter tasks
- `Bucket` — S3 for project files, assets, and build output
- `Router` / ALB — preview traffic routing with WebSocket passthrough
- `StaticSite` / CloudFront — published deck hosting
- `Secret` — API keys and credentials

Deploy: `sst deploy` — run locally or via GitHub Actions on merge to main.

---

## Monorepo structure

```
apps/
  web/            # TanStack Start — editor UI, dashboard, published deck viewer
                  #   server functions handle AI streaming and tool execution
  worker/         # Docker — Slidev dev server + file/command API
  exporter/       # Docker — one-shot slidev build + S3 upload
packages/
  convex/         # Convex schema, mutations, queries
  types/          # Shared TypeScript types
  typescript-config/  # Shared tsconfig bases
sst.config.ts     # AWS infrastructure (SST v3)
```

---

## Product phases

### Phase 1 — Core editing loop
- Fixed baseline Slidev template
- Live editor + preview via remote sandbox
- File tree + asset uploads
- Save, load, basic publish to public URL
- Built-in Slidev themes only

### Phase 2 — AI + extensibility
- AI agent with file read/write tools
- Custom Vue components support
- Curated theme picker
- Controlled package installs (allowlisted)

### Phase 3 — B2B + full compatibility
- WorkOS SSO / SAML for enterprise
- Branded team themes
- Arbitrary `package.json` + Vite config
- Custom domains for published decks
- Deck sharing and access control
