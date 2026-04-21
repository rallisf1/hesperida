---
title: Auth and ACL
sidebar_position: 2
---

# Auth and ACL

## Identity Fields

Each user has:

- `role`: `admin | editor | viewer`
- `group`: tenant grouping string
- `is_superuser`: global capability override

## Access Rules (Effective)

- **Superuser**
  - global visibility and management
- **Admin (non-superuser)**
  - group-scoped management
  - website access by membership/ownership/group rules
- **Editor**
  - website scope: owner or invited member
  - can invite editor/viewer users on eligible websites
- **Viewer**
  - member-only website access
  - cannot create websites/jobs/cancel tasks

## Ownership Constraints

- Viewers cannot own websites.
- Role downgrade to viewer is blocked when user owns websites.

## Notification ACL

- `notification_channels`: owner CRUD, superuser global CRUD.
- `website_notifications`:
  - requires website access
  - non-superusers can only link channels they own
  - superuser can link any channel/website combination

## Signup Policy

- `AUTH_SIGNUP_ENABLED=true`: signup allowed
- `AUTH_SIGNUP_ENABLED=false`: signup returns `403 signup_disabled`

## Superuser Bootstrap

At API startup, the system ensures:

- `hesperida@local.me` exists
- password matches `SURREAL_PASS`
- `role='admin'`
- `is_superuser=true`

{/* TODO:Document final “group lifecycle” policy (rotation/merge/split) once product decisions are finalized. */}
