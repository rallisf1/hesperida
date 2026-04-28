---
title: Deployment Notes
sidebar_position: 1
---

# Deployment Notes

This page follows the deployment flow in the repository `README.md`.

## Quick Start

1. Clone the repository:

```bash
git clone https://github.com/rallisf1/hesperida.git
cd hesperida
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Start the stack:
- Self-hosted DB:

  ```bash
  docker compose --profile aio up -d
  ```

- External SurrealDB / SurrealDB SaaS:

  ```bash
  docker compose --profile backend up -d
  ```

4. Open the dashboard at `http://localhost:3000` for local access, or at the domain configured in your reverse proxy.

At startup, orchestrator handles tool images automatically:
- `NODE_ENV=development`: builds local tool images
- non-development: pulls matching published tool image tags and retags them for runtime

## Bootstrap Superuser

- Email: `hesperida@local.me`
- Password: value of `SURREAL_PASS`

## Updating

For all-in-one (`aio`) deployments:

```bash
docker compose --profile aio down
docker compose --profile aio pull
docker compose --profile aio up -d
```

For `backend` deployments, use the same flow but replace `aio` with `backend` where applicable.

If you use the bundled Caddy setup, add `-f docker-compose-caddy.yaml` to the `down`, `pull`, and `up` commands.

## Runtime Notes

- `web` and `orchestrator` are required in all active deployments.
- `db` is required only when not using external SurrealDB.
- `apprise` and `pdf` are part of backend profiles for notifications and PDF export.
- `docker-compose-caddy.yaml` is an optional standalone Compose file for deployments that want bundled Caddy.
- `tools` profile is optional for direct manual tool runs; those containers are not long-running services.

## Reverse Proxy

Most deployments should use their existing reverse proxy with `docker-compose.yaml` and proxy to the loopback dashboard port:

```caddy
my.domain.com {
	reverse_proxy 127.0.0.1:3000
}
```

If you want the bundled Caddy container, edit the root `Caddyfile` and replace `my.domain.com` with your real hostname:

```caddy
my.domain.com {
	reverse_proxy web:3000
}
```

Then set matching public URL/session values in `.env`:

```env
DASHBOARD_URL=https://my.domain.com
SESSION_COOKIE_SECURE=true
```

Start the bundled Caddy stack with:

```bash
docker compose -f docker-compose-caddy.yaml --profile aio up -d
```

See [Reverse Proxy](./reverse-proxy.md) for the full guide.

## Environment Highlights

Start from `.env.example` and configure at least:

- `SURREAL_*` connection/auth values
- `WEB_API_KEY`
- `DASHBOARD_URL`
- `SMTP_*` (required for system emails: forgot password, invite, onboarding)
