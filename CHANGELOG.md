
# Change Log
All notable changes to this project will be documented in this file.
 
The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [0.3.1] - 2026-04-02

### Added

- Queue retries with bounded backoff (`attempts`, `next_run_at`).
- WCAG multi-device task fanout with per-device screenshots.
- Domain DNS records in `domain_results.records` via [subfinder](https://github.com/projectdiscovery/subfinder).
- Usage of Cloudflare's DoH endpoint for DNS TXT resolution fallback.
- Security debug dedupe counters (`raw.debug` when `DEBUG=true`).
- Troubleshooting notes in `dev_notes.md`.

### Changed

- `jobs.wcag` now stores an array of WCAG result records.
- WCAG queue completion now matches task by target device.

### Fixed

- WCAG: install chromium after docker cache invalidation to prevent playwright version mismatch.

## [0.3.0] - 2026-04-01

### Added

#### Tools

- Stress test scanner (Vegeta)

### Changed


## [0.2.0] - 2026-04-01
  
### Added

- Security scan tool
- Queued Tasks options passed as environment variables to the containers

#### Tools

- Security scanner (nuclei + nikto + wapiti)

### Changed

- Removed the `domainTools` constant, and implemented domain parsing in the SSL tool's code.

### Fixed

- Limit the WCAG score number to 2 decimals

## [0.1.1] - 2026-03-20
  
1. fail on curl error response
2. entry work on security tool
 
### Added

#### Tools

- Security scanner (nuclei + nikto + wapiti) - WIP

### Changed
 
### Fixed

- `probe`, `seo`, and `whois` tools don't fail when there's a database error.

## [0.1.0] - 2026-03-20
  
Initial Commit
 
### Added

#### Tools

- Domain scanner (rdapper)
- Probe scanner (httpx)
- SEO scanner (@seomator/seo-audit)
- SSL scanner
- WCAG Checker (@axe-core)
- Whois scanner

#### Other

- Orchestrator (dockerode)
- Database & Schema (SurrealDB)

### Changed
 
### Fixed
