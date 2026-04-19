![Hesperida Web Scanner](./assets/hesperida-logo.svg)

# Hesperida

A self-hosted web scanner that shows you how both people and bots see your websites & web applications.

## Features

### Scanning Tools

| **Type**    | **Dependencies**                | **Status** | **Description**                                                                   |
|-------------|---------------------------------|------------|-----------------------------------------------------------------------------------|
| Domain      | [rdapper](https://www.npmjs.com/package/rdapper), [whois](https://github.com/rfc1036/whois), [subfinder](https://github.com/projectdiscovery/subfinder)                  | ✅         | Gets basic domain info (e.g. registrar, registration/expiry dates, etc) & records  |
| Probe       | [httpx](https://github.com/projectdiscovery/httpx)                           | ✅         | Gets basic info about the web server, and the tech stack                          |
| SEO         | [@seomator/seo-audit](https://www.npmjs.com/package/@seomator/seo-audit), [playwright](https://github.com/microsoft/playwright) | ✅         | TypeScript-based SEO audit and scoring across 251 rules in 20 categories         |
| SSL         | -                               | ✅         | Uses `node:tls` to get basic certificate info                                     |
| WCAG        | [@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright), [playwright](https://github.com/microsoft/playwright)            | ✅            | Check against Web Accessibility rules (also takes a full-height screenshot)                                             |
| Whois       | [whois](https://github.com/rfc1036/whois)                           | ✅         | Gets IP whois info                                                                |
| Security    | [nuclei](https://github.com/projectdiscovery/nuclei), [wapiti](https://github.com/wapiti-scanner/wapiti), [nikto](https://github.com/sullo/nikto) | ✅         | Standard vulnerability scanning                                                   |
| Stress Test | [vegeta](https://github.com/tsenart/vegeta)                               | ✅        | HTTP load testing                                                                 |

### Dashboard

A Sveltekit dashboard is in beta. The main functionality is:

1. CRUD for users/websites/jobs
2. Website verification instructions and verification checks
3. View scan results

### API

All the dashboard functionality is available through [OpenAPI](https://rallisf1.github.io/hesperida/api/endpoints/hesperida-web-app-scanner-api).

### Alerts & Webhooks

[Apprise](https://github.com/caronc/apprise) is integrated for user-managed notification targets.
System emails (forgot password, invite, onboarding) are sent via SMTP (`SMTP_*` env vars).
User-level notification targets are stored in `users.notification_targets` for in-app managed channels (WIP).

## Tech Stack

- JavaScript runtimes: [Node.js](https://github.com/nodejs/node) & [Bun](https://github.com/oven-sh/bun)
- Containerization & Deployment: [Docker](https://github.com/docker) & [dockerode](https://github.com/apocas/dockerode)
- Database: [SurrealDB](https://github.com/surrealdb/)

## How to use

1. Download, a.k.a. `git clone https://github.com/rallisf1/hesperida.git && cd hesperida`
2. `cp .env.example .env` and edit it with your information
3. Start it up:
  - With a self-hosted database
  `docker compose --profile aio up -d`
  - With SurrealDB SaaS
  `docker compose --profile backend up -d`
4. Open `http://localhost:3000` (or according to your configuration)

### Super User account

**email:** hesperida@local.me
**password:** the value of `SURREAL_PASS`

You can change both later

### Updating

1. `docker compose --profile aio down` to stop the running containers
2. `docker compose pull` to update all the docker images
3. `docker compose --profile aio up -d` to start

## How to run the dev environment

1. Download, a.k.a. `git clone https://github.com/rallisf1/hesperida.git && cd hesperida`
2. `cp .env.example .env` and edit it with your information. Use `NODE_ENV=development`.
3. create a shortcut to the .env for the sveltekit project: `ln -s .env web/.env`
3. Start it up `docker compose --profile dev up`
4. (optional) you can pre-build the tools containers using `docker compose --profile tools build`. If you skip this the first run will take a few minutes.
5. In another terminal run the sveltekit project with `cd web && bun install && bun run dev`
6. Open `http://localhost:5173` (or the port indicated in the terminal output)

## Known bugs

- Task execution reliability still needs tuning under heavy concurrency. Known culprits:
  1. Document locks on rocksdb can conflict with high parallel workloads (e.g. multiple `whois` tasks)
  2. Not enough resources, upgrade your host
- There is no cleanup cron for the `job_queue` yet (TODO)
- Orphan containers may be left behind if the orchestrator crashes. When I tried using `AutoRemove: true` in the container settings the containers exited before finishing. AFAIK it's a bug with Bun. This is not a big deal as they're not left running, but a cleanup cron will be needed for those as well. (TODO)

## Ideas

Things that I don't personally need, but would be helpful to some users. Check the [issues](https://github.com/rallisf1/hesperida/issues) for the one you need and like the first post. Don't reply to feature requests unless you have something meaningful to add. If there's no issue yet, open a new one.

### Probe

1. Ability to test form submissions (POST requests)
2. Ability to use authentication (login)
3. Ability to check subpages (a.k.a. crawl)

### WCAG

1. Highlight errors on the screenshot

### SEO

1. SERP Ranking (integrate with SerpBear ?)
2. Content checking
  - A.I. generated content
  - Plagiarism
  - Grammar
  - Placeholders (e.g. lorem ipsum)

### Dashboard

1. Public dashboards (e.g. to share with a client/colleague), although the `/jobs/[id]/pdf` links are public.
2. AI assistant to help you fix any errors found
3. Auth.js authentication integration

### API

1. MCP server
2. n8n node

### Stress Testing

[k6](https://github.com/grafana/k6) could be added to address complex workflows (e.g. login).
The current `stress` tool options are:

- `STRESS_RATE`
- `STRESS_DURATION`
- `STRESS_METHOD`
- `STRESS_TIMEOUT`
- `STRESS_WORKERS`
- `STRESS_MAX_WORKERS`
- `STRESS_HEADERS`
- `STRESS_BODY`
- `STRESS_LATENCY_WARN_MS`

## Hardware Requirements

The more the merrier, but at least:

### Minimum

- 2 CPU Cores / 4 threads (a.k.a. 4 vCores on a standard VPS)
- 4GB RAM
- 6GB of available Storage (5GB for the images + 1GB for the actual data)

There is a distinction between light (CLI/Node tools) and heavy (full browsers) tool containers, and the orchestrator won't run more heavy containers than the available CPU threads.

## F.A.Q.

### What's with the `tools` docker compose profile?

Those are just there for developer testing and pre-building, you'd never need to run them over docker compose in production.

### Can I host the services on different hosts (a.k.a. servers) ?

Currently you can run the database on a different host than the orchestrator using the `database` and `backend` compose profiles.
You will also be able to host the API and Dashboard separately.
Running the scan tools on different hosts than the `backend` (a.k.a. orchestrator) is out of the scope of this FOSS project.

### axe-core doesn't provide a score, how do you calculate it?

axe-core provides an impact rating per rule check, which is scored like this:

| Impact   | Score |
|----------|-------|
| critical | 10    |
| serious  | 7     |
| moderate | 3     |
| minor    | 1     |

The total score percentage formula is `100 - (pass_score / (pass_score / error_score))`. Inapplicable and incomplete rule checks are not scored for the time being.
If you have a better formula submit your [issue](https://github.com/rallisf1/hesperida/issues/new).

### Are the WCAG results reliable?

Before making this I was using [WAVE](https://wave.webaim.org/). Compared to that, axe-core is a bit less reliable, but more strict: All the websites I have checked have given more errors on axe-core, but way less warnings. My take-away from this is that if there are no errors in axe-core, there won't be any errors on WAVE as well. If you just need to fix WCAG errors (e.g. to pass an inspection) you'll be fine, but if your goal is a perfectly WCAG aligned web interface this isn't the tool for you.

### How do you calculate the security score?

Each finding gets a penalty score according to the following table:

| Impact   | Score |
|----------|-------|
| critical | 10    |
| high     | 7     |
| medium   | 3     |
| low      | 1     |

Then all the scores are added and a percentage is calculated according to the `SECURITY_SCORE_THRESHOLD` environment variable, which has a default value of `400`. If the total score exceeds `400` you get a 0% Security score (hacker heaven). If the penalty score is 0 you get a 100% Security score (bulletproof). The number `400` is arbitary and based on a few tests. It might need tuning for your use-case, or even after updates (e.g. when more/new severe errors become common).

That said; score calculations used by Hesperida can change between configurations and versions. Thus; there's no point comparing scores across instances.

### Can I scan any website I want or just my own?

A DNS / web root file verification process has been added in v0.4.1, thus you can only scan websites you have access to their DNS zones or web root.
Verification is shared per `(group, registrable_domain)` and stored in dedicated verification records.

To verify your website either:

- add a TXT DNS record for `hesperida.yourdomain.com` with `verification_code` as its value, or
- add a `hesperida-${verification_code}.txt` (empty) file to your web root

then verify it via the dashboard or use the `/api/v1/websites/[id]/verify` API endpoint.

### Can I use it in a CI/CD pipeline?

Yes, as long as you use a proper (a.k.a. with a live domain) staging environment.

### Can I run my own SaaS out of this?

In theory, as long as you respect the [AGPL license](./LICENSE), yes; multi-tenancy is baked in. In practice, it would take a lot of effort to scale this in its current form (self-managed docker containers), and be a nightmare to maintain.
If I decide to spin up a SaaS, I will write a proprietary kubernetes orchestrator from scratch and use SurrealDB cloud as well.

### I want to change my user group.

Only superusers can do that. As a non-superuser all you can do is delete or transfer the ownership of any websites you own and delete your account. If you want to start a new group sign up (provided sign ups are enabled), else ask a user to invite you.

### Is this a vibe coded project?

Hesperida is an AI assisted developed project. More specifically; all the architecture, schema, and design decisions are my own. All the code for the first couple minor versions (most tools, db, and orchestrator) was hand-written. Since v0.3.0 about 90% of the code is AI generated using OpenAI Codex.

### Can you add/change X feature?

Open an [issue](https://github.com/rallisf1/hesperida/issues/new) and we'll see.

### How can I contribute?

1. Open an Issue
2. Fork the repo
3. Do your changes
4. Test them
5. Submit a PR that closes your issue

## License

AGPL v3
