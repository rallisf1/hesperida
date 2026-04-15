---
slug: /
title: Hesperida Documentation
sidebar_position: 1
description: Self-hosted web scanning platform documentation.
---

import useBaseUrl from '@docusaurus/useBaseUrl';

# Hesperida

<div style={{ textAlign: 'center', marginBottom: '1rem' }}>
  <img
    src={useBaseUrl('/img/hesperida-logo.svg')}
    alt="Hesperida logo"
    style={{ maxWidth: '360px', width: '100%', height: 'auto' }}
  />
</div>

Hesperida is a Docker-first, self-hosted platform for website scanning, reporting, and operations monitoring.

This documentation is the canonical entry point for architecture, deployment, API behavior, ACL, and dashboard usage.

{/* TODO:Add a high-level architecture diagram (web + orchestrator + db + tools) once the visual style is finalized. */}

## What You Can Do

- Manage users, websites, jobs, and queue tasks through dashboard and API.
- Run multi-tool scans (probe, domain, whois, ssl, seo, wcag, security, stress).
- Enforce website verification before scan execution.
- Generate client-facing PDF reports for completed jobs.
- Receive notifications (API-level and dashboard in-app toasts).

## Start Here

1. [Install and run Hesperida](./getting-started/installation)
2. [Run your first scan](./getting-started/first-scan)
3. [Review architecture](./concepts/architecture)
4. [Review API auth and ACL](./api/auth-acl)

## Current Scope

The docs currently target the `v0.6.x` feature set:

- Dashboard CRUD and live updates
- Multi-tenant ACL (`role`, `group`, `is_superuser`)
- Website ownership transfer and membership control
- Group-scoped shared website verification records with method tracking (`dns|file`)
- Mandatory website verification gate for job creation (no verification expiry)
- SSR HTML reports + Gotenberg PDF conversion
- TypeScript SEO scanner implementation

{/* TODO:Add release-branch documentation policy once versioning workflow is formalized. */}

## Source of Truth

- Runtime architecture: `ARCHITECTURE.md`
- Configuration and usage notes: `README.md`
- Release history: `CHANGELOG.md`
- Database schema: `schema.surql`

## Support

- Report bugs or request features on the GitHub issue tracker.
- Prefer linking exact routes, schema snippets, or logs in bug reports.
