---
title: Dashboard Overview
sidebar_position: 1
---

# Dashboard Overview

The dashboard is built with SvelteKit and consumes the internal `/api/v1` contracts.

## Main Areas

- **Home**: KPI cards, throughput charts, live queue table
- **Users**: role/group-scoped user management
- **Websites**: website lifecycle, membership, verification, ownership transfer
- **Jobs**: job creation, status tracking, result drill-down
- **Tasks**: queue task list + detail + cancellation where allowed
- **Compare**: pairwise diff view for completed queue tasks (`/job-queue/{id}/diff`)

## Live Updates

Dashboard uses SSE streams for:

- homepage/job-queue task updates
- notification toasts for status transitions

## PDF Reports

From job details, the UI can request PDF generation through Gotenberg.

- HTML source: `/jobs/{id}/pdf`
- downloaded file is streamed back by dashboard endpoint

## Access Behavior

- `/auth/*` remains public
- dashboard routes require valid session
- unauthenticated users are redirected to `/auth/signin`

{/* TODO:Add UX conventions page (table filters, statuses, badges, actions) once design system patterns are frozen. */}
