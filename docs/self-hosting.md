# Self-Hosting logd

## Architecture

logd server is a Node.js HTTP API backed by SQLite (with sqlite-vec for vector search) and Ollama for embeddings.

```
┌─────────┐     ┌──────────┐     ┌────────┐
│  CLI /  │────▶│  logd    │────▶│ Ollama │
│  MCP    │     │  server  │     │        │
└─────────┘     └────┬─────┘     └────────┘
                     │
                ┌────▼─────┐
                │  SQLite  │
                │ +vec ext │
                └──────────┘
```

## Prerequisites

- Docker and Docker Compose
- (Optional) Ollama — bundled via compose profile or bring your own

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/tonytangdev/logd.git
cd logd
cp .env.example .env
```

Edit `.env`:
- `LOGD_API_TOKEN` — set a strong secret. Required on first run to create the admin user and token.
- `LOGD_OLLAMA_URL` — if using an external Ollama instance, set its URL here.

### 2. Start services

**Option A: Server only** (bring your own Ollama)

```bash
docker compose up -d
```

**Option B: Server + Ollama** (fully self-contained)

```bash
docker compose --profile full up -d
# Pull the embedding model
docker compose exec ollama ollama pull qwen3-embedding:0.6b
```

### 3. Verify

```bash
# Liveness
curl http://localhost:3000/health

# Readiness (checks DB + Ollama)
curl http://localhost:3000/health/ready
```

## Connecting the CLI

```bash
# Store credentials
logd login http://your-server:3000 --token YOUR_API_TOKEN

# Create a remote project
logd project create my-project --server http://your-server:3000 --team default

# Use normally — decisions sync to server
logd add "Use Redis for caching" -p my-project
```

## Data & Backups

Data is stored in a Docker volume (`logd-data`). To back up:

```bash
# Copy the SQLite database out of the volume
docker compose cp server:/data/logd-server.db ./backup.db
```

To restore, copy the file back and restart.

## Volumes

| Volume | Purpose |
|--------|---------|
| `logd-data` | SQLite database |
| `ollama-data` | Ollama models (only with `full` profile) |

## Troubleshooting

**`/health/ready` shows `ollama: "error"`**
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- If using the sidecar, ensure you pulled the model: `docker compose exec ollama ollama pull qwen3-embedding:0.6b`
- If using external Ollama, verify `LOGD_OLLAMA_URL` in `.env`

**Bootstrap didn't create admin user**
- `LOGD_API_TOKEN` must be set on the very first run. If the DB already exists, delete the volume and restart: `docker compose down -v && docker compose up -d`

**Permission errors on volume**
- Ensure the data directory is writable. The container runs as the default node user.
