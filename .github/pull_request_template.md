## Summary

Describe what changed and why.

## Scope

- Issue: <!-- Link issue, e.g. #123 -->
- Type:
  - [ ] Bug fix
  - [ ] Feature
  - [ ] Refactor
  - [ ] Docs
  - [ ] CI/CD

## What Changed

- <!-- Bullet list of concrete changes -->

## Validation

Commands run and their outcome:

- [ ] `cd web && bun run check`
- [ ] `cd web && bun run test` (or targeted tests)
- [ ] Successful all-tools job run

## API / Contract Impact

- [ ] No API changes
- [ ] API behavior changed
- [ ] OpenAPI annotations updated
- [ ] `web/static/openapi.json` regenerated

Notes:
<!-- Describe any new/changed status codes, payload fields, or breaking behavior -->

## Database / ACL Impact

- [ ] No schema/ACL changes
- [ ] `web/src/lib/server/schema.surql` changed
- [ ] DB init behavior affected (`web/src/lib/server/db-init.ts`)
- [ ] Migration/backfill required

Notes:
<!-- Describe rollout concerns and compatibility -->

## Dashboard / UX Impact

- [ ] No dashboard changes
- [ ] Dashboard routes/components changed
- [ ] Error handling / toast behavior changed

Notes:
<!-- Add screenshots/gifs if helpful -->

## Docs / Config Impact

- [ ] No docs/config changes
- [ ] `.env.example` updated
- [ ] `docs/docs/reference/configuration.md` updated
- [ ] README/docs updated

## Release Notes

- [ ] No changelog entry required
- [ ] Version bump in `web/package.json`
- [ ] `CHANGELOG.md` has `## [<web/package.json version>]` && synced to `docs/docs/reference/changelog.md`

## Security Checklist

- [ ] No secrets committed
- [ ] Auth/ACL changes covered by tests (if applicable)
- [ ] Destructive actions preserve safeguards/rollback behavior
