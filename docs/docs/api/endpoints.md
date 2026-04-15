---
title: Endpoint Map
sidebar_position: 3
---

# Endpoint Map

This page lists the main endpoint groups and expected usage.

## Auth

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/signin`
- `POST /api/v1/auth/signout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/forgot`
- `PATCH /api/v1/auth/forgot`

## Users

- `GET /api/v1/users` (admin/superuser scoped)
- `POST /api/v1/users`
- `GET /api/v1/users/{id}`
- `PATCH /api/v1/users/{id}`
- `DELETE /api/v1/users/{id}`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `DELETE /api/v1/users/me`

Notification targets:

- `GET /api/v1/users/me/notification-targets`
- `POST /api/v1/users/me/notification-targets`
- `PATCH /api/v1/users/me/notification-targets/{id}`
- `DELETE /api/v1/users/me/notification-targets/{id}`
- `POST /api/v1/users/me/notification-targets/{id}/test`

## Websites

- `GET /api/v1/websites`
- `POST /api/v1/websites`
- `GET /api/v1/websites/{id}`
- `DELETE /api/v1/websites/{id}`
- `GET /api/v1/websites/{id}/verify`
- `GET /api/v1/websites/{id}/members`
- `POST /api/v1/websites/{id}/invite`
- `POST /api/v1/websites/{id}/uninvite`
- `POST /api/v1/websites/{id}/transfer-ownership`

## Jobs and Queue

- `GET /api/v1/jobs`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs/{id}`
- `DELETE /api/v1/jobs/{id}`
- `GET /api/v1/jobs/{id}/queue`
- `GET /api/v1/job-queue`
- `GET /api/v1/job-queue/{id}`
- `POST /api/v1/job-queue/{id}/cancel`
- `POST /api/v1/job-queue/{id}/unstuck`

Note: task compare/diff is frontend-driven in dashboard routes and does not have an `/api/v1/job-queue/.../compare/...` endpoint.

## Results

- `GET /api/v1/results/jobs/{id}`
- `GET /api/v1/results/jobs/{id}/{tool}`
- `GET /api/v1/screenshots/{wcag_result_id}`

{/* TODO:Add per-endpoint request/response examples generated from real fixtures. */}
