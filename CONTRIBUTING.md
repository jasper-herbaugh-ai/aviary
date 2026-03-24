# Contributing to Aviary

Thanks for contributing to Aviary.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- For large features, architectural changes, or workflow changes, open an issue first so the approach can be aligned before implementation.
- Keep pull requests focused. Separate unrelated changes into separate PRs.

## Development Setup

### Prerequisites

- Bun `1.3.6`
- Python `3.13`
- `uv`
- Docker, for local PostgreSQL

### Initial setup

1. `bun install`
2. `cp docker/.env.example .env`
3. `docker compose -f docker/docker-compose.yml up -d postgres`
4. `bun run db:generate`
5. `bun run db:migrate:dev`
6. `bun run db:seed`

### Run the services

- API: `bun --filter=@aviary/api run dev`
- Web: `bun --filter=@aviary/web run dev`
- Worker: `cd apps/worker && uv sync && uv run aviary-worker`

Project layout:

- `apps/web`: Next.js frontend
- `apps/api`: TypeScript API server
- `apps/worker`: Python async worker
- `packages/db`: Prisma schema and database utilities
- `packages/types`: shared DTOs and validation schemas
- `packages/playbooks`: built-in playbook manifests

## Development Expectations

- Follow the existing code style and project structure in the area you are changing.
- Update tests and docs when behavior changes.
- Avoid mixing refactors with functional changes unless the refactor is required to land the fix.
- Do not commit secrets, production credentials, or real infrastructure details.

## Validation

Run the checks relevant to your change before opening a pull request.

### Required repository checks

1. `bun run check-version`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run test`

### Worker checks

If you changed `apps/worker`, also run:

1. `cd apps/worker && uv sync`
2. `cd apps/worker && uv run pytest -q`

If you change package versions, update `VERSION` and then run `bun run sync-version`.

## Pull Request Guidelines

- Base your branch on `main`.
- Describe the problem being solved and the chosen approach.
- Link the relevant issue when one exists.
- Call out schema, migration, auth, security, or deployment-impacting changes explicitly.
- Include screenshots or terminal output for user-facing changes when helpful.

## Review Process

Maintainers may request changes before merge. Reviews focus on correctness, security, scope control, operability, and test coverage.

By contributing, you agree that your contributions will be licensed under the repository's AGPLv3 license.
