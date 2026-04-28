# Contributing to Hesperida

Thanks for contributing.

This document is the practical workflow for making safe changes in this monorepo.

## Scope and Principles

- Open an issue before large work.
- Prefer small, focused pull requests.
- Keep API contracts and DB schema changes explicit.
- Do not mix unrelated refactors with feature/bug fixes.

## Repository Layout

- `web/`: SvelteKit API + dashboard
- `orchestrator/`: queue scheduler / tool runner
- Tool runtimes: `probe/`, `domain/`, `whois/`, `ssl/`, `seo/`, `wcag/`, `security/`, `stress/`
- Shared contracts: `types.d.ts`, `constants.ts`
- DB schema: `web/src/lib/server/schema.surql`
- Docs: `docs/`

## Requirements

1. Linux, Mac, or WSL **UNTESTED**
2. Docker with compose
3. Node.js version ^22.22.1
4. Bun version ^1.3.10
5. pnpm

## Local Setup

1. Clone:
```bash
git clone https://github.com/rallisf1/hesperida.git
cd hesperida
```
2. Configure env:
```bash
cp .env.example .env
ln -s .env web/.env
```
3. Build tool dependencies

__the main branch is for development because it is synced with the original upstream repos, use the hesperida-* branch if you have errors__

```bash
cd ../seo
git clone https://github.com/rallisf1/seo-audit-skill.git seomator
cd seomator
npm install && npm run build
```
4. Build tools (optional):
```bash
docker compose -f docker-compose.dev.yaml --profile tools build
```
5. Start infra:
```bash
docker compose -f docker-compose.dev.yaml --profile dev up
```
6. Run web app:
```bash
cd web
bun install
bun run dev
```

## Environment Notes

- `SURREAL_*` must point to a reachable DB.
- System email routes (`forgot`, `invite`, `transfer ownership`, admin user create) require SMTP (`SMTP_*`).
- Use `NODE_ENV=development`.
- Apprise is used for user notification targets, not for system mail.

## Branch and PR Workflow

1. Create a feature branch from `main`.
2. Make changes with clear commit messages.
3. Run checks/tests locally (see below).
4. Update docs/changelog when behavior changes.
5. Open PR to the `development` branch with:
   - what changed
   - why
   - migration/ops impact
   - test evidence

## Testing Requirements

### Web typecheck
```bash
cd web
bun run check
```

### Web tests
```bash
cd web
bun run test
```

### Tool runs
Create a Job with all available tools and check that they all succeed.

Notes:
- Integration tests need reachable SurrealDB.
- `web/src/tests/helpers/preload.ts` sets test defaults.

## API and Schema Change Rules

If you change API behavior:

- Update route `@swagger` docs in `web/src/routes/api/v1/**/+server.ts`.
- Regenerate and commit `web/static/openapi.json` (build `web` once).
- If dashboard consumes that API, update dashboard loaders/mappers accordingly.

If you change schema/ACL:

- Update `web/src/lib/server/schema.surql`.
- When updating existing fields, make sure they use `OVERWRITE` instead of `IF NOT EXISTS`.
- Change the version in `web/package.json`, add your commit id or branch name
- Verify startup DB init still succeeds (`web/src/lib/server/db-init.ts`).
- Add/adjust tests for permission behavior and regressions.

## Notification Rules

- System mail goes through `web/src/lib/server/system-mail.ts` (Nodemailer).
- User notification target test/send stays in Apprise modules under `web/src/lib/server/notifications/`.
- Preserve rollback semantics for routes that create temporary tokens/users when email fails.

## Docs Workflow

Docs are built from `docs/` with Docusaurus.

```bash
cd docs
npm ci
npm run build
```

`docs` build scripts sync OpenAPI from `web/static/openapi.json`, so keep that file current in PRs that touch API contracts.

Changelog, architecture, installation, deployment, faq, etc. are manually synced between the `docs` and root files (e.g. README.md)

## CI/CD and Release Expectations

- `docs-pages.yml`: builds and deploys docs from `main`.
- `auto-tag-version.yml`: creates tag `v<web/package.json version>` when that version changes on `main`.
- `images-ghcr.yml`: builds/pushes multi-arch images on tag pushes.

Version source of truth is `web/package.json`.

If you bump version:

- Add matching `CHANGELOG.md` section.
- Ensure API/docs updates are committed before merge.

## AI Coding Usage

AI Coding is expected at this point. Over 90% of the project's code has been AI generated at this point. Just make sure you know what the AI is doing. Use `ARCHITECTURE.md` to give your agent a head start. Models recommended:

- GPT-5.3-Codex
- Gemini 3.1 Pro

## PR Checklist

- [ ] Change is scoped and reviewed for side effects.
- [ ] `bun run check` passes in `web/`.
- [ ] Relevant tests pass locally.
- [ ] Schema/API/docs updated as needed.
- [ ] `CHANGELOG.md` updated for user-visible behavior.
- [ ] New env vars are documented in `.env.example` and docs config reference.

## Security and Sensitive Changes

- Never commit secrets in `.env*`, workflow files, or tests.
- For auth/ACL changes, include explicit tests for allowed/forbidden paths.
- For destructive operations (delete/transfer), preserve current safeguards and rollback behavior.

## Backwards compatibility and upgrade path

While Hesperida is still in bet (v0.x.x) there's no backwards compatiblity or pre-defined upgrade path, a.k.a. breaking changes are expected. That said; it's best to keep them minimal.