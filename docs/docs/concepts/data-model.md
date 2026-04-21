---
title: Data Model
sidebar_position: 2
---

# Data Model

## Core Tables

- `users`
- `websites`
- `jobs`
- `job_queue`
- `schedule`
- `notification_channels`
- `website_notifications`

## Result Tables

- `probe_results`
- `domain_results`
- `whois_results`
- `ssl_results`
- `seo_results`
- `wcag_results`
- `security_results`
- `stress_results`

## Key Relationship Rules

- `websites.owner`: single owner (`record<users>`)
- `websites.users`: member list (`array<record<users>>`)
- `jobs.website`: website reference
- `job_queue.job`: job reference
- `notification_channels.user`: channel owner
- `website_notifications.website`: linked website
- `website_notifications.notification_channel`: linked channel

## User ACL Fields

- `role`: `admin | editor | viewer`
- `group`: tenant scope
- `is_superuser`: global override

## Verification Fields

- `websites.verification_id`
- `website_verifications.group`
- `website_verifications.registrable_domain`
- `website_verifications.verification_code`
- `website_verifications.verified_at`
- `website_verifications.verification_method`

## Important Events

- Result completion events: link tool output to job + queue row.
- `job_completion_check`: marks jobs completed when required outputs exist.
- Queue cancel event: can transition parent job to failed.
- User deletion event:
  - deletes owned websites
  - removes user from website member arrays

{/* TODO:Add an ERD diagram with cardinalities and event names once schema stabilizes. */}
