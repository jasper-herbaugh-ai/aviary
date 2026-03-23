#!/usr/bin/env bash
set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH."
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (set it in .env)."
  exit 1
fi

jwt_secret="${JWT_SECRET:-}"
if [[ ${#jwt_secret} -lt 16 ]]; then
  echo "JWT_SECRET must be at least 16 characters (apps/api/src/env.ts)."
  exit 1
fi

credential_key="${CREDENTIAL_ENCRYPTION_KEY:-}"
if [[ ${#credential_key} -lt 32 ]]; then
  echo "CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters (apps/api/src/env.ts)."
  exit 1
fi

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}

trap cleanup EXIT INT TERM

bun --filter=@aviary/api run dev &
pids+=("$!")

bun --filter=@aviary/web run dev &
pids+=("$!")

if command -v uv >/dev/null 2>&1; then
  (
    # API initializes pg-boss tables. Retry worker startup to handle race on fresh boot.
    attempts=0
    max_attempts=20
    while true; do
      (cd apps/worker && uv run aviary-worker) && break
      code=$?
      attempts=$((attempts + 1))
      if [[ $attempts -ge $max_attempts ]]; then
        echo "Worker failed ${attempts} times (last exit ${code}); giving up."
        exit "$code"
      fi
      echo "Worker exited with code ${code}; retrying in 3s..."
      sleep 3
    done
  ) &
  pids+=("$!")
else
  echo "uv not found; starting API and Web only."
fi

# Portable replacement for `wait -n` (not available in macOS bash 3.2).
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid"
      exit $?
    fi
  done
  sleep 1
done
