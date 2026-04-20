---
title: Scheduling
sidebar_position: 3
---

# Scheduling

Hesperida supports recurring job execution via cron schedules.

Each schedule points to a **base job** and, on each run, creates a new `pending` job by cloning:

- `job.website`
- `job.types`
- `job.options`

The orchestrator is the scheduling authority and executes schedules in UTC.

## Dashboard Routes

- `/schedule`: list schedules, filters, status/actions
- `/schedule/new`: create schedule
- `/schedule/{id}`: schedule details + run history
- `/schedule/{id}/edit`: update schedule

### UI Behavior

- Cron is entered in UTC and shown in human-readable format (`cronstrue`).
- Raw cron expression is shown in a tooltip.
- `Next run` is displayed in server local timezone for readability.
- `Runs` are shown as jobs created by that schedule (same columns style as `/jobs`).

## API Endpoints

- `GET /api/v1/schedule`
- `POST /api/v1/schedule`
- `GET /api/v1/schedule/{id}`
- `PATCH /api/v1/schedule/{id}`
- `DELETE /api/v1/schedule/{id}`

## Cron Validation and Frequency Guard

Schedule create/update validates:

1. Cron syntax (5-field UTC cron).
2. Minimum allowed execution interval.

Frequency policy is configured by:

- `SCHEDULE_MIN_INTERVAL_SECONDS` (default: `3600`)

If the cron expression is too frequent, API returns:

- HTTP `400`
- `error.code = schedule_too_frequent`

Example:

- `0 * * * *` is valid with default policy (hourly)
- `*/10 * * * *` is rejected with default policy

## Access Rules

- Viewers can read schedules only.
- Admins/editors/superuser can create, update, and delete schedules (ACL-scoped).

## Failure Handling

If the linked base job becomes invalid/unavailable, orchestrator disables the schedule (`enabled=false`) to prevent repeated failures.

