
# Change Log
All notable changes to this project will be documented in this file.
 
The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

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

