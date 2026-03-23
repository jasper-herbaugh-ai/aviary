# SSH Orchestration Platform

Monorepo for an agent-less SSH orchestration platform:
- `apps/web`: Next.js frontend
- `apps/api`: TypeScript API server
- `apps/worker`: Python async worker
- `packages/db`: Prisma schema and client
- `packages/types`: shared DTOs and validation schemas
- `packages/playbooks`: built-in playbook manifests

## Quick start

1. Install deps: `bun install`
2. Copy env: `cp .env.example .env`
3. Start infra: `docker compose -f docker/docker-compose.yml up -d postgres`
4. Run migrations (or let API startup apply deploy migrations): `bun run db:migrate:dev`
5. Seed data: `bun run db:seed`
6. Start services:
   - API: `bun --filter=@aviary/api run dev`
   - Web: `bun --filter=@aviary/web run dev`
   - Worker: `cd apps/worker && uv sync && uv run aviary-worker`
7. Open the web app:
   - First launch with no users: go to `/setup` to create bootstrap admin
   - Afterwards: sign in at `/sign-in` (password, TOTP MFA, or passwordless passkey)
   - Manage security and OIDC settings under `/automation/settings/security`
   - Configure alert delivery backend under `/automation/settings/alerts-backend`

`MIGRATE_ON_STARTUP=true` (default) makes the API run `prisma migrate deploy` before listening.

If you upgrade PostgreSQL major versions, reset the local Postgres volume first:
`docker compose -f docker/docker-compose.yml down -v`

## Testing

- TypeScript: `bun run test`
- Python worker: `cd apps/worker && uv run pytest -q`
