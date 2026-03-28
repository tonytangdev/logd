# logd

CLI tool and MCP server for logging and semantically searching decisions using local LLM embeddings.

Decisions are stored in a local SQLite database with vector embeddings (via [sqlite-vec](https://github.com/asg017/sqlite-vec)) for semantic search. Embeddings are computed locally using [Ollama](https://ollama.com/) with Qwen3-Embedding-0.6B.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Ollama](https://ollama.com/) running locally with the embedding model:

```bash
ollama pull qwen3-embedding:0.6b
```

## Install

```bash
npm install -g logd
```

Or run from source:

```bash
git clone https://github.com/tonytangdev/logd.git
cd logd
npm install
npm run build
npm link
```

## Usage

### Manage projects

Decisions are scoped by project. Create a project first:

```bash
logd project create "my-app" -d "Main application"
logd project list
```

### Add decisions

```bash
logd add "Use Postgres for persistence" -p my-app -c "Need ACID transactions" -t backend -t database
logd add "Choose React over Vue" -p my-app -a "Vue" -a "Svelte" -t frontend
```

### Search decisions

```bash
logd search "what database did we choose?"
logd search "frontend framework" -p my-app --verbose
logd search "database" --threshold 0.5 --limit 3
```

### View, edit, delete

```bash
logd show <id>
logd edit <id> --status superseded
logd edit <id> -t new-tag-1 -t new-tag-2  # replaces all tags
logd delete <id>
logd list -p my-app --status active
```

## MCP Server

Start the MCP server for AI agent integration:

```bash
logd serve
```

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "logd": {
      "command": "logd",
      "args": ["serve"]
    }
  }
}
```

### Available tools

| Tool | Description |
|---|---|
| `logd_add_decision` | Create a decision |
| `logd_search_decisions` | Semantic search |
| `logd_show_decision` | Get decision by ID |
| `logd_edit_decision` | Partial update |
| `logd_delete_decision` | Delete by ID |
| `logd_list_decisions` | List with filters |
| `logd_create_project` | Create project |
| `logd_list_projects` | List projects |

## Configuration

| Setting | Default | Env var | CLI flag |
|---|---|---|---|
| Ollama URL | `http://localhost:11434` | `LOGD_OLLAMA_URL` | `--ollama-url` |
| Model | `qwen3-embedding:0.6b` | `LOGD_MODEL` | `--model` |
| DB path | `~/.logd/logd.db` | `LOGD_DB_PATH` | `--db-path` |

Precedence: defaults < env vars < CLI flags.

## Architecture

```
src/
  core/     -- business logic, types, config (framework-agnostic)
  infra/    -- SQLite + sqlite-vec, Ollama client
  cli/      -- Commander.js commands
  mcp/      -- MCP server
```

## License

MIT
