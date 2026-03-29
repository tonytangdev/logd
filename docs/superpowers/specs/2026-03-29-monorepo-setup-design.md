# Phase 2c: Monorepo Setup & Shared Types

> GitHub issue: #33

## Context

logd is currently a single-package CLI (`@tonytangdev/logd`), using CommonJS (`"type": "commonjs"`), TypeScript with Node16 module resolution, Biome for formatting, Vitest for tests. Published to npm via release-please + GitHub Actions.

Phase 2 adds a server (Phase 2a, #34). Both need shared data types. This spec restructures the repo as an npm workspace monorepo.

## Decisions Made

- **npm workspaces** — already using npm, 3 packages doesn't justify switching to pnpm/turborepo
- **CLI moves to `packages/cli/`** — clean separation, root is workspace-only
- **Data types only in shared** — `Decision`, `Project`, etc. No interfaces (`IDecisionRepo`, `DecisionBackend`) — those are CLI-internal
- **Re-export from CLI's types.ts** — minimizes import churn across CLI source files
- **All packages use CommonJS** — matching the existing CLI module system to avoid CJS/ESM interop issues

## 1. Package Structure

```
logd/
  package.json          # workspace root, "workspaces": ["packages/*"]
  tsconfig.base.json    # shared TS compiler options
  biome.json            # stays at root, applies to all packages
  .github/              # stays at root
  packages/
    shared/
      package.json      # @logd/shared (private, not published)
      src/types.ts      # data types
      tsconfig.json
    cli/
      package.json      # @tonytangdev/logd (published to npm)
      bin/logd.ts
      src/              # existing CLI code
      tests/            # existing e2e tests
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
  "type": "commonjs",
  "main": "dist/types.js",
  "types": "dist/types.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types.d.ts",
      "default": "./dist/types.js"
    }
  },
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^6.0.2"
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

`packages/cli/package.json` — the full current `package.json` moves here with these changes:
- Add `"@logd/shared": "*"` to dependencies
- Keep all existing fields: `name`, `version`, `description`, `bin`, `files`, `repository`, `keywords`, `author`, `license`, `type`, `bugs`, `homepage`
- `bin` stays `"logd": "./dist/bin/logd.js"` (unchanged)
- Keep `format:check`, `typecheck`, `test`, `build` scripts

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "bin/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Note: `rootDir` stays `"."` (not `"src"`) because `bin/logd.ts` is outside `src/`. This matches the current tsconfig.

## 4. TypeScript Config

`tsconfig.base.json` at root — carries forward all existing options:
```json
{
  "compilerOptions": {
    "types": ["node"],
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Shared package tsconfig:
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
  "type": "commonjs",
  "dependencies": {
    "@logd/shared": "*"
  },
  "devDependencies": {
    "typescript": "^6.0.2"
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
    "format:check": "biome check .",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

`biome.json` stays at root — Biome applies to all packages from the root.

## 7. CI Workflow Changes

`.github/workflows/ci.yml` needs these updates:

**check job:**
- `npm run format:check` — works from root (biome at root)
- `npm run typecheck` — delegates to workspaces
- `npm run build` — delegates to workspaces

**test job:**
- `npm run test -w packages/cli` — runs CLI tests only (shared has no tests, server is scaffold)
- Exclude patterns update: `--exclude 'src/cli/commands/*.test.ts' --exclude 'tests/e2e/**'` (paths relative to packages/cli/)

**release-please job:**
- Add `release-please-config.json` at root:
```json
{
  "packages": {
    "packages/cli": {
      "release-type": "node",
      "package-name": "@tonytangdev/logd"
    }
  }
}
```
- Add `.release-please-manifest.json` at root:
```json
{
  "packages/cli": "1.1.0"
}
```
- Update action config to use `config-file` and `manifest-file` instead of `release-type`

**publish job:**
- Change `npm publish` to `npm publish -w packages/cli --provenance --access public`

## 8. Migration Strategy

1. Create workspace structure (root package.json, tsconfig.base.json)
2. Create `packages/shared/` with extracted types
3. Move all existing source/tests/bin/config to `packages/cli/`
4. Move `biome.json` stays at root
5. Update CLI's `types.ts` to re-export from `@logd/shared`
6. Update CLI's `tsconfig.json` to extend base
7. Create `packages/server/` scaffold
8. Update root scripts
9. Add release-please config files
10. Update CI workflow
11. Run `npm install`, `npm run build`, `npm test` — all must pass

## 9. File Changes

| Action | Path | What |
|--------|------|------|
| Rewrite | `package.json` (root) | Workspace config, private |
| New | `tsconfig.base.json` | Shared TS options (from current tsconfig) |
| Keep | `biome.json` | Stays at root |
| New | `release-please-config.json` | Per-package release config |
| New | `.release-please-manifest.json` | Version tracking |
| New | `packages/shared/package.json` | `@logd/shared`, CJS |
| New | `packages/shared/src/types.ts` | Extracted data types |
| New | `packages/shared/tsconfig.json` | Extends base |
| Move | `packages/cli/*` | All existing source, tests, bin |
| Edit | `packages/cli/package.json` | Add `@logd/shared` dep |
| Edit | `packages/cli/src/core/types.ts` | Re-export from `@logd/shared` |
| Edit | `packages/cli/tsconfig.json` | Extend base, keep rootDir "." |
| New | `packages/server/package.json` | Scaffold, CJS |
| New | `packages/server/tsconfig.json` | Extends base |
| Edit | `.github/workflows/ci.yml` | Update all job paths and scripts |

## Out of Scope

- Server implementation (Phase 2a, #34)
- Team management (Phase 2b, #35)
- Deployment (Phase 2d, #36)
- CJS→ESM migration (can be done later across all packages)
