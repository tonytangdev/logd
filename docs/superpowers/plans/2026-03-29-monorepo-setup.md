# Monorepo Setup & Shared Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure logd from a single-package CLI to an npm workspaces monorepo with shared types, CLI, and server scaffold packages.

**Architecture:** Root workspace orchestrates 3 packages: `@logd/shared` (data types), `@tonytangdev/logd` (CLI, moved from root), `@logd/server` (empty scaffold). CLI re-exports shared types to minimize import churn.

**Tech Stack:** npm workspaces, TypeScript, Biome, Vitest, release-please

**Spec:** `docs/superpowers/specs/2026-03-29-monorepo-setup-design.md` (GitHub issue #33)

**Note:** This is a file-restructuring task, not a feature task. No new logic is written. Success = all existing tests pass, build works, lint passes in the new structure.

---

### Task 1: Create root workspace config and tsconfig.base.json

**Files:**
- Rewrite: `package.json`
- New: `tsconfig.base.json`

- [ ] **Step 1: Save the current package.json content**

You'll need the full content later for `packages/cli/package.json`. Copy it aside (e.g., read it and hold in memory).

Current root `package.json`:
```json
{
  "name": "@tonytangdev/logd",
  "version": "1.1.0",
  "description": "CLI tool & MCP server for logging and semantically searching decisions using local LLM embeddings",
  "main": "dist/src/cli/index.js",
  "files": ["dist/bin/", "dist/src/", "README.md", "LICENSE"],
  "scripts": {
    "format": "biome format --write .",
    "format:check": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "bin": { "logd": "./dist/bin/logd.js" },
  "repository": { "type": "git", "url": "git+https://github.com/tonytangdev/logd.git" },
  "keywords": ["cli", "decisions", "embeddings", "sqlite", "mcp", "ollama", "semantic-search"],
  "author": "Tony Tang",
  "license": "MIT WITH Commons-Clause",
  "type": "commonjs",
  "bugs": { "url": "https://github.com/tonytangdev/logd/issues" },
  "homepage": "https://github.com/tonytangdev/logd#readme",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.28.0",
    "better-sqlite3": "^12.8.0",
    "commander": "^14.0.3",
    "sqlite-vec": "^0.1.7",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.9",
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.5.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 2: Rewrite root package.json**

Replace `package.json` with:
```json
{
  "name": "logd-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "format": "biome format --write .",
    "format:check": "biome check .",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.9"
  }
}
```

Note: `@biomejs/biome` stays at root since `biome.json` is at root and `format:check` runs from root.

- [ ] **Step 3: Create tsconfig.base.json**

Create `tsconfig.base.json` at root:
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

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json
git commit -m "chore: create workspace root and tsconfig.base.json"
```

---

### Task 2: Create `packages/shared/` with extracted types

**Files:**
- New: `packages/shared/package.json`
- New: `packages/shared/tsconfig.json`
- New: `packages/shared/src/types.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p packages/shared/src
```

- [ ] **Step 2: Create packages/shared/package.json**

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
    "@types/node": "^25.5.0",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create packages/shared/tsconfig.json**

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

- [ ] **Step 4: Create packages/shared/src/types.ts**

Extract data types only (lines 1-61 from current `src/core/types.ts`):

```typescript
export const DECISION_STATUSES = [
	"active",
	"superseded",
	"deprecated",
] as const;

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

- [ ] **Step 5: Verify shared package builds**

```bash
cd packages/shared && npx tsc && cd ../..
```

Expected: builds successfully, creates `packages/shared/dist/types.js` and `types.d.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: create @logd/shared package with extracted data types"
```

---

### Task 3: Move CLI to `packages/cli/`

This is the big move. Use `git mv` to preserve history.

**Files:**
- Move: `src/` → `packages/cli/src/`
- Move: `bin/` → `packages/cli/bin/`
- Move: `tests/` → `packages/cli/tests/`
- Move: `vitest.config.ts` → `packages/cli/vitest.config.ts`
- Delete: `tsconfig.json` (replaced by packages/cli/tsconfig.json)

- [ ] **Step 1: Create packages/cli directory**

```bash
mkdir -p packages/cli
```

- [ ] **Step 2: Move source, bin, tests, and vitest config**

```bash
git mv src packages/cli/src
git mv bin packages/cli/bin
git mv tests packages/cli/tests
git mv vitest.config.ts packages/cli/vitest.config.ts
```

- [ ] **Step 3: Create packages/cli/package.json**

This is the full original package.json with `@logd/shared` added:

```json
{
  "name": "@tonytangdev/logd",
  "version": "1.1.0",
  "description": "CLI tool & MCP server for logging and semantically searching decisions using local LLM embeddings",
  "main": "dist/src/cli/index.js",
  "files": [
    "dist/bin/",
    "dist/src/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "format": "biome format --write .",
    "format:check": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc"
  },
  "bin": {
    "logd": "./dist/bin/logd.js"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/tonytangdev/logd.git"
  },
  "keywords": [
    "cli",
    "decisions",
    "embeddings",
    "sqlite",
    "mcp",
    "ollama",
    "semantic-search"
  ],
  "author": "Tony Tang",
  "license": "MIT WITH Commons-Clause",
  "type": "commonjs",
  "bugs": {
    "url": "https://github.com/tonytangdev/logd/issues"
  },
  "homepage": "https://github.com/tonytangdev/logd#readme",
  "dependencies": {
    "@logd/shared": "*",
    "@modelcontextprotocol/sdk": "^1.28.0",
    "better-sqlite3": "^12.8.0",
    "commander": "^14.0.3",
    "sqlite-vec": "^0.1.7",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.5.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 4: Create packages/cli/tsconfig.json**

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

- [ ] **Step 5: Copy README.md, LICENSE, CHANGELOG.md to packages/cli/**

The CLI's `"files"` array references `README.md` and `LICENSE` relative to the package dir. These must exist in `packages/cli/` for npm publish.

```bash
cp README.md packages/cli/README.md
cp LICENSE packages/cli/LICENSE
cp CHANGELOG.md packages/cli/CHANGELOG.md
```

Keep the originals at root too (for the GitHub repo landing page).

- [ ] **Step 6: Delete old tsconfig.json from root**

```bash
git rm tsconfig.json
```

- [ ] **Step 7: Commit the move**

```bash
git add packages/cli/ && git add -u
git commit -m "chore: move CLI source to packages/cli/"
```

---

### Task 4: Update CLI types.ts to re-export from @logd/shared

**Files:**
- Modify: `packages/cli/src/core/types.ts`

- [ ] **Step 1: Replace the data types with re-exports**

Replace lines 1-61 of `packages/cli/src/core/types.ts` (the data types) with re-exports from `@logd/shared`. Keep lines 63-121 (CLI-only interfaces) as-is.

New file content:

```typescript
export {
	DECISION_STATUSES,
	type CreateDecisionInput,
	type Decision,
	type DecisionStatus,
	type Project,
	type SearchInput,
	type SearchResult,
	type UpdateDecisionInput,
} from "@logd/shared";

export interface IProjectRepo {
	create(project: Project): void;
	findByName(name: string): Project | null;
	list(): Project[];
}

export interface IDecisionRepo {
	create(decision: Decision, embedding: number[]): void;
	findById(id: string): Decision | null;
	update(id: string, input: UpdateDecisionInput, embedding?: number[]): void;
	delete(id: string): void;
	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Decision[];
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): SearchResult[];
}

export interface IEmbeddingClient {
	embed(input: string): Promise<number[]>;
}

export interface DecisionBackend {
	create(decision: Decision, embedding: number[]): Promise<void>;
	findById(id: string): Promise<Decision | null>;
	update(
		id: string,
		input: UpdateDecisionInput,
		embedding?: number[],
	): Promise<void>;
	delete(id: string): Promise<void>;
	list(options?: {
		project?: string;
		status?: DecisionStatus;
		limit?: number;
	}): Promise<Decision[]>;
}

export interface LocalDecisionSearch {
	searchByVector(
		embedding: number[],
		limit: number,
		project?: string,
	): Promise<SearchResult[]>;
}

export interface RemoteDecisionSearch {
	searchByQuery(
		project: string,
		query: string,
		threshold: number,
		limit: number,
	): Promise<SearchResult[]>;
}
```

- [ ] **Step 2: Install workspace dependencies**

```bash
npm install
```

This links `@logd/shared` into `packages/cli/node_modules/` via symlink.

- [ ] **Step 3: Build shared first, then CLI**

```bash
npm run build -w packages/shared
npm run build -w packages/cli
```

Expected: both build successfully

- [ ] **Step 4: Run CLI tests**

```bash
npm run test -w packages/cli
```

Expected: all tests pass (191 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/core/types.ts package-lock.json
git commit -m "refactor: CLI types.ts re-exports from @logd/shared"
```

---

### Task 5: Create server scaffold

**Files:**
- New: `packages/server/package.json`
- New: `packages/server/tsconfig.json`

- [ ] **Step 1: Create directory**

```bash
mkdir -p packages/server
```

- [ ] **Step 2: Create packages/server/package.json**

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
    "@types/node": "^25.5.0",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Create packages/server/tsconfig.json**

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

- [ ] **Step 4: Run npm install to link**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/
git commit -m "chore: create @logd/server scaffold package"
```

---

### Task 6: Add release-please config files

**Files:**
- New: `release-please-config.json`
- New: `.release-please-manifest.json`

- [ ] **Step 1: Create release-please-config.json**

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

- [ ] **Step 2: Create .release-please-manifest.json**

```json
{
  "packages/cli": "1.1.0"
}
```

- [ ] **Step 3: Commit**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "chore: add release-please monorepo config"
```

---

### Task 7: Update CI workflow

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read current CI workflow**

Read `.github/workflows/ci.yml` to understand current structure.

- [ ] **Step 2: Update the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run build
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run test -w packages/cli -- --exclude 'src/cli/commands/*.test.ts' --exclude 'tests/e2e/**'

  release-please:
    needs: [check, test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
    permissions:
      contents: write
      pull-requests: write
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    environment: npm-publish
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm publish -w packages/cli --provenance --access public
```

Key changes from current:
- `check`: `npm run typecheck` moved after `npm run build` (shared must build first for CLI typecheck to work)
- `test`: uses `-w packages/cli` to target CLI workspace
- `release-please`: uses `config-file` and `manifest-file` instead of `release-type`
- `publish`: uses `npm publish -w packages/cli`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: update workflow for monorepo structure"
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Clean install from scratch**

```bash
rm -rf node_modules packages/*/node_modules packages/*/dist
npm install
```

- [ ] **Step 2: Build all packages**

```bash
npm run build
```

Expected: all packages build (shared first, then cli — npm workspaces handles order based on deps)

- [ ] **Step 3: Run CLI tests**

```bash
npm run test -w packages/cli
```

Expected: all 191 tests pass

- [ ] **Step 4: Run lint**

```bash
npm run format:check
```

Expected: no issues

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Smoke test CLI**

```bash
npx tsx packages/cli/bin/logd.ts project list
npx tsx packages/cli/bin/logd.ts server list
```

Expected: works as before

- [ ] **Step 7: Verify .gitignore covers new dist dirs**

Check that `dist` in `.gitignore` covers `packages/*/dist/`. Since the pattern is just `dist`, git ignores any directory named `dist` at any level — this already works.

- [ ] **Step 8: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: monorepo setup complete — all tests pass"
```

- [ ] **Step 9: Close GitHub issue**

```bash
gh issue close 33 --repo tonytangdev/logd --comment "Monorepo setup complete"
```
