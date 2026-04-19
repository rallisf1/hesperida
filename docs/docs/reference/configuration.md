---
title: Configuration
sidebar_position: 1
---

# Configuration

This page lists the most important environment variables.

## Core Runtime

| Variable | Purpose |
| --- | --- |
| `APP_MODE` | `both`, `api`, or `dashboard` route gating |
| `WEB_API_KEY` | required header value for protected API requests |
| `API_URL` / `API_KEY` | dashboard-to-API server-side calls (dashboard mode) |

## Database

| Variable | Purpose |
| --- | --- |
| `SURREAL_PROTOCOL` | websocket/http protocol |
| `SURREAL_ADDRESS` | host:port of SurrealDB |
| `SURREAL_NAMESPACE` | namespace |
| `SURREAL_DATABASE` | database |
| `SURREAL_USER` | db user |
| `SURREAL_PASS` | db password + superuser bootstrap password |

## Auth & ACL

| Variable | Purpose |
| --- | --- |
| `AUTH_SIGNUP_ENABLED` | enable/disable public signup |
| `COOKIE_MAX_AGE_SECONDS` | session cookie max age (default 1 hour) |

## Notifications

| Variable | Purpose |
| --- | --- |
| `APPRISE_URL` | Apprise API endpoint for user notification targets |
| `NOTIFICATION_BRAND_LOGO_URL` | logo used in long-form notification templates |

## System Email (SMTP)

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP auth user |
| `SMTP_PASS` | SMTP auth password |
| `SMTP_SECURE` | use SMTPS/TLS (`true`/`false`) |
| `SMTP_FROM` | sender address used for forgot/invite/onboarding emails |

Routes that require SMTP (return `503 smtp_not_configured` when unavailable):

- `POST /api/v1/auth/forgot`
- `POST /api/v1/users`
- `POST /api/v1/websites/{id}/invite`
- `POST /api/v1/websites/{id}/transfer-ownership`

## Reporting

| Variable | Purpose |
| --- | --- |
| `GOTENBERG_URL` | PDF conversion service endpoint |

## Scoring

| Variable | Purpose |
| --- | --- |
| `SECURITY_SCORE_THRESHOLD` | threshold used by security scoring logic |

{/* TODO:Add a complete env reference table generated from `.env.example` once variable naming is fully stabilized. */}
