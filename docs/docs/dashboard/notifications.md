---
title: Notifications
sidebar_position: 4
---

# Notifications

Hesperida supports user-configurable outbound notifications via Apprise.

The feature is split into two resources:

- **Notification Channels**: per-user delivery endpoints (`apprise_url`)
- **Website Notification Links**: website-to-channel bindings with event rules

## Dashboard Routes

- `/notifications/channels`: list channels
- `/notifications/channels/new`: create channel
- `/notifications/channels/{id}/edit`: edit channel
- `/notifications/websites`: list website links
- `/notifications/websites/new`: create website link
- `/notifications/websites/{id}/edit`: edit website link

`/notifications` is a wrapper route that redirects to `/notifications/channels`.

## Event Rules

Each website link can enable:

- `JOB_COMPLETED` (boolean)
- `JOB_FAILED` (boolean)
- `SEO_SCORE_BELOW` (`number | null`)
- `STRESS_SCORE_BELOW` (`number | null`)
- `WCAG_SCORE_BELOW` (`number | null`)
- `SECURITY_SCORE_BELOW` (`number | null`)

Default event configuration:

- `JOB_FAILED = true`
- `JOB_COMPLETED = false`
- score thresholds = `null`

### Threshold behavior

- Threshold checks are evaluated only for completed jobs.
- Empty threshold (`null`) is ignored.
- Missing score (`null`/`undefined`) is ignored.
- Threshold comparison uses strict “below” (`score < threshold`).
- WCAG threshold uses the worst device score for the job.

## Delivery Flow

Notifications are sent by the **orchestrator**, not the dashboard:

1. Orchestrator watches job status transitions.
2. On transition to `completed` or `failed`, it loads website links.
3. It evaluates event settings and score thresholds.
4. It sends best-effort messages to channel `apprise_url` targets.

Delivery failures are logged and do not mutate job/task status.

## API Endpoints

- `GET /api/v1/notification-channels`
- `POST /api/v1/notification-channels`
- `PATCH /api/v1/notification-channels/{id}`
- `DELETE /api/v1/notification-channels/{id}`
- `POST /api/v1/notification-channels/{id}/test`
- `GET /api/v1/website-notifications`
- `POST /api/v1/website-notifications`
- `PATCH /api/v1/website-notifications/{id}`
- `DELETE /api/v1/website-notifications/{id}`

## Access Rules

- Channels:
  - owner CRUD
  - superuser can manage all channels
- Website links:
  - user must have website access
  - non-superuser can link only channels they own
  - superuser can link any website/channel

{/* TODO:Add sample notification payloads from orchestrator logs for each trigger type. */}

