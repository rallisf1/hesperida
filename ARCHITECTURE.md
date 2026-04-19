# Hesperida Architecture

## Purpose
Hesperida is a Docker-first, self-hosted web scanning platform with:
- SurrealDB as the source of truth
- A Bun orchestrator that schedules scanner containers
- A SvelteKit web service that serves both API and dashboard
- Optional PDF report generation and notification delivery channels

## Version Scope
This document reflects architecture as of `v0.7.x`.

---

## Runtime Topology
Defined primarily in [`docker-compose.yaml`](./docker-compose.yaml):

- `db`: SurrealDB (RocksDB)
- `orchestrator`: watches DB state and runs tool containers via Docker socket
- `web`: SvelteKit service (`/api/v1/*` + dashboard UI)
- `apprise`: user-notification target delivery API
- `pdf`: Gotenberg HTML-to-PDF service
- Tool images (executed on demand by orchestrator):
  - `probe`, `seo`, `ssl`, `wcag`, `whois`, `domain`, `security`, `stress`

### Profiles
- `aio`: `db + orchestrator + web + apprise + pdf`
- `backend`: `orchestrator + web + apprise + pdf`
- `database`: `db`
- `dev`: in `docker-compose.dev.yaml`, includes `db + orchestrator + apprise + pdf`
- `tools`: direct tool container runs (dev/testing)

Note: there is no standalone `db-init` container anymore. Schema init is performed by the web service at startup.

---

## Database Bootstrap and Schema Import

DB initialization is handled in [`web/src/lib/server/db-init.ts`](./web/src/lib/server/db-init.ts):
- Imports schema from [`web/src/lib/server/schema.surql`](./web/src/lib/server/schema.surql)
- Uses a stored DB param (`$schemaVersion`) to avoid re-importing unchanged schema
- Ensures the bootstrap superuser exists

This is invoked from `hooks.server.ts` when app mode includes API (`api` or `both`).

---

## Core Backend Flow

### 1) Job lifecycle
1. User/API creates a `jobs` row with selected `types`.
2. Orchestrator live-subscribes to pending jobs.
3. `probe` runs first.
4. If probe fails, job is marked `failed`.
5. If probe succeeds, orchestrator enqueues per-tool tasks in `job_queue`.
6. Each task runs in its own container.
7. Tools write to dedicated `*_results` tables.
8. DB events link results to `jobs` and update queue statuses.
9. Completion checks mark `jobs.status='completed'` when all required outputs exist.

### 2) Queue semantics
- Queue statuses: `pending | waiting | processing | completed | failed | canceled`
- API supports cancel and unstuck operations
- Orchestrator handles retry/backoff with `attempts` and `next_run_at`
- Canceled/failed queue states can propagate failure to parent job (unless already completed)

---

## Web Service Architecture (`/web`)

### Runtime mode gating
`APP_MODE` controls exposure:
- `both`: API + dashboard
- `api`: API only
- `dashboard`: dashboard only

Route gating is centralized in `hooks.server.ts`.

### API
- Prefix: `/api/v1/*`
- Protected API routes require `x-api-key` (except auth and screenshot proxy endpoints)
- User auth uses bearer/cookie session token
- OpenAPI schema is generated for docs consumption (`web/static/openapi.json`)

### Dashboard
- SvelteKit server routes call API through server-side helper
- Browser auth via secure cookie session
- SSE streams power live queue/task updates and notifications
- Main CRUD surfaces: users, websites, jobs, job-queue

### Public report route
- `/jobs/{id}/pdf` renders SSR-only report HTML
- Used as source for Gotenberg PDF conversion
- Only completed jobs are eligible

---

## Multi-Tenant ACL Model

### Users model
`users` include:
- `role`: `admin | editor | viewer`
- `group`: tenant-like scope
- `is_superuser`: global override

### Effective access
- `is_superuser=true`: global access across groups/resources
- `admin` (non-superuser): group-scoped user management + website/resource access by ownership/group rules
- `editor`: own/member website scope
- `viewer`: member-only scope; restricted mutations

### Ownership constraints
- Viewer cannot own websites
- Role downgrade to viewer is blocked if user owns websites
- Superuser role is constrained to admin in API + dashboard safeguards

### Bootstrap superuser
On API startup, web ensures:
- email: `hesperida@local.me`
- password: `SURREAL_PASS` env value
- role: `admin`
- `is_superuser=true`

---

## Authentication and Session

- Record access supports `SIGNIN` path
- Signup is API-controlled (`/api/v1/auth/signup`)
- `AUTH_SIGNUP_ENABLED` can disable public signup
- Session cookies are used for dashboard auth (with refresh/renewal flow)
- Signout invalidates DB auth token and clears cookies

---

## Website Access, Membership, and Verification

### Membership model
- `websites.owner`: single owner
- `websites.users`: invited members array

### Membership endpoints
- Invite: `POST /api/v1/websites/{id}/invite`
- Uninvite: `POST /api/v1/websites/{id}/uninvite`
- Transfer ownership: `POST /api/v1/websites/{id}/transfer-ownership`

### Verification model
Verification is shared per `(group, registrable_domain)` using `website_verifications`:
- `group`
- `registrable_domain`
- `verification_code`
- `verified_at`
- `verification_method` (`dns|file`)

Verification check order:
1. DNS TXT at `hesperida.<registrable-domain>` with `verification_token` as value
2. HTTP fallback at `/hesperida-<verification_token>.txt` (status `200` is sufficient)

`POST /api/v1/jobs` enforces website verification gate.
Verification does not expire once set.

---

## Notification Architecture

Notification delivery is split into two channels:

### 1) System emails (Nodemailer / SMTP)
Handled by [`web/src/lib/server/system-mail.ts`](./web/src/lib/server/system-mail.ts).

Used for:
- Forgot password
- Website invite
- Ownership transfer invite-like message
- Admin user creation onboarding/reset message

Behavior:
- SMTP required (`SMTP_*`)
- If SMTP missing: route returns `503 smtp_not_configured`
- If send fails: route returns `502 notification_failed` and preserves rollback semantics

### 2) User notification targets (Apprise)
Handled under `web/src/lib/server/notifications/*`.

Used for:
- User-managed notification targets and send/test operations
- Stored in `users.notification_targets`

---

## Reporting and PDF

### HTML report route
- `/jobs/{id}/pdf` is print-friendly, SSR-only, and non-interactive
- Contains client-facing summary + evidence tables

### PDF generation flow
- Dashboard job page triggers route-local POST action
- Backend calls Gotenberg (`/forms/chromium/convert/url`)
- Generated PDF stream is proxied to browser as download

---

## Data Model Overview

Core tables:
- `users`, `websites`, `website_verifications`, `jobs`, `job_queue`

Result tables:
- `probe_results`, `seo_results`, `ssl_results`, `wcag_results`, `whois_results`, `domain_results`, `security_results`, `stress_results`

Notable events/triggers:
- Result completion links (`*_completion`)
- Job completion checks
- Queue cancel / failure propagation
- Job deletion cascades (results + screenshot blobs)
- User deletion cleanup behavior

---

## Tool Execution Model

Tools are isolated containers launched by orchestrator:
- `probe`: httpx metadata + geo persistence
- `domain`: rdapper + DNS records
- `whois`: IP whois rows
- `ssl`: TLS certificate metadata
- `seo`: TypeScript implementation (`@seomator/seo-audit`)
- `wcag`: Playwright + axe-core, per-device rows + screenshots
- `security`: nuclei + wapiti + nikto aggregation/scoring
- `stress`: vegeta metrics/scoring

Orchestrator injects task context via environment variables and network-attaches spawned containers to the same Docker network.

---

## Networking and Connectivity

- Web, orchestrator, and tools connect to SurrealDB via service hostname (`db:8000` by default)
- Orchestrator requires `/var/run/docker.sock`
- No `network_mode: host` dependency
- WebSocket DB clients use bounded reconnect (`attempts=5`, `retryDelay=1000ms`) to avoid infinite hangs

---

## Docs and Release Pipeline

### Docs
- Docusaurus-based docs in `/docs`
- OpenAPI docs are generated from `web/static/openapi.json`
- GitHub Pages deploy via `.github/workflows/docs-pages.yml`

### Release automation
- Version source of truth: `web/package.json`
- `auto-tag-version.yml`: auto-tags `v<version>` on `main` version bumps
- `images-ghcr.yml`: builds/pushes multi-arch GHCR images (`amd64` + `arm64`)

---

## Shared Contracts and Sources of Truth

- Shared runtime types: [`types.d.ts`](./types.d.ts)
- Shared constants/tools: [`constants.ts`](./constants.ts)
- DB schema: [`web/src/lib/server/schema.surql`](./web/src/lib/server/schema.surql)
- API contracts: route `@swagger` blocks + generated OpenAPI JSON

---

## Operational Constraints

- Queue cleanup and orphan container cleanup are still pending
- Reliability under heavy concurrency remains resource-sensitive
- Critical system-email flows are synchronous/blocking by design
- Multi-tenant ACL is enforced at both schema and API layers

---

## Mental Model

- SurrealDB is the source of truth.
- `jobs` expresses scan intent.
- `job_queue` is execution backlog.
- Orchestrator is a DB-driven container scheduler.
- Tool containers are stateless workers writing results.
- Web service is both control plane (API) and user plane (dashboard/reports/docs integration point).
