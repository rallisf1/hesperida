## run a single tool for testing

docker compose run --rm probe https://www.mywebsite.com jobs:myjobid

replace `probe` with the tool you want

## Troubleshooting quick guide

### DB lock/contention issues (rocksdb)

- Symptom: intermittent DB write failures on bursts (often with whois/security/stress overlaps).
- First checks:
  - SurrealDB logs for lock errors/timeouts
  - current queue pressure by status in `job_queue`
- Mitigation:
  - reduce concurrent heavy scans (CPU/RAM)
  - rerun failed jobs after load drops

### Orchestrator container run failures

- Symptom: `Running container hesperida-<tool> failed!`
- First checks:
  - verify docker socket mount exists: `/var/run/docker.sock`
  - verify image exists: `docker image ls | grep hesperida-`
  - verify tool files mounted in orchestrator (`/tools/<tool>`)
- Mitigation:
  - rebuild tools: `docker compose --profile tools build`
  - restart backend profile
