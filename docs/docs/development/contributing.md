---
title: Contributing
sidebar_position: 1
description: Contribution workflow, testing gates, schema/API rules, and release expectations.
---

# Contributing

This page is based on the repository `.github/CONTRIBUTING.md`.

## Scope and Principles

- Open an issue before large changes.
- Keep pull requests focused.
- Keep API/schema changes explicit.
- Avoid bundling unrelated refactors.

## Repository Layout

- `web/`: SvelteKit API + dashboard
- `orchestrator/`: queue scheduler
- Tool runtimes: `probe/`, `domain/`, `whois/`, `ssl/`, `seo/`, `wcag/`, `security/`, `stress/`
- Shared contracts: `types.d.ts`, `constants.ts`
- Schema: `web/src/lib/server/schema.surql`
- Docs: `docs/`

## Requirements

1. Linux / macOS / WSL
2. Docker + Compose
3. Node.js `^22.22.1`
4. Bun `^1.3.10`

## Local Setup

```bash
git clone https://github.com/rallisf1/hesperida.git
cd hesperida
cp .env.example .env
ln -s .env web/.env
docker compose --profile dev up

cd web
bun install
bun run dev
```

## Environment Notes

- `SURREAL_*` must point to reachable DB.
- Use `NODE_ENV=development`.
- SMTP (`SMTP_*`) is required for system-email routes:
  - forgot password
  - website invite
  - ownership transfer
  - admin-created user onboarding
- Apprise is used for user notification targets, not system emails.

## Branch and PR Workflow

1. Create branch from `main`.
2. Implement changes with clear commits.
3. Run checks/tests.
4. Update docs/changelog when needed.
5. Open PR to `development` with:
   - what changed
   - why
   - migration/ops impact
   - test evidence

## Testing Requirements

### Typecheck

```bash
cd web
bun run check
```

### Tests

```bash
cd web
bun run test
```

### Runtime validation

Create a real Job using all available tools and verify successful execution.

Notes:

- Integration tests require a reachable SurrealDB.
- Test env defaults are in `web/src/tests/helpers/preload.ts`.

## API and Schema Rules

If API behavior changes:

- update `@swagger` blocks in route handlers
- regenerate and commit `web/static/openapi.json`
- update dashboard loaders/mappers if response shape changed

If schema/ACL changes:

- update `web/src/lib/server/schema.surql`
- use `OVERWRITE` (not `IF NOT EXISTS`) when modifying existing fields
- bump `web/package.json` version
- verify startup schema init still works (`db-init.ts`)
- add/update regression tests

## Notification Rules

- System mail: `web/src/lib/server/system-mail.ts` (Nodemailer)
- User target notifications: `web/src/lib/server/notifications/*` (Apprise)
- Keep rollback semantics on failed system-email sends

## Docs Workflow

```bash
cd docs
npm ci
npm run build
```

For API changes, ensure `web/static/openapi.json` is up to date before docs generation.

## CI/CD and Releases

- `docs-pages.yml`: docs publish from `main`
- `auto-tag-version.yml`: auto-tag from `web/package.json` version on `main`
- `images-ghcr.yml`: multi-arch image publish on version tags

Version source of truth is `web/package.json`.

If version is bumped:

- add matching `CHANGELOG.md` entry
- ensure API/docs changes are included

## AI Coding Usage

AI-assisted development is expected in this project. Validate generated code before merge.

Recommended models:

- GPT-5.3-Codex
- Gemini 3.1 Pro

## PR Checklist

- [ ] scoped change
- [ ] `bun run check` passes
- [ ] relevant tests pass
- [ ] schema/API/docs updated if needed
- [ ] changelog updated for user-visible changes
- [ ] new env vars documented

## Security

- Never commit secrets.
- For auth/ACL changes, include explicit allow/deny tests.
- Preserve safeguards and rollback logic for destructive operations.
