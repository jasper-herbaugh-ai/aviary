#!/usr/bin/env bash
set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH."
  exit 1
fi

bun install

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [[ ! -f .env ]]; then
  echo ".env is required but was not found."
  exit 1
fi

set_env_value() {
  local key="$1"
  local value="$2"
  if rg -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env
  else
    printf "\n%s=%s\n" "$key" "$value" >> .env
  fi
  rm -f .env.bak
}

if [[ -f .env ]]; then
  # Export variables so child processes (bun/tsx) receive DATABASE_URL.
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

jwt_secret="${JWT_SECRET:-}"
if [[ ${#jwt_secret} -lt 16 ]]; then
  new_jwt="$(openssl rand -hex 24)"
  set_env_value "JWT_SECRET" "$new_jwt"
  export JWT_SECRET="$new_jwt"
  echo "Set JWT_SECRET to a generated value meeting minimum length."
fi

credential_key="${CREDENTIAL_ENCRYPTION_KEY:-}"
if [[ ${#credential_key} -lt 32 ]]; then
  new_credential_key="$(openssl rand -hex 32)"
  set_env_value "CREDENTIAL_ENCRYPTION_KEY" "$new_credential_key"
  export CREDENTIAL_ENCRYPTION_KEY="$new_credential_key"
  echo "Set CREDENTIAL_ENCRYPTION_KEY to a generated value meeting minimum length."
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is missing. Set it in .env before running setup."
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  docker compose -f docker/docker-compose.yml up -d postgres
else
  echo "docker is required for postgres startup but was not found in PATH."
  exit 1
fi

bun --filter=@aviary/db run prisma:migrate:dev
bun --filter=@aviary/db run seed

if command -v uv >/dev/null 2>&1; then
  (
    cd apps/worker
    uv sync
  )
else
  echo "uv is required for worker setup but was not found in PATH."
  exit 1
fi
