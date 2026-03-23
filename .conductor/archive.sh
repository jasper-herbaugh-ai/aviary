#!/usr/bin/env bash
set -euo pipefail

rm -rf node_modules
rm -rf .turbo
rm -rf apps/web/.next
rm -rf apps/api/dist
rm -rf packages/db/dist
rm -rf packages/types/dist
rm -rf packages/playbooks/dist
find . -type d -name __pycache__ -prune -exec rm -rf {} +
find . -type d -name .pytest_cache -prune -exec rm -rf {} +

if [[ -d .venv ]]; then
  rm -rf .venv
fi

if [[ -d apps/worker/.venv ]]; then
  rm -rf apps/worker/.venv
fi

echo "Archive cleanup complete."
