# @logd/server

REST API server for team-based decision logging with semantic search.

## Quick Start (Docker)

1. Copy and configure environment:

   ```bash
   cp .env.example .env
   # Edit .env — set LOGD_API_TOKEN to a secure value
   ```

2. Start the server:

   ```bash
   # With your own Ollama instance
   docker compose up -d

   # Or bundled with Ollama
   docker compose --profile full up -d
   ```

3. Verify it's running:

   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/health/ready
   ```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOGD_PORT` | `3000` | Server port |
| `LOGD_API_TOKEN` | — | Auth token (required on first run to create admin) |
| `LOGD_DB_PATH` | `./logd-server.db` | SQLite database path |
| `LOGD_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `LOGD_MODEL` | `qwen3-embedding:0.6b` | Embedding model |

## Development

```bash
npm run dev          # Start with hot reload
npm test             # Run tests
```

See [self-hosting guide](../../docs/self-hosting.md) for detailed deployment instructions.
