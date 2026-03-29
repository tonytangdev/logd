# Phase 2c: Monorepo Setup & Shared Types

> GitHub issue: #33

## Context

logd is currently a single-package CLI. Phase 2 adds a server (Phase 2a, #34). Both need shared data types. This spec restructures the repo as an npm workspace monorepo.

## Decisions Made

- **npm workspaces** — already using npm, 3 packages doesn't justify switching to pnpm/turborepo
- **CLI moves to `packages/cli/`** — clean separation, root is workspace-only
- **Data types only in shared** — `Decision`, `Project`, etc. No interfaces (`IDecisionRepo`, `DecisionBackend`) — those are CLI-internal
- **Re-export from CLI's types.ts** — minimizes import churn across CLI source files

## 1. Package Structure

```
logd/
  package.json          # workspace root, "workspaces": ["packages/*"]
  tsconfig.base.json    # shared TS compiler options
  packages/
    shared/
      package.json      # @logd/shared (private, not published)
      src/types.ts      # data types
      tsconfig.json
    cli/
      package.json      # @tonytangdev/logd (published to npm)
      bin/logd.ts
      src/              # existing CLI code
      tsconfig.json
    server/
      package.json      # @logd/server (scaffold for Phase 2a)
      tsconfig.json
```

## 2. Shared Package (`@logd/shared`)

Extracted from `src/core/types.ts` — data types only:

```typescript
// packages/shared/src/types.ts
export const DECISION_STATUSES = ["active", "superseded", "deprecated"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface Decision {
  id: string;
  project: string;
  title: string;
  context: string | null;
  alternatives: string[] | null;
  tags: string[] | null;
  status: DecisionStatus;
  links: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  server: string | null;
  team: string | null;
}

export interface CreateDecisionInput {
  project: string;
  title: string;
  context?: string;
  alternatives?: string[];
  tags?: string[];
  status?: DecisionStatus;
  links?: string[];
}

export interface UpdateDecisionInput {
  project?: string;
  title?: string;
  context?: string;
  alternatives?: string[];
  tags?: string[];
  status?: DecisionStatus;
  links?: string[];
}

export interface SearchInput {
  query: string;
  project?: string;
  limit?: number;
  threshold?: number;
}

export interface SearchResult {
  decision: Decision;
  score: number;
}
```

`package.json`:
```json
{
  "name": "@logd/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/types.js",
  "types": "dist/types.d.ts",
  "scripts": {
    "build": "tsc"
  }
}
```

## 3. CLI Package Changes

`packages/cli/src/core/types.ts` becomes:

```typescript
// Re-export shared types (minimizes import churn across CLI files)
export {
  DECISION_STATUSES,
  type Decision,
  type DecisionStatus,
  type Project,
  type CreateDecisionInput,
  type UpdateDecisionInput,
  type SearchInput,
  type SearchResult,
} from "@logd/shared";

// CLI-only interfaces stay here
export interface IProjectRepo { ... }
export interface IDecisionRepo { ... }
export interface IEmbeddingClient { ... }
export interface DecisionBackend { ... }
export interface LocalDecisionSearch { ... }
export interface RemoteDecisionSearch { ... }
```

No other CLI source files need import changes — they all import from `./types.js` already.

`packages/cli/package.json` adds:
```json
{
  "dependencies": {
    "@logd/shared": "*"
  }
}
```

npm workspaces resolves this to the local `packages/shared/` via symlink.

## 4. TypeScript Config

`tsconfig.base.json` at root:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Each package's `tsconfig.json` extends it:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

## 5. Server Scaffold (`@logd/server`)

Empty package, ready for Phase 2a:

```json
{
  "name": "@logd/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "@logd/shared": "*"
  }
}
```

No source code yet — just `package.json` and `tsconfig.json`.

## 6. Root Workspace Config

`package.json`:
```json
{
  "name": "logd-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

## 7. Migration Strategy

1. Create workspace structure (root package.json, tsconfig.base.json)
2. Create `packages/shared/` with extracted types
3. Move all existing source/tests/config to `packages/cli/`
4. Update CLI's `types.ts` to re-export from `@logd/shared`
5. Create `packages/server/` scaffold
6. Update root scripts
7. Update GitHub Actions workflows if any (update paths)
8. Verify: `npm install`, `npm run build`, `npm test` all pass

**Key risk**: `@tonytangdev/logd` npm publish must point to `packages/cli/`. The `bin` field and release workflow need updating.

## 8. File Changes

| Action | Path | What |
|--------|------|------|
| New | `package.json` (root) | Workspace config |
| New | `tsconfig.base.json` | Shared TS options |
| New | `packages/shared/package.json` | `@logd/shared` |
| New | `packages/shared/src/types.ts` | Extracted data types |
| New | `packages/shared/tsconfig.json` | Extends base |
| Move | `packages/cli/*` | All existing source, tests, bin, config |
| Edit | `packages/cli/package.json` | Add `@logd/shared` dep, update paths |
| Edit | `packages/cli/src/core/types.ts` | Re-export from `@logd/shared`, keep CLI interfaces |
| Edit | `packages/cli/tsconfig.json` | Extend base |
| New | `packages/server/package.json` | Scaffold |
| New | `packages/server/tsconfig.json` | Extends base |
| Edit | `.github/` | Update workflow paths if needed |

## Out of Scope

- Server implementation (Phase 2a, #34)
- Team management (Phase 2b, #35)
- Deployment (Phase 2d, #36)
