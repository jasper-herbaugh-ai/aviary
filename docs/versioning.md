# Version Synchronization

This repository keeps release versioning in one place:

- `VERSION` at the repository root.
- Monorepo package manifests (`package.json` files under root, `apps/*`, `packages/*`).
- GitHub Actions version source used for image tags.

## Why

Keeping versions in one place prevents accidental drift (for example, `packages/types` at `0.1.0` while root is `0.1.1`).

## Commands

- `bun run sync-version [<version>]` - Writes a target version into `VERSION`, then syncs all package manifests.
- `bun run check-version` - Validates all version sources are aligned and exits non-zero if any drift is found.

Example release bump:

```bash
# set target version
printf "1.4.0\n" > VERSION
bun run sync-version
```

Or specify explicit version:

```bash
bun run sync-version 1.4.0
```

## CI behavior

The CI workflow includes a `version-sync-check` job that runs `bun run check-version`.
A pull request fails validation if versions are out of sync.

For CI to pass, commit any changes from `bun run sync-version` whenever `VERSION` changes.
