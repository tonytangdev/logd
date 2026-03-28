# logd — Decision Logging CLI & MCP Server

A CLI tool and MCP server for logging, searching, and managing decisions using semantic embeddings.

## Problem

Teams and individuals make decisions constantly but rarely record them. When context is needed later ("why did we choose Postgres?"), the knowledge is scattered across Slack, meetings, or lost entirely. AI agents working on codebases lack access to decision history.

## Solution

A CLI tool (`logd`) that stores decisions in a local SQLite database with vector embeddings for semantic search. An MCP server mode lets AI agents store and retrieve decisions directly.

## Data Model

### Projects table

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | TEXT (UUID) | yes | Primary key |
| `name` | TEXT | yes | Unique, normalized (lowercase, trimmed) |
| `description` | TEXT | no | Helps AI agents pick the right project |
| `created_at` | TEXT (ISO 8601) | yes | Auto |

Projects are an explicit registry. Decisions reference a project by name. If the project doesn't exist, the command fails and lists available projects. This prevents project name drift when AI agents create decisions.

### Decisions table

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | TEXT (UUID) | yes | Primary key |
| `project` | TEXT | yes | FK to projects.name, indexed |
| `title` | TEXT | yes | Only required user-provided field |
| `context` | TEXT | no | Why the decision was made |
| `alternatives` | TEXT (JSON array) | no | e.g., `["Option A", "Option B"]` |
| `tags` | TEXT (JSON array) | no | e.g., `["backend", "database"]` |
| `status` | TEXT | yes | Default `active`. Enum: `active`, `superseded`, `deprecated` |
| `links` | TEXT (JSON array) | no | URLs or `decision:<uuid>` references |
| `embedding` | FLOAT32 vector | yes | Computed from structured template |
| `created_at` | TEXT (ISO 8601) | yes | Auto |
| `updated_at` | TEXT (ISO 8601) | yes | Auto |

All optional fields are typically filled by an LLM agent based on the title or a prompt. JSON arrays avoid join tables.

Decisions are mutable: editable and deletable. Edits re-compute the embedding.

## Embedding Strategy

Uses Qwen3-Embedding-0.6B via Ollama (`/api/embed` endpoint).

### Document embedding (storing a decision)

No instruction prefix per Qwen3 spec. Structured template with only present fields:

```
Decision: {title}
Context: {context}
Alternatives: {alternatives joined by ", "}
Tags: {tags joined by ", "}
Status: {status}
```

### Query embedding (searching)

Instruction prefix required per Qwen3 spec:

```
Instruct: Given a question about past decisions, retrieve relevant decision records
Query: {user's search query}
```

### Similarity

Cosine similarity via `sqlite-vec`.

## Configuration

Precedence: defaults -> env vars -> CLI flags.

| Setting | Default | Env var | CLI flag |
|---|---|---|---|
| Ollama URL | `http://localhost:11434` | `LOGD_OLLAMA_URL` | `--ollama-url` |
| Model | `qwen3-embedding:0.6b` | `LOGD_MODEL` | `--model` |
| DB path | `~/.logd/logd.db` | `LOGD_DB_PATH` | `--db-path` |

## CLI Commands

```
logd add <title> [options]          -- create a decision
  --project, -p <name>              -- required, must match existing project
  --context, -c <text>              -- rationale
  --alternatives, -a <text...>      -- repeatable
  --tags, -t <text...>              -- repeatable
  --status, -s <status>             -- default: active
  --links, -l <text...>             -- repeatable

logd search <query> [options]       -- semantic search
  --project, -p <name>              -- filter by project (searches all if omitted)
  --limit, -n <number>              -- default: 5
  --threshold <0-1>                 -- minimum similarity score
  --verbose, -v                     -- full detail output

logd edit <id> [options]            -- update decision (same flags as add)
logd delete <id>                    -- delete a decision

logd list [options]                 -- list decisions
  --project, -p <name>              -- filter by project
  --status, -s <status>             -- filter by status

logd project create <name> [--description, -d <text>]
logd project list

logd serve                          -- start MCP server (stdio)
```

## MCP Server

Started via `logd serve`. Uses stdio transport.

### Tools

| Tool | Description |
|---|---|
| `logd_add_decision` | Create a decision (same params as CLI add) |
| `logd_search_decisions` | Semantic search (query, project?, limit?, threshold?) |
| `logd_edit_decision` | Update a decision by ID |
| `logd_delete_decision` | Delete a decision by ID |
| `logd_list_decisions` | List decisions (project?, status?) |
| `logd_create_project` | Create a project |
| `logd_list_projects` | List available projects |

MCP tools call the same core functions as CLI commands. No duplicated logic.

## Architecture

Layered monolith with clean boundaries:

```
src/
  cli/
    commands/
      add.ts
      search.ts
      edit.ts
      delete.ts
      list.ts
      project.ts
      serve.ts
    index.ts            -- CLI entrypoint, wires up Commander
  core/
    decision.service.ts -- business logic (CRUD, search orchestration)
    embedding.service.ts -- build template, call embedder, return vector
    types.ts            -- Decision, Project, CreateDecisionInput, etc.
  infra/
    db.ts               -- SQLite + sqlite-vec setup, migrations
    ollama.client.ts    -- Ollama /api/embed wrapper
    decision.repo.ts    -- DB queries for decisions
    project.repo.ts     -- DB queries for projects
  mcp/
    server.ts           -- MCP server, maps tools to core functions
bin/
  logd.ts               -- shebang entrypoint
```

### Dependency injection

Core services receive dependencies as constructor params (repos, embedding client). CLI and MCP are thin adapters that instantiate the dependency graph and delegate to core.

## Tech Stack

| Dependency | Purpose |
|---|---|
| `commander` | CLI framework |
| `better-sqlite3` | SQLite driver (sync, fast, well-typed) |
| `sqlite-vec` | Vector extension for SQLite |
| `@modelcontextprotocol/sdk` | MCP server SDK |
| `uuid` | ID generation |
| `vitest` | Test runner |

## Error Handling

| Scenario | Behavior |
|---|---|
| Ollama unavailable | Error: "Cannot connect to Ollama at {url}. Is it running?" |
| Unknown project on add | Error + list existing projects |
| Empty search results | Empty list with message, not an error |
| Edit/delete non-existent ID | Error: "Decision {id} not found" |
| Duplicate project name | Error: "Project '{name}' already exists" |
| No project flag on add | Error: "Project is required. Available projects: ..." |
| DB not initialized | Auto-create DB + run migrations on first use |

## Testing Strategy

- **Unit tests (core/)**: decision service, embedding service. Dependencies injected as mocks.
- **Integration tests (infra/)**: actual SQLite + sqlite-vec. Ollama tests skippable in CI.
- **E2E tests (cli/)**: run actual binary, verify output. Few happy paths.
- **Approach**: TDD red-green-refactor. Behavioral tests with edge cases provided by the developer, implementation follows.
- **Runner**: vitest
