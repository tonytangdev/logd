# Contributing to logd

Thanks for your interest in contributing! This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## How to Contribute

### Reporting Bugs

Open an issue using the **Bug report** template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

### Suggesting Features

Open an issue using the **Feature request** template.

### Submitting Changes

1. Fork the repo
2. Create a branch from `main` (`git checkout -b my-feature`)
3. Install dependencies: `npm install`
4. Make your changes
5. Run checks before committing:

```bash
npm run format:check
npm run typecheck
npm run build
npm test
```

6. Commit with a clear message
7. Push and open a pull request against `main`

### Development Setup

Prerequisites:

- Node.js >= 22
- [Ollama](https://ollama.com/) running locally with `qwen3-embedding:0.6b`

```bash
git clone https://github.com/tonytangdev/logd.git
cd logd
npm install
npm run build
```

Run all tests:

```bash
npm test
```

Run unit tests only (exclude CLI e2e and integration tests):

```bash
npm test -- --exclude 'src/cli/commands/*.test.ts' --exclude 'tests/e2e/**'
```

Format code:

```bash
npm run format
```

### Project Structure

```
src/
├── core/           # Business logic, types, config (framework-agnostic)
│   ├── config.ts
│   ├── decision.ts
│   ├── project.ts
│   └── types.ts
├── infra/          # SQLite + sqlite-vec, Ollama client
│   ├── db.ts
│   └── ollama.ts
├── cli/            # Commander.js commands
│   ├── index.ts
│   └── commands/
└── mcp/            # MCP server
    └── index.ts
```

### Code Style

- This project uses [Biome](https://biomejs.dev/) for formatting and linting
- Run `npm run format` to auto-fix formatting
- Run `npm run format:check` to check without modifying files

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(core): add status field to decisions`
- `fix(infra): handle Ollama connection timeout`
- `docs: update CLI usage examples`

### Testing

- Tests use [Vitest](https://vitest.dev/)
- Unit tests: colocated with source files (`*.test.ts`)
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

Run specific test file:

```bash
npm test -- src/core/decision.test.ts
```

Run with watch mode:

```bash
npm test -- --watch
```

### Pull Request Guidelines

- Keep PRs focused on a single change
- Include tests for new functionality
- Ensure all CI checks pass
- Update documentation if applicable
- Reference related issues in PR description

## License

By contributing, you agree that your contributions will be licensed under the same [MIT with Commons Clause](LICENSE) license as the project.
