# Phase 2d: Deployment & Self-Hosting Design

**Issue:** #36
**Date:** 2026-03-29

## Overview

Containerize the logd server for small-team VPS deployment. SQLite for now, designed for easy DB swap later. Ollama bundled as optional sidecar.

## Dockerfile

Multi-stage build in repo root (monorepo-aware). Use `node:22-slim` (Debian-based) instead of Alpine to avoid musl compatibility issues with `better-sqlite3` and `sqlite-vec` native extensions.

A `.dockerignore` must be created to exclude `node_modules`, `.git`, `dist`, `*.db`, and `.env` files from the build context.

**Stage 1 — Build:**
- Base: `node:22-slim`
- Install build tools: `build-essential`, `python3` (for node-gyp / native modules)
- Copy root `package.json`, `package-lock.json`, workspace package files
- `npm ci` to install all deps (native modules compile here)
- Build `@logd/shared` then `@logd/server`

**Stage 2 — Production:**
- Base: `node:22-slim`
- Copy from build stage:
  - `packages/server/dist/` — compiled server
  - `packages/shared/dist/` — compiled shared types
  - `packages/server/package.json`, `packages/shared/package.json`, root `package.json`
  - `node_modules/` — already contains native binaries compiled for the same Debian base
- No rebuild needed — same OS/arch between stages
- Expose port 3000
- `CMD ["node", "packages/server/dist/index.js"]`

## Docker Compose

```yaml
services:
  server:
    build: .
    ports: ["3000:3000"]
    volumes: ["logd-data:/data"]
    environment:
      LOGD_DB_PATH: /data/logd-server.db
      LOGD_API_TOKEN: ${LOGD_API_TOKEN}
      LOGD_OLLAMA_URL: http://ollama:11434
      LOGD_MODEL: ${LOGD_MODEL:-qwen3-embedding:0.6b}
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"]
      interval: 30s
      timeout: 5s
      retries: 3

  ollama:
    image: ollama/ollama
    profiles: ["full"]
    ports: ["11434:11434"]
    volumes: ["ollama-data:/root/.ollama"]

volumes:
  logd-data:
  ollama-data:
```

**Usage:**
- `docker compose up` — server only (user provides external Ollama URL)
- `docker compose --profile full up` — server + Ollama sidecar
- When using external Ollama, override `LOGD_OLLAMA_URL` in `.env`

## Health Check Endpoints

Two public routes (no auth middleware):

### `GET /health` — Liveness
- Returns `200 { "status": "ok" }` unconditionally
- Used by Docker healthcheck

### `GET /health/ready` — Readiness
- Checks DB: `SELECT 1`
- Checks Ollama: `GET {OLLAMA_URL}/api/tags`
- Success: `200 { "status": "ready", "db": "ok", "ollama": "ok" }`
- Failure: `503 { "status": "not_ready", "db": "ok"|"error", "ollama": "ok"|"error" }`

**Routing strategy:** Register health routes on the Hono app *before* the `app.use("*", authMiddleware)` call so they bypass auth. No sub-app or route grouping needed — just ordering.

## Environment & Configuration

**Existing vars (no change):**
| Variable | Default | Description |
|---|---|---|
| `LOGD_PORT` | `3000` | Server port |
| `LOGD_API_TOKEN` | — | Required. Auth token |
| `LOGD_DB_PATH` | `./logd-server.db` | SQLite database path |
| `LOGD_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `LOGD_MODEL` | `qwen3-embedding:0.6b` | Embedding model |

**New:**
- `.env.example` at repo root with all vars and defaults
- Startup validation: warn (not crash) if `LOGD_API_TOKEN` is missing — bootstrap already handles this gracefully by skipping admin creation when no token is set. The token is only required on first run to seed the admin user.

## Documentation

### `packages/server/README.md`
- Brief description: logd server for team collaboration
- Prerequisites (Docker, optionally Ollama)
- Quick start with docker-compose (3-4 commands)
- Env var reference table
- Link to self-hosting guide

### `docs/self-hosting.md`
- Architecture overview (server + SQLite + Ollama)
- Setup options: sidecar vs external Ollama
- Step-by-step VPS deployment
- Volume management & backups
- Connecting CLI to server (`logd login`, project config)
- Troubleshooting

### Root `README.md` update
- Position logd as local-first
- Mention self-hosting and hosted service as team options
- Link to server README and self-hosting guide

## Out of Scope
- Postgres support (future)
- Kubernetes manifests
- CI/CD for image publishing
- TLS termination (use a reverse proxy)
