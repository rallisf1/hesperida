---
title: Architecture
sidebar_position: 1
description: Runtime topology, data flow, ACL model, notifications, and release pipeline.
---

# Hesperida Architecture

This page reflects the current architecture and is based on the root `ARCHITECTURE.md` in the repository.

## Purpose

Hesperida is a Docker-first, self-hosted web scanning platform with:

- SurrealDB as source of truth
- Bun orchestrator for scanner execution
- SvelteKit web service for API + dashboard
- PDF and notification delivery integrations

## Runtime Topology

Main services:

- `db` (SurrealDB)
- `orchestrator`
- `web` (`/api/v1/*` + dashboard)
- `apprise` (notification target delivery)
- `pdf` (Gotenberg)
- on-demand tool containers:
  - `probe`, `seo`, `ssl`, `wcag`, `whois`, `domain`, `security`, `stress`, `mail`

Compose profile intent:

- `aio`: full stack
- `backend`: web + orchestrator + integration services
- `database`: db only
- `dev`: dev stack from `docker-compose.dev.yaml`
- `tools`: direct tool image runs

## Database Bootstrap

Schema/bootstrap are handled by the web app startup init:

- imports `web/src/lib/server/schema.surql`
- tracks schema application via `$schemaVersion`
- ensures bootstrap superuser exists

No standalone `db-init` service is used now.

## Job Lifecycle and Queue Flow

High-level flow:

1. Create `jobs` row (`types` selected).
2. Orchestrator picks pending job.
3. `probe` runs first.
4. Follow-up tasks fan out in `job_queue`.
5. Tool containers run and write to `*_results`.
6. DB events link outputs and advance status.
7. Job is marked complete when all required outputs exist.

Queue statuses:

- `pending`, `waiting`, `processing`, `completed`, `failed`, `canceled`

Queue/container maintenance (orchestrator):

- daily queue retention cleanup removes `job_queue` rows older than `JOB_QUEUE_RETENTION` days (default `365`)
- startup orphan cleanup removes managed tool containers labeled `com.hesperida.managed=true`
- startup tool image preparation:
  - `NODE_ENV=development`: build local tool images from `/tools/*`
  - non-development: pull GHCR tool images using the resolved orchestrator image tag token, then retag for local runtime names

## Web Service Modes

`APP_MODE` controls routing:

- `both`
- `api`
- `dashboard`

API protections:

- `x-api-key` required on protected `/api/v1/*` routes
- user auth by cookie/bearer token
- OpenAPI generated to `web/static/openapi.json`

Dashboard:

- server-side API calls through internal helper
- SSE streams for queue and notifications
- CRUD surfaces for users/websites/jobs/job-queue

## ACL and Multi-Tenancy

User fields:

- `role`: `admin | editor | viewer`
- `group`
- `is_superuser`

Access summary:

- `is_superuser`: global
- `admin`: group-scoped administration
- `editor`: own/member website scope
- `viewer`: member-only scope

Safeguards:

- viewers cannot own websites
- cannot downgrade owner users to viewer
- superuser role constrained to admin

## Website Verification Model

Verification records are shared by `(group, registrable_domain)` in `website_verifications`:

- `verification_code`
- `verified_at`
- `verification_method` (`dns|file`)

Check order:

1. DNS TXT: `hesperida.<registrable-domain>`
2. HTTP fallback: `hesperida-<code>.txt` with status `200`

Job creation is gated on verification.

## Notifications (Split Architecture)

System emails:

- Nodemailer + SMTP (`SMTP_*`)
- used for forgot/invite/transfer/onboarding
- missing SMTP -> `503 smtp_not_configured`
- send failure -> `502 notification_failed` + rollback semantics
- this is transactional app mail and separate from the `mail` scan tool output (`mail_results`)

User notifications:

- Apprise-backed
- stored in `notification_channels` and `website_notifications`
- configured in dashboard/API and delivered by orchestrator on job transitions/scores

## Reporting / PDF

- SSR report route: `/jobs/{id}/pdf` (completed jobs only)
- dashboard action calls Gotenberg URL conversion
- PDF is streamed back as download

## Data Model Overview

Core:

- `users`, `websites`, `website_verifications`, `jobs`, `job_queue`

Results:

- `probe_results`, `seo_results`, `ssl_results`, `wcag_results`, `whois_results`, `domain_results`, `security_results`, `stress_results`, `mail_results`

## Release and Docs Pipeline

- Version source of truth: `web/package.json`
- Auto-tag workflow creates `v<version>` tags on `main`
- GHCR workflow builds/pushes multi-arch images
- Docs workflow publishes Docusaurus to GitHub Pages
