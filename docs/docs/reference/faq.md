---
title: FAQ
sidebar_position: 4
---

# FAQ

## What's with the `tools` docker compose profile?

Those containers are mainly for developer testing and optional manual pre-build/pre-pull workflows. You typically do not run them as long-lived services in production.

In normal deployments, orchestrator handles tool image preparation during startup (build in development, pull in non-development).

## Can I host services on different hosts?

Yes, database and backend can be split:

- database: `db`
- backend: `orchestrator` + `web` (+ optional `apprise` / `pdf`)

Running scan tool containers on separate hosts from orchestrator is out of scope right now.

## axe-core doesn't provide a score. How is WCAG score calculated?

Impact weights:

| Impact | Score |
| --- | --- |
| critical | 10 |
| serious | 7 |
| moderate | 3 |
| minor | 1 |

Current percentage formula:

`100 - (pass_score / (pass_score / error_score))`

Inapplicable and incomplete checks are not scored in the current version.

## Are WCAG results reliable?

WCAG results are based on `axe-core`. In practice, it is generally strict on errors and can differ from other tools (for example WAVE). Treat it as a strong automated baseline, not as the full accessibility audit.

## How is security score calculated?

Penalty weights:

| Impact | Score |
| --- | --- |
| critical | 10 |
| high | 7 |
| medium | 3 |
| low | 1 |

Total penalty is normalized against `SECURITY_SCORE_THRESHOLD` (default `400`):

- `0` penalty => `100%`
- `>= threshold` => `0%`

Scores are instance/version/config dependent, so cross-instance comparisons are not reliable.

## Can I scan any website or only my own?

Only websites you can verify. Verification methods:

1. DNS TXT: `hesperida.yourdomain.com = <verification_code>`
2. Web root file: `hesperida-<verification_code>.txt` returning HTTP 200

Verification is stored in shared records per `(group, registrable_domain)`, so same-group websites on the same registrable domain reuse the same verification code.

Use dashboard verification or `GET /api/v1/websites/{id}/verify`.

## Can I use Hesperida in CI/CD?

Yes, as long as the target environment has a real reachable domain for verification and scanning.

## Can I run SaaS on top of this?

License-wise, AGPL obligations apply. Technically possible, but current self-managed container orchestration requires substantial scaling/ops work for SaaS-grade reliability.

## I want to change my user group.

Only superusers can change groups. Non-superusers can transfer/delete owned websites and manage their own account within ACL limits.

## Is this an AI-assisted project?

Yes. Architecture and product decisions are curated project-side, with a large portion of implementation assisted by AI in recent versions.

## Can you add/change feature X?

Open a GitHub issue with concrete use-case and expected behavior.

## How can I contribute?

1. Open an issue
2. Fork the repository
3. Implement and test changes
4. Submit a PR that references/closes the issue
