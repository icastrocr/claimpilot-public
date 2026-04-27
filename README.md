# ClaimPilot

> Submission for the **Klaviyo AI Builder Residency** — April 2026
> Built end-to-end by a non-engineer using AI-assisted development for a real, deployed-to-life problem.

> **Looking for the traditional codebase README?** See [README-CLAIMPILOT.md](README-CLAIMPILOT.md) for architecture diagrams, status lifecycles, project layout, the full API surface, and version history. This README is the submission narrative.

---

## Problem Statement

Out-of-network (OON) behavioral-health claims in the U.S. are a structurally underserved problem. The best clinicians for kids — psychologists, family therapists, neuropsych specialists — frequently don't take insurance, so families pay cash up front and have to file the claims themselves to recover anything. The insurer's portal is built for in-network providers, not self-filers: there's no batch mode, sessions time out, fields silently revert, and nobody offers software for this market because the addressable user is *"individual parents and patients,"* not *"providers"* or *"payers."*

**Who is most affected:** parents managing OON behavioral-health care for a dependent — typically a child with chronic mental-health needs (ADHD, anxiety, depression, executive-function challenges). Therapy is weekly. Sessions are $150–$250 each. Without disciplined filing, families leave thousands of dollars per year on the table.

**Why this matters:** the existing third-party services that "do the filing for you" take 5–10% of the recovered amount and still leave the family doing the document gathering. The structural gap is real software, owned by the patient, that turns a multi-hour evening of copy-paste into something a busy parent can finish in a sitting.

**What success looks like:**
- A month's worth of claims is modeled, submitted, and reconciled in <30 minutes total.
- Zero data lost to portal timeouts.
- Every claim has a confirmation number and a downloaded PDF on file.
- Reimbursements actually land — measurable in dollars recovered per cycle.

**By the numbers (as of April 2026):**

| Metric | Count |
|---|---|
| Individual services (appointments) tracked | **125** |
| Claims submitted to the insurer | **9** |
| Claims fully closed (submitted → EoB received → reimbursement processed) | **7** |

The remaining 2 claims are in-flight, not failed — they're working their way through normal insurer processing.

I know it works because it's been working in my own household.

---

## Solution Overview

**ClaimPilot** is a local-first, Docker-Compose-orchestrated full-stack application — React + Vite frontend, Express + TypeScript backend, PostgreSQL 16 via Prisma — paired with two AI integrations: a runtime PDF-extraction layer powered by Claude Sonnet 4, and a supervised browser-automation layer for portal submission. It does five things:

1. **Models claims** the way they actually work — providers, patients, diagnosis codes, CPT/POS codes, service lines, amounts, statuses — across a 16-table relational schema instead of letting them live in 12 PDFs and an inbox.
2. **Extracts structured data from raw PDFs** using Claude Sonnet 4 via the Anthropic SDK. Superbills, provider invoices, and Explanation-of-Benefits PDFs are parsed into structured rows: dates, CPT codes, place-of-service, amounts billed, amounts allowed, patient responsibility. The user uploads a PDF; ClaimPilot turns it into a draft claim or a reconciled EoB.
3. **Manages claim lifecycle** with explicit states (Draft → Submitted → Reimbursed), edit-in-place service lines, and a "Mark as Submitted" bulk action so a month's filings move through one clear pipeline.
4. **Submits claims to the insurer's portal** via a browser-side automation layer that drives `liveandworkwell.com` end-to-end: prefill from a similar prior claim, edit each service line, review, submit, capture confirmation number, download PDF.
5. **Harvests Explanation-of-Benefits PDFs** in batch from the UHC member portal using a credentialed `fetch` loop — turning an afternoon of one-click-at-a-time downloads into about a minute.

**Where AI sits in the system.** AI is integrated at *three* levels, and all three are load-bearing:

- **In the product, at run time, for structured data extraction.** The backend calls Claude Sonnet 4 (`claude-sonnet-4-20250514`) via the Anthropic SDK to parse Superbill, Invoice, and Explanation-of-Benefits PDFs into structured rows. This replaces what would otherwise be brittle regex/OCR pipelines, and handles the genuine variability of how different providers and insurers format the same document type. Without LLM extraction, this product is a database with a manual data-entry chore on top of it.
- **In the operational surface, at run time, for portal submission.** The claim-submission step is an **agentic workflow** — a Claude-driven session (via Cowork) runs the browser automation against the insurer portal: multi-step reasoning ("which prior claim is the closest prefill candidate? which service lines need to be deleted vs. edited? has this field actually saved or did the React form silently reject the input?"), tool use (reading the live DOM, calling `__reactProps$.onChange`, downloading PDFs via authenticated `fetch`), and supervised execution (the human approves the final Submit click). This is meaningfully better than a non-AI approach: the portal's specific failure modes — silent field reverts, session expiries, prefill quirks — require *adaptive* logic at each step, not a fixed deterministic script. A traditional automation would break the first time the portal nudged its DOM. The agent adapts.
- **At build time, for development itself.** The entire codebase was written with **Claude Code** as the primary collaborator. As a non-engineer, I specify problems, constraints, and acceptance criteria, and review every diff. Without AI-assisted development, this product does not exist.

The AI doesn't make the *clinical decisions* — those are the family's medical reality. AI's job is to be a tireless, observant translator: from a stack of PDFs into structured data, and from structured data into a correctly-filed claim on a portal that was never designed for self-filers.

---

## AI Integration

**Models and tools used**
- **Claude Sonnet 4 (`claude-sonnet-4-20250514`) via the Anthropic SDK** — runtime, in-product. Called from the Express backend to extract structured fields (dates, CPT codes, POS, amounts, totals) from three different PDF document types: provider Superbills, provider Invoices, and insurer Explanation-of-Benefits documents. Each document type has its own structured-output schema and prompt; results are validated with Zod before being persisted.
- **Claude (via Cowork desktop app)** — runtime, agentic. Drives the insurer's portal step-by-step under user supervision. The user approves the final irreversible action; everything before it is delegated.
- **Claude (via Claude Code)** — build-time. Primary collaborator on the codebase: schema design, route handlers, React components, the PDF-extraction prompts and validators, the automation helpers, the EoB harvester, debugging, refactors, and most of this README.

**Agentic / LLM patterns in use**
- **Structured extraction with schema validation.** PDF parsing is not "ask the model what's in this document and hope." Each document type has a target shape (Zod schema), the prompt asks for that shape explicitly, and the response is parsed and validated before it becomes a database row. Failed validation falls back to the user with a specific diff of what's missing.
- **Multi-step reasoning per claim submission.** Each submission requires: choose a prefill source, evaluate which existing service lines to keep/copy/delete, transcribe each line correctly into a React form, verify the running total, submit. The agent walks this path one step at a time, observing the DOM after each action.
- **Tool use against the live page.** The agent reads from the DOM (`querySelectorAll`, value inspection), writes to it via the React-internal handler (`__reactProps$.onChange`), and clicks via lookup-by-text (`Element.click()` on the button whose `textContent` matches). This is non-trivial orchestration — the portal punishes naive automation.
- **Runbook-as-memory (curated RAG).** A markdown process doc is the agent's persistent memory between sessions. Hard-won findings — "save after every line," "delete from last to first to avoid index shift," "prefill dialog radios must use JS click, not coordinate click" — are captured there, and every new session reads it before acting. Deliberately small, narrow, and accurate. This domain has maybe 30 facts worth knowing about; a hand-curated markdown file beats a vector store. The redacted runbook is included with this submission at [`docs/portal-submission-runbook.md`](docs/portal-submission-runbook.md).
- **Human-in-the-loop on irreversible actions.** Drafting, editing, extraction are all delegated. The final Submit click is human-approved — both because it's the right product decision and because it makes the system trustworthy enough to actually use on real money.

**Why these choices**
- **Claude Sonnet 4 for PDF extraction:** the extraction task isn't OCR — Superbills and EoBs are typically already digital text PDFs. The hard part is the *variability of layout* across different providers and insurers, where deterministic templates would require a parser per format. A capable LLM, called with a strict structured-output schema, generalizes across formats with one prompt per document type. Sonnet 4 hits the cost/quality point that makes per-document calls trivially cheap relative to time saved.
- **Claude (Cowork) over deterministic script for portal automation:** the portal's DOM is unstable, fields revert silently, and the prefill flow's "previous claim" list reorders. A deterministic Selenium-style script would be a nightmare to maintain. An agent that re-reads the DOM after each action and reasons about state recovers gracefully.
- **Claude Code over alternatives for build-time:** I'm a PM, not a software engineer. Claude Code's "spec-driven" affordance — accepting a constraint-rich problem statement and producing reviewable diffs — is the closest match to how I already think.
- **Local-first via Docker Compose over hosted SaaS:** the data is PHI for a member of my family. The default answer for that data class is "stays on this machine." `docker compose up` sidesteps the entire HIPAA-compliance burden of hosted deployment, while keeping the architecture portable to a HIPAA-compliant cloud later if the product ever serves users beyond me.

**Tradeoffs considered**
- **LLM extraction cost vs. accuracy.** Each PDF extraction is one Sonnet 4 call with structured output. At monthly batch volume the bill is negligible. If this product ever served thousands of users, I'd add a cheaper-model first pass with confidence-based escalation to Sonnet for low-confidence pages.
- **Validation strictness.** Zod-validating the LLM's structured output catches malformed or hallucinated fields before they ever reach the database. The cost is occasional re-runs when the model returns a near-miss; the benefit is data integrity.
- **Latency vs. reliability of the portal agent:** the agent is slower than a hand-written deterministic script when both work, but vastly more reliable when the portal changes. Worth it for monthly batch use.
- **Cost of building with AI:** for a side project shipped by one person, the API bill is trivial. The bill that actually matters is "what would this have cost to build by hiring an engineer?" — and the answer is *I would never have shipped it.*
- **Reliability of agentic submission:** 9 claims submitted to date; 7 fully closed with reimbursement processed; 2 in-flight. Failure mode is almost always portal session timeout, which the runbook handles. None of the 9 have been rejected for incorrect data.

**Where AI exceeded expectations**
- The first time Claude correctly diagnosed a "field looks set but reverts on save" bug as a React-internal state-management issue — and proposed `__reactProps$.onChange` before I'd even named React — I knew this collaboration model worked for non-trivial debugging.
- Generating the `setReactValue` helper plus a comprehensive set of input-finder utilities took one focused session.

**Where AI fell short**
- Models hallucinate selectors. If I asked "find the procedure-code input," I'd sometimes get a CSS selector that worked on the developer's mental model of the portal, not the actual DOM. The fix was to *always* have the agent read the DOM first and propose a selector grounded in observed elements — a "look before you leap" prompt pattern.
- Long, drifting sessions degrade. The reliable workflow is short sessions with explicit recap of context — which is exactly why the runbook exists.

---

## Architecture / Design Decisions

**High-level shape**

```
┌────────────────────────────────────────┐         ┌────────────────────────┐
│   ClaimPilot (docker compose up)       │         │   Insurer portal       │
│                                        │         │   (liveandworkwell.com)│
│   ┌──────────┐    ┌──────────────┐     │         │                        │
│   │ Frontend │◀──▶│   Backend    │     │         └───────────▲────────────┘
│   │ React +  │    │ Express + TS │     │                     │
│   │ Vite SPA │    │ Prisma ORM   │     │                     │
│   │ Tailwind │    │ JWT auth     │     │                     │
│   │ shadcn/ui│    │ Anthropic SDK│─────┼──── PDF extraction  │
│   └──────────┘    └──────┬───────┘     │     (Sonnet 4)      │
│                          │             │                     │
│                   ┌──────▼───────┐     │                     │
│                   │ PostgreSQL 16│     │                     │
│                   │ 16 tables    │     │                     │
│                   │ DECIMAL(10,2)│     │                     │
│                   └──────────────┘     │                     │
└────────────────────────────────────────┘                     │
                                                               │
┌──────────────────────────────────────┐                       │
│  Cowork desktop (Claude agent)       │     supervised        │
│  - Reads runbook                     │─────browser───────────┘
│  - Drives portal step-by-step        │     automation
│  - Captures confirmation #           │
└──────────────────────────────────────┘
```

**Stack**

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 20 (Alpine in Docker) |
| Backend framework | Express + TypeScript |
| ORM | Prisma (camelCase JS ↔ snake_case Postgres via `@map`) |
| Validation | Zod |
| Auth | JWT (access + refresh), bcrypt for password hashing |
| AI (runtime) | Anthropic SDK, `claude-sonnet-4-20250514` for PDF extraction |
| Backend testing | Jest |
| Frontend | React + Vite 6 + TypeScript |
| Frontend data layer | TanStack Query + Axios |
| Frontend styling | Tailwind CSS + shadcn/ui primitives + lucide-react icons |
| Database | PostgreSQL 16 (Alpine) |
| Schema | 16 tables, monetary fields use `DECIMAL(10,2)`, snake_case columns, soft deletes via `deleted_at`, `created_at`/`updated_at` audit fields on every table |
| Migrations | Prisma Migrate |
| Orchestration | Docker Compose — three services: `frontend`, `backend`, `db` |
| Reverse proxy / static serving | nginx:alpine on port 80 (host 3000) for the built Vite SPA |

**API conventions**
- RESTful under `/api/v1/`
- Response envelope: `{ data: ... }` for success, `{ error: { code, message } }` for errors
- Frontend uses an `unwrap<T>()` helper to strip the envelope
- Bearer token auth on all routes except `/auth/*`

**Project layout**
```
claimpilot/
├── backend/
│   ├── src/routes/        # Express handlers
│   ├── src/lib/           # Prisma client, Anthropic SDK wrapper
│   ├── src/utils/         # Zod validators, error types
│   ├── src/test/          # Jest tests
│   └── prisma/            # Schema + migrations
├── frontend/
│   ├── src/pages/         # Route components
│   ├── src/components/ui/ # shadcn/ui primitives
│   └── src/lib/           # API client, utils
├── docs/SPEC.md
├── CHANGELOG.md
└── docker-compose.yml
```

**The PDF-extraction layer**
- Backend exposes upload endpoints for three document types: Superbill (provider-issued summary of services), Invoice (raw provider bill), and EoB (insurer's response).
- Each endpoint passes the PDF to Claude Sonnet 4 via the Anthropic SDK with a document-type-specific prompt and a target structured-output shape.
- Responses are parsed and **validated with Zod** before insertion. Validation failures surface back to the user with a specific diff of what's missing — better to ask for a re-upload than to write bad data into the claim record.
- This is the difference between "ClaimPilot is a database I have to manually fill" and "ClaimPilot turns my monthly stack of PDFs into a draft claim batch in a few minutes."

**The portal-automation layer**
- Pure browser-side JavaScript executed in the user's *already-authenticated* session. No headless browser. No stored insurer credentials. The user remains the principal — strong privacy/security choice and operationally simpler.
- All page interactions go through two helpers:
  - `setReactValue(input, value)` — uses the React fiber's `__reactProps$` key to call `onChange` directly, because standard DOM events are silently dropped by the portal's controlled inputs.
  - `clickByText(text)` — finds buttons by their `textContent` and calls `.click()`. Coordinate-based clicks miss too often.
- **Save after every service-line edit.** Non-negotiable — written into the runbook in blood (well, in lost form data). This eliminated the entire "session timeout cost me an evening of work" failure class.

**Tradeoffs and assumptions**
- **Local-first via Docker Compose over hosted SaaS.** I lose remote backup convenience. I sidestep the entire HIPAA-compliance burden of hosted PHI. The architecture remains portable to a HIPAA-compliant cloud later if the product ever serves users beyond my household.
- **LLM extraction over deterministic PDF parsing.** I lose deterministic, free-tier extraction. I gain robustness across the long tail of document layouts that providers and insurers actually use, and I never have to write a parser-per-format.
- **Browser-side automation over headless / RPA framework.** I lose unattended scheduling. I gain "user is logged in and supervising," which both respects the insurer's TOS spirit and keeps me honest about which step I want a human to approve.
- **Runbook-as-memory over vector-store RAG.** I lose semantic search. I gain a small, hand-curated, fully-correct memory layer — which is what this domain actually needs.
- **TanStack Query over Redux/Zustand.** Server state lives where the server is. Client-only state is small enough that React hooks suffice.
- **Prisma over a hand-rolled SQL layer.** Type-safe migrations and type-generated query helpers are worth the abstraction cost when a non-engineer is the maintainer.

---

## What did AI help you do faster, and where did it get in your way?

**Where AI was a force multiplier**
- **The initial scaffold.** Going from "I know what a claim is" to a running Next.js app with a credible data model and CRUD pages took an evening, not a weekend.
- **The React-internals diagnosis.** I described the symptom — "fields look right, save returns success, but reload shows the old value" — and Claude correctly named the controlled-input / `__reactProps$` issue and proposed the fix in the same response. That's the hour-saver that made the rest of the project tractable.
- **Boilerplate I'd never have written.** The lookup utilities for finding the right form input among dozens, the click-by-text helper, the "find all 'edit' buttons in service-line position" iterator — these are the kind of glue code that would have made me bounce off the project entirely.
- **Refactors.** When I changed the claim-status model mid-build, propagating the change through routes, components, and the bulk-action UI was a single conversation, not a week of manual edits.

**Where AI got in my way**
- **Confident hallucination of selectors and DOM shape.** Models will happily invent a `[data-testid="..."]` that does not exist. The fix is process: never let the model propose a selector without grounding it in an observed DOM dump first.
- **Quietly wide-blast-radius edits.** "Improve the styling on the claims list" can become "rewrote the entire layout." The fix is process: ask for diffs scoped to specific files, demand small commits, and review every change.
- **Drift in long sessions.** After ~30 turns the model loses the thread. The fix is process: short focused sessions, recap explicitly, and lean on the runbook to re-establish context.
- **Test culture.** Claude is happy to generate tests, but the marginal utility of unit tests against a portal whose DOM may change tomorrow is low. Most testing here is end-to-end against a real claim — manual, supervised, with the runbook as the regression suite.

**How using these tools changed my approach**
- I stopped scoping projects by *"can I personally write all of this?"* and started scoping them by *"can I personally specify and review all of this?"* That's a much bigger envelope.
- I lean harder on writing — runbooks, specs, problem statements — than I ever did before. Writing well *is* prompting well. The two skills converged.
- I supervise irreversible actions and delegate everything else. That's true at the keyboard and would be true on a team.

---

## Getting Started / Setup Instructions

> ClaimPilot is local-first by design — `docker compose up` and you're running.

**Prerequisites**
- Docker Desktop (or Docker Engine + Compose)
- An Anthropic API key (for the PDF-extraction backend service)

**Run it**
```bash
# Clone the repo
git clone https://github.com/icastrocr/claimpilot-public.git
cd claimpilot-public

# Configure environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY for the PDF-extraction features.
# The other defaults in .env.example work for local development as-is.

# Bring up the three-service stack (build images on first run)
docker compose up --build
```

You should see three services come up: `frontend` (nginx serving the Vite build, exposed on host port 3000), `backend` (Express + TypeScript on port 4000), and `db` (PostgreSQL 16 on port 5432). Prisma migrations run automatically on backend startup.

Open **http://localhost:3000** to use ClaimPilot.

**Using the run-time portal-submission agent (optional but recommended)**
1. Log in to your insurer's portal in Chrome as you normally would.
2. Open the Cowork desktop app with this project's folder selected.
3. Ask: *"Submit the February batch of claims, using the runbook at `docs/portal-submission-runbook.md`."*
4. The agent will read the runbook, propose its plan, and execute under your supervision. You approve the final Submit click for each claim.

---

## Demo

A 5-minute walkthrough is published at this [Google Drive folder](https://drive.google.com/drive/folders/11X8ROvElqTzQdmJDL2v5gyDX25VlxRZx?usp=drive_link) (and linked from the application form's Video URL field). The video covers:

1. **The problem** — why OON behavioral-health filing is broken and who's affected (~45s).
2. **Live demo of the working solution** — a Draft claim in ClaimPilot, prefilled into the insurer portal, edited via the React-internal handler, submitted, confirmation number captured, status updated in ClaimPilot (~75s).
3. **The EoB harvester** — paginated `fetch` loop downloading 100+ EoBs to a named folder (~45s).
4. **Architecture and AI integration** — how the agent uses the runbook, how the supervision boundary works, why this is genuinely agentic and not scripted (~60s).
5. **What I'd build next** — multi-payer, reimbursement reconciliation, generalization to other self-filed paperwork (~30s).
6. **Why I'm applying** — sign-off (~15s).

To reproduce the demo locally, follow Getting Started above. The `demo@claimpilot.local / password123` user is seeded automatically on first boot, **pre-populated with a redacted snapshot of a real working dataset**: 13 claims spanning the lifecycle (draft → submitted → paid), 125 service line items, 2 reconciliation reports, full claim-event history. Real OON adjudication amounts are preserved so the financial story reads honestly; names, NPIs, claim numbers, and dates have been replaced with placeholders or shifted by 30 months. To start with an empty database instead, delete `backend/prisma/seed-data.json` before booting. To regenerate the fixture from a different source DB, see [`backend/scripts/README.md`](backend/scripts/README.md). No real PHI ships with the repo.

---

## Testing / Error Handling

The product was built with portal hostility as a first-class assumption. Specific failure modes I designed against:

| Failure mode | How ClaimPilot handles it |
|---|---|
| **Insurer portal session timeout mid-batch** | Save after every service-line edit. Confirmation numbers and PDFs captured per-claim, so a half-done batch is recoverable. Resume instructions in the runbook. |
| **React form fields silently revert** | All input mutation goes through `setReactValue`, which uses `__reactProps$.onChange`. Native DOM event fallback exists but is only used when the React fiber isn't found. |
| **Coordinate-based clicks miss** | All clicks go through `clickByText` (lookup by `textContent` + `Element.click()`). |
| **Service-line index shift on delete** | Always delete from last to first. Documented in the runbook; the agent reads it before acting. |
| **Prefill dialog closes when clicking a radio** | Use JS `radios[n].click()` rather than coordinate clicks. |
| **ClaimPilot "View" links collide on a claims list** | Extract `href`s via JS and navigate with `window.location.href` rather than relying on the visible UI. |
| **Pharmacy claims have no EoBs** | EoB harvester detects this via the API response and skips them automatically. |
| **Confirmation number not captured** | Submission is not considered complete until the confirmation number is observed and recorded. The agent re-reads the page to confirm. |
| **Wrong claim submitted** | Last line of defense: the human approves the Submit click after reviewing the running total against ClaimPilot's expected total. They must match exactly. |

Testing approach is end-to-end and supervised. Each monthly batch is a real test against the real portal. The runbook is the regression suite — every issue I've ever seen is in it, with the fix.

**Production track record:** 125 services tracked, 9 claims submitted, 7 fully reconciled with reimbursement (full lifecycle: drafted in ClaimPilot → submitted to portal → EoB received → reimbursement processed). The remaining 2 are in-flight. None of the 9 submissions have been rejected for incorrect data.

---

## Future Improvements / Stretch Goals

1. **Multi-payer support.** UHC was the one I had to solve. The architecture is portal-pluggable; Aetna, Cigna, Anthem, and BCBS each need their own automation profile. The reusable shape is *portal driver + form mapping + state machine.*
2. **Reimbursement reconciliation.** Pull EoBs back into ClaimPilot, parse them, and close the loop on which claims actually got paid, denied, or partially adjusted. This turns ClaimPilot from "filer" into "ledger."
3. **Appeals workflow.** When a claim is denied, the same primitives — runbook + supervised browser automation + structured state — can drive an appeal letter, a peer-to-peer review request, or a state insurance commissioner complaint.
4. **Generalization beyond healthcare.** The OON behavioral-health filing problem is a specific case of a broader class: structured forms, brittle portals, a user who knows what should happen but is forced to be a human RPA. The same primitives apply to HSA reimbursement, school-district special-education filings, and FSA appeals.
5. **A "second-pair-of-eyes" review step.** Before the human approves Submit, have the agent generate a one-paragraph summary of *what it's about to submit* — provider, dates, codes, amount — and require explicit confirmation. Catches transposition errors that the running-total check would miss.

---

## Link to website URL or application

ClaimPilot is intentionally **not** a public-facing SaaS. The application runs locally on the user's machine because the data class — health information for a family member — does not belong on someone else's server.

The repository is the artifact. A walkthrough video is linked in the application.

---

## Repository Tour

This README is the submission narrative. For a codebase walkthrough — architecture diagrams, status lifecycles, file layout, full API surface, and database schema — see **[README-CLAIMPILOT.md](README-CLAIMPILOT.md)**. Other reference material lives in:

- **[docs/SPEC.md](docs/SPEC.md)** — full product specification (data model, all 16 tables, phased build plan, code reference tables).
- **[docs/portal-submission-runbook.md](docs/portal-submission-runbook.md)** — the agent's persistent memory: portal quirks, React-internals workarounds, troubleshooting matrix.
- **[CHANGELOG.md](CHANGELOG.md)** — version history (v0.1.0 through v0.4.0).
- **[docs/examples/README.md](docs/examples/README.md)** — guidance on supplying your own test PDFs (the originals contained PHI and were removed).

---

## Acknowledgments

**AI tools**
- **Anthropic's Claude** — runtime PDF extraction (Claude Sonnet 4 via the Anthropic SDK), runtime portal-submission agent (Cowork desktop), and primary build-time collaborator (Claude Code).

**Open-source dependencies**
- **Backend:** Node.js, Express, TypeScript, Prisma, Zod, jsonwebtoken, bcrypt, Jest, the official `@anthropic-ai/sdk`.
- **Frontend:** React, Vite, TypeScript, React Router, TanStack Query, Axios, Tailwind CSS, shadcn/ui, lucide-react.
- **Infrastructure:** PostgreSQL 16, Docker, Docker Compose, nginx.

No proprietary code from any current or former employer is included. No bundled SDK from the insurer (none exists). No third-party analytics. No live credentials in the repository.

**Inspiration**
- **Klaviyo** — for designing a hiring program that takes builders at face value and evaluates them by what they ship. Whatever happens with this application, the format itself is a statement worth making.

---

*Built by Ignacio Castro · April 2026 · For the AI Builder Residency.*
