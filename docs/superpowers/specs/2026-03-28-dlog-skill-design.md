# dlog Skill Design

**Date:** 2026-03-28
**Status:** Draft

## Overview

A Claude Code skill that proactively detects decisions during conversations and saves them to logd via the CLI. Also recalls past decisions when relevant. Distributed as a single `skill.md` file installable via skillsh.

**Location:** `.claude/skills/dlog/skill.md`

## Skill Trigger & Detection

The skill is proactive — it activates without user invocation. The agent watches for technical and process decisions during normal conversation.

### Detection Heuristics

The agent looks for:

- **Explicit choices:** "let's use X", "we'll go with Y", "I decided Z"
- **Comparative resolutions:** "X over Y because...", "instead of X, let's do Y"
- **Process calls:** "let's split this into 2 PRs", "skip tests for now", "deploy to staging first"
- **Architecture/design:** "we'll structure it as...", "the API will be REST"
- **Rejection of alternatives:** "not X because...", "ruled out Y"

### What NOT to Detect (Noise Avoidance)

- Trivial code choices (variable names, formatting)
- Temporary debugging decisions ("let's add a log here")
- Questions/exploration that haven't resolved yet ("should we use X?")

### User Overrides

- **Force save:** "save this decision", "log this" — saves even if agent didn't detect it
- **Force skip:** "don't log that", "skip" — dismisses a save prompt
- **Auto mode:** "save decisions automatically" — stops asking, saves silently (session-only, resets to ask mode on new conversation)
- **Ask mode:** "ask me before saving" — switches back to asking before each save

## Project Resolution Flow

When saving a decision, the skill determines which logd project to use:

1. **Fetch existing projects** — run `logd project list`
2. **Infer match** — compare current repo name (from git or pwd) against existing project names. Use agent judgment for fuzzy matching (substring, case-insensitive). E.g. repo `my-api-service` could match project `my-api-service` or `api-service`
3. **If one clear match** — use it, mention which project in the ask prompt ("Save this to project `my-api-service`?")
4. **If multiple possible matches** — present them as options, let user pick
5. **If no match** — ask the user: "No matching project found. Create `<repo-name>` as a new project?" If yes, run `logd project create <name>` then proceed with the save

## Save Flow

When a decision is detected (or user forces a save):

1. **Ask the user** (unless in auto mode): "I noticed a decision: *[brief summary]*. Save it to logd?"
2. **If user approves**, resolve the project (project resolution flow above)
3. **Build the CLI command** with context extracted from conversation:
   - `--title` — concise decision statement
   - `-c/--context` — why the decision was made
   - `-a/--alternatives` — any alternatives that were discussed
   - `-t/--tags` — inferred from topic (e.g. "database", "api", "deployment")
   - `-s/--status` — defaults to "active", omit unless user specifies otherwise
   - `-l/--links` — include if relevant URLs were mentioned in conversation
4. **Run:** `logd add "title" -p project -c "context" -a "alt1" -a "alt2" -t "tag1"`
5. **Confirm** to the user — parse the CLI output to extract the decision ID

## Recall Flow

When the user asks about past decisions:

1. **Detect recall intent** — questions about past choices, "what did we decide", "why did we pick", references to prior decisions
2. **Resolve project** — same project resolution flow as save. If project can't be resolved, search across all projects (omit `-p` flag)
3. **Run:** `logd search "<query>" -v` (with `-p <project>` if resolved). Use default limit (5) and threshold.
4. **Present results** — summarize relevant decisions found, quoting key details (title, context, alternatives, createdAt timestamp)
5. **If no results** — tell the user nothing was found, suggest broadening the query or checking other projects

## Skill File Structure

Single file `.claude/skills/dlog/skill.md` containing:

1. Skill metadata — name, description, trigger conditions
2. Decision detection — heuristics + what to ignore + user overrides
3. Project resolution — the infer/match/create flow
4. Save flow — ask → resolve project → build CLI → execute → confirm
5. Recall flow — detect intent → search → present results
6. Prerequisites — logd CLI installed and in PATH, Ollama running
7. Examples — 2-3 concrete conversation snippets showing the skill in action

## Examples

### Example 1: Proactive Save

```
User: Let's use Redis for caching instead of Memcached. Redis has better data structures
       and we might need pub/sub later.

Agent: I noticed a decision: "Use Redis over Memcached for caching." Save it to logd?

User: yes

Agent: [resolves project, runs logd add]
       Saved decision abc123 to project my-api.
```

### Example 2: User-Forced Save

```
User: save this decision: we're going with a monorepo structure

Agent: [resolves project, runs logd add]
       Saved decision def456 to project my-platform.
```

### Example 3: Recall

```
User: Why did we choose Redis?

Agent: [runs logd search "why Redis" -p my-api -v]
       Found a past decision:
       - "Use Redis over Memcached for caching"
         Context: Better data structures, potential need for pub/sub
         Alternatives: Memcached
         Decided: 2026-03-15
```

## Error Handling

- **logd CLI not found** — inform user: "logd CLI not found in PATH. Install it to enable decision logging."
- **Ollama not running** — the CLI will return an error on add/search. Surface the error message to the user.
- **CLI command fails** — show the error output, do not retry silently.

## Prerequisites

- `logd` CLI installed and available in PATH
- Ollama running locally with embedding model (for semantic search)
