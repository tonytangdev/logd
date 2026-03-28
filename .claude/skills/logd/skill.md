# logd — Decision Logger

Log and search decisions using the logd CLI. Use this skill PROACTIVELY whenever the user makes a decision (e.g., "let's use PostgreSQL", "I'll go with approach B", "we decided to split the service"), even if they don't explicitly ask to log it. Also use when the user asks about past decisions.

TRIGGER when: the user makes or references a technical or process decision during conversation.

## Decision Detection

Watch for these patterns in conversation:

- **Explicit choices:** "let's use X", "we'll go with Y", "I decided Z"
- **Comparative resolutions:** "X over Y because...", "instead of X, let's do Y"
- **Process calls:** "let's split this into 2 PRs", "skip tests for now", "deploy to staging first"
- **Architecture/design:** "we'll structure it as...", "the API will be REST"
- **Rejection of alternatives:** "not X because...", "ruled out Y"

### Ignore (Not Decisions)

- Trivial code choices (variable names, formatting)
- Temporary debugging ("let's add a log here")
- Unresolved exploration ("should we use X?")

### User Overrides

The user can override detection at any time:

- **"save this decision"** or **"log this"** — force save even if not auto-detected
- **"don't log that"** or **"skip"** — dismiss a save prompt
- **"save decisions automatically"** — switch to auto mode: save without asking (lasts for current conversation only, resets to ask mode in new conversations)
- **"ask me before saving"** — switch back to ask mode (default)

## Project Resolution

Before saving a decision, determine which logd project to use:

1. Run `logd project list` to get existing projects
2. Get the current repo name: `basename $(git rev-parse --show-toplevel 2>/dev/null) || basename $(pwd)`
3. Match repo name against project names (case-insensitive, substring match)
4. **One match** — use it. Mention in the prompt: "Save to project `<name>`?"
5. **Multiple matches** — present options, let user pick
6. **No match** — ask: "No matching project. Create `<repo-name>`?" If yes, run `logd project create <repo-name>`

## Save Flow

When a decision is detected (or user forces a save):

1. **Ask** (unless auto mode): "I noticed a decision: *[brief summary]*. Save it to logd?"
2. If approved, **resolve project** (see above)
3. **Build CLI command** — extract from conversation:
   - Title: concise decision statement
   - `-c` context: why the decision was made
   - `-a` alternatives: any alternatives discussed (repeat flag per alternative)
   - `-t` tags: inferred from topic (e.g. "database", "api", "deployment") (repeat flag per tag)
   - `-s` status: omit (defaults to "active") unless user specifies
   - `-l` links: include if relevant URLs were mentioned (repeat flag per link)
4. **Run:** `logd add '<title>' -p <project> -c '<context>' -a '<alt1>' -a '<alt2>' -t '<tag1>'`
   - Use single quotes around values to avoid shell metacharacter issues. Escape any single quotes inside values with `'\''`.
   - Keep title under 80 chars, context under 300 chars. Distill verbose discussions into concise summaries.
5. **Confirm** — parse output for the decision ID and tell the user

## Recall Flow

When the user asks about past decisions ("what did we decide about...", "why did we pick...", "any past decisions on..."):

1. **Resolve project** — same flow as save. If unresolvable, omit `-p` to search all projects
2. **Run:** `logd search "<query>" -v` (add `-p <project>` if resolved). Use default limit (5) and threshold — do not add `--limit` or `--threshold` flags unless the user asks.
3. **Present results** — summarize each decision: title, context, alternatives, date (createdAt)
4. **No results** — tell the user, suggest broadening the query or checking other projects

## Error Handling

- **logd not found** — tell user: "logd CLI not found in PATH. Install it to enable decision logging."
- **Ollama not running** — the CLI will return an error on add/search. Surface the error message to the user.
- **CLI command fails** — show the error output to the user, do not retry silently

## Prerequisites

- `logd` CLI installed and in PATH (`npm install -g logd` or local build)
- Ollama running locally with embedding model (for semantic search)

## Examples

### Proactive Save (Ask Mode)

```
User: Let's use Redis for caching instead of Memcached. Redis has better
      data structures and we might need pub/sub later.

Agent: I noticed a decision: "Use Redis over Memcached for caching." Save it to logd?

User: yes

Agent: [runs logd project list, matches "my-api"]
       [runs logd add "Use Redis over Memcached for caching" -p my-api -c "Better data structures, potential pub/sub need" -a "Memcached" -t "caching" -t "infrastructure"]
       Saved decision abc-123 to project my-api.
```

### User-Forced Save

```
User: log this: we're going with a monorepo structure

Agent: [resolves project, runs logd add "Adopt monorepo structure" -p my-platform -t "architecture"]
       Saved decision def-456 to project my-platform.
```

### Recall

```
User: Why did we choose Redis?

Agent: [runs logd search "why Redis caching choice" -p my-api -v]
       Found a past decision:
       - **Use Redis over Memcached for caching**
         Context: Better data structures, potential pub/sub need
         Alternatives: Memcached
         Tags: caching, infrastructure
         Decided: 2026-03-15
```
