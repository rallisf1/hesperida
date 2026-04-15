---
title: Task Compare (Diff)
sidebar_position: 2
---

# Task Compare (Diff)

Hesperida provides a pairwise diff view for completed queue tasks of the same tool type.

## Purpose

- Compare two completed runs directly.
- Identify what became better, worse, fixed, or unchanged.
- Inspect score and latency deltas where applicable.

## Entry Point

From `/job-queue`, open a completed task row and choose `Compare` from the actions menu.

This opens:

- `/job-queue/{leftTaskId}/diff`

The left side is preloaded from the route param.

## Comparison Flow

1. Left task/result is loaded by page `load`.
2. User selects a right task in the compare form.
3. Form submission (`use:enhance`) fetches only the right task/result.
4. Diff computation runs in the frontend.

There is no backend compare endpoint for this feature.

## Constraints

- Both tasks must be `completed`.
- Both tasks must be of the same `type`.
- Left task is excluded from right-side candidates.
- Optional `Same Website only` switch narrows right-side options.

## Output

The diff table classifies rows as:

- `new`
- `fixed`
- `stale`
- `changed`

Summary cards show counts per classification.

When available:

- score delta is shown for score-based tools
- latency delta is shown for tools exposing latency metrics

## Swap

After both sides are populated, `Swap` reverses left/right and recalculates the diff in place.
