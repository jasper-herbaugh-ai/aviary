# Setup

## Prerequisites

- Node.js 22+
- Bun 1.3+
- uv
- Python 3.13+
- Docker (optional for local postgres)

## Local development

1. `cp .env.example .env`
2. `docker compose -f docker/docker-compose.yml up -d postgres`
3. `bun install`
4. `bun run db:migrate:dev -- --name init` (or rely on API startup migration deploy)
5. `bun run db:generate`
6. `bun run db:seed`
7. Start services:
   - API: `bun --filter=@aviary/api run dev`
   - Web: `bun --filter=@aviary/web run dev`
   - Worker: `cd apps/worker && uv sync && uv run aviary-worker`
8. First auth flow:
   - If no users exist, open `http://localhost:3000/setup` to create the first admin
   - The setup page auto-detects and stores WebAuthn (`rpId`, `rpName`, `origin`) and TOTP issuer defaults in `app_config`
   - Then sign in at `http://localhost:3000/sign-in`
   - Optional TOTP MFA and WebAuthn passkeys can be enabled from `Automation Settings -> Security` in the web UI

## WebAuthn configuration

For passkeys in non-localhost deployments, you can configure:
- `WEBAUTHN_RP_ID` (your domain, e.g. `aviary.example.com`)
- `WEBAUTHN_RP_NAME` (display name in authenticator prompts)
- `WEBAUTHN_ORIGIN` (full HTTPS origin, e.g. `https://aviary.example.com`)

These are optional when the request host/origin can be inferred; first-run setup can persist resolved defaults to `app_config`.

`MIGRATE_ON_STARTUP=true` (default) makes the API run `prisma migrate deploy` before listening.

## PostgreSQL major upgrade reset

If you previously ran an older PostgreSQL major version (for example 16/17) and switch to PostgreSQL 18, drop the old volume before starting Postgres:

`docker compose -f docker/docker-compose.yml down -v`
