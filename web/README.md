# Hesperida Web

SvelteKit app that serves API v1 and dashboard surfaces depending on `APP_MODE`.

## Testing

Integration tests use `bun:test` and call the API handlers through `hooks.server.ts` with a real SurrealDB backend.

### Requirements

- Reachable SurrealDB instance
- Env vars (defaults shown):
  - `SURREAL_PROTOCOL` (`http`)
  - `SURREAL_ADDRESS` (`127.0.0.1:8000`)
  - `SURREAL_USER` (`root`)
  - `SURREAL_PASS` (`root`)
  - `WEB_API_KEY` (`test-web-api-key`)
  - `APPRISE_URL` (`http://apprise.test` in tests)
  - `NOTIFICATION_BRAND_LOGO_URL` (`https://example.test/logo.png`)
  - `SMTP_HOST` (`smtp.test`)
  - `SMTP_PORT` (`587`)
  - `SMTP_USER` (`smtp-user`)
  - `SMTP_PASS` (`smtp-pass`)
  - `SMTP_SECURE` (`false`)
  - `SMTP_FROM` (`Hesperida <noreply@example.test>`)

Test preload creates an ephemeral namespace/database per run by suffixing `SURREAL_NAMESPACE` and `SURREAL_DATABASE`.

### Commands

- `bun run test` runs all tests
- `bun run test:api` runs API integration tests only
- `bun run test:watch` runs tests in watch mode

If SurrealDB is not running or credentials are wrong, tests will fail during schema/bootstrap.
