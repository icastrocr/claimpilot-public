# ClaimPilot — Claude Code Instructions

## Mandatory: Rebuild Docker After Code Changes

**EVERY time backend or frontend code is modified, rebuild the affected container(s) before considering the task complete:**

```bash
# After backend changes:
docker compose up -d --build backend

# After frontend changes:
docker compose up -d --build frontend

# After changes to both:
docker compose up -d --build backend frontend
```

**Why:** The app runs inside Docker. Source edits are NOT live — the container must be rebuilt for changes to take effect. Skipping this step means the fix appears in the code but the running app still has the old behavior.

## Project Overview

- **Stack:** Express + Prisma backend, React + Vite frontend, PostgreSQL, Docker Compose, nginx reverse proxy
- **API envelope:** All responses wrapped in `{ data: ... }`; frontend uses `unwrap<T>()` helper
- **Prisma:** camelCase in JS, snake_case in PostgreSQL via `@map`
- **AI PDF extraction:** Uses `claude-sonnet-4-20250514` with structured JSON prompts per document type (Superbill, Invoice, EoB)

## Service & Claim Lifecycle

- **Service:** unsubmitted → claim_ready → claimed
- **Claim:** draft → submitted → resolved → paid → closed (+ denied, reprocessing, appealed, write_off)
- EoB import matches existing **draft** claims by clinician + date overlap (does NOT create new claims)
- Per-line EoB financials stored on ServiceLineItem

## EoB Clinician Matching

EoB PDFs use format `"F LASTNAME"` (e.g., `"J DOE"` for Jane Doe, `"A SAMPLE"` for Alex Sample). The matching logic uses 3 strategies in order:
1. Direct `contains` (either direction, case-insensitive)
2. Substring match across all clinicians
3. First-initial + last-name match (handles the `F LASTNAME` format)

## Key Directories

- `backend/src/routes/` — Express route handlers
- `backend/prisma/` — Schema and migrations
- `frontend/src/pages/` — React page components
- `frontend/src/lib/api.ts` — API client with `unwrap<T>()`
- `docs/SPEC.md` — Full project specification
- `CHANGELOG.md` — Version history
