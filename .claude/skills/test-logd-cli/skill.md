# Test logd CLI

End-to-end test of all CLI commands against real Ollama + temp SQLite DB.

**Prerequisites:** Ollama running locally with `qwen3-embedding:0.6b` model pulled.

## Instructions

1. Build the project: `npm run build`
2. Create a temp DB path: `LOGD_DB_PATH="/tmp/logd-test-$(date +%s).db"`
3. Run the test script below against the built binary at `dist/bin/logd.js`
4. Report results in a table with command, test name, expected exit, actual exit, pass/fail
5. Note any UX issues (stack traces, format inconsistencies, unexpected output)

## Test Script

Run each test sequentially. Use `node dist/bin/logd.js` as the binary. Pass `LOGD_DB_PATH` env var for every invocation.

### Project commands
| # | Test | Command | Expected exit |
|---|------|---------|---------------|
| 1 | project create (happy) | `project create testproj -d "desc"` | 0 |
| 2 | project create (no desc) | `project create minimal` | 0 |
| 3 | project list | `project list` | 0 |
| 4 | project create (duplicate) | `project create testproj` | 1 |
| 5 | project create (no args) | `project create` | 1 |

### Decision commands
| # | Test | Command | Expected exit |
|---|------|---------|---------------|
| 6 | add (full flags) | `add "Use Postgres" -p testproj -c "context" -a "MySQL" -t "db" -s active -l "https://pg.org"` | 0 |
| 7 | add (minimal) | `add "Use TS" -p testproj` | 0 |
| 8 | add (missing -p) | `add "No project"` | 1 |
| 9 | add (bad project) | `add "Ghost" -p nonexistent` | 1 |
| 10 | show (happy) | `show <id from #6>` | 0 |
| 11 | show (bad id) | `show fake-id` | 1 |
| 12 | edit (happy) | `edit <id from #6> --title "Use Postgres 16" -s superseded` | 0 |
| 13 | edit (bad id) | `edit fake-id --title "Nope"` | 1 |
| 14 | list (all) | `list` | 0 |
| 15 | list (by project) | `list -p testproj` | 0 |
| 16 | list (by status) | `list -s active` | 0 |
| 17 | list (limit) | `list -n 1` | 0 |
| 18 | delete (happy) | `delete <id from #7>` | 0 |
| 19 | delete (verify gone) | `show <id from #7>` | 1 |
| 20 | delete (bad id) | `delete fake-id` | 1 |

### Search commands
| # | Test | Command | Expected exit |
|---|------|---------|---------------|
| 21 | search (happy) | `search "database choice"` | 0 |
| 22 | search (by project) | `search "database" -p testproj` | 0 |
| 23 | search (verbose) | `search "deployment" -v` | 0 |
| 24 | search (high threshold) | `search "quantum physics" -t 0.99` | 0 |

### MCP serve
| # | Test | Command | Expected exit |
|---|------|---------|---------------|
| 25 | serve (MCP init) | pipe JSON-RPC initialize message into `serve`, verify valid response | 0 |

## Known Issues to Watch For

- **Raw stack traces**: error paths show full Node.js stack traces instead of clean messages
- **updatedAt format**: after edit, `updatedAt` uses `YYYY-MM-DD HH:MM:SS` instead of ISO 8601
- **Negative similarity scores**: search can return results with negative cosine similarity
