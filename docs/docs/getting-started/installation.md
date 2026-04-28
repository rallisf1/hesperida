---
title: Installation
sidebar_position: 1
---

# Installation

## Prerequisites

- Docker + Docker Compose
- A Linux host with at least:
  - 2 CPU cores / 4 threads
  - 4GB RAM
  - 6GB+ free storage

## Quick Start

1. Clone the repository.
2. Copy and edit the environment file.
3. Start services using Compose profiles.

```bash
git clone https://github.com/rallisf1/hesperida.git
cd hesperida
cp .env.example .env
docker compose --profile aio up -d
```

Open the web service at `http://localhost:3000` for local access, or through your configured reverse proxy in production.

Tool image handling is automatic at launch:
- `NODE_ENV=development`: orchestrator builds tool images from local sources
- non-development: orchestrator pulls matching published tool images and retags them for runtime use

## Superuser Bootstrap

At startup, the API ensures a superuser account exists:

- Email: `hesperida@local.me`
- Password: value of `SURREAL_PASS`

You should rotate this account credentials after initial setup.

## Production HTTP(S)

Most production Docker hosts already have a reverse proxy. With the default `docker-compose.yaml`, point your existing proxy at `127.0.0.1:${WEB_PORT:-3000}` and set:

```env
DASHBOARD_URL=https://your.domain
SESSION_COOKIE_SECURE=true
```

If you want Hesperida to run its own Caddy container, use `docker-compose-caddy.yaml`:

- point your DNS name at the Docker host
- replace `my.domain.com` in the root `Caddyfile`
- set `DASHBOARD_URL=https://your.domain`
- set `SESSION_COOKIE_SECURE=true`

```bash
docker compose -f docker-compose-caddy.yaml --profile aio up -d
```

See [Reverse Proxy](../operations/reverse-proxy.md) for both proxy options.

## Compose Profiles

- `aio`: full local stack (`db`, `orchestrator`, `web`, `apprise`, `pdf`)
- `backend`: backend services for external DB setups (`orchestrator`, `web`, `apprise`, `pdf`)
- `database`: SurrealDB only
- `tools`: optional manual tool runs (not long-running in production)

## Upgrade Flow

```bash
docker compose --profile aio down
docker compose --profile aio pull
docker compose --profile aio up -d
```

For external DB deployments, use the same flow with the `backend` profile.

{/* TODO:Add zero-downtime upgrade procedure once blue/green or rolling strategy is implemented. */}
