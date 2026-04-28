# ClaimPilot — Technical Reference

> Out-of-Network Mental Health Claims Management Platform — codebase walkthrough.

> *For the submission narrative (Klaviyo AI Builder Residency, April 2026), see [README.md](README.md). This document covers architecture, lifecycles, file layout, and the API surface.*

ClaimPilot helps parents of children receiving out-of-network mental health services manage the full lifecycle of insurance claims — from service tracking through payment reconciliation.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  nginx   │───▶│   Express    │───▶│  PostgreSQL   │  │
│  │ :3000    │    │   API :4000  │    │    :5432      │  │
│  │ (proxy)  │    │              │    │               │  │
│  │ + React  │    │  Prisma ORM  │    │  16 tables    │  │
│  │   SPA    │    │  JWT Auth    │    │  Migrations   │  │
│  └──────────┘    │  Claude AI   │    └───────────────┘  │
│                  └──────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
Superbill PDF ──▶ AI Extraction ──▶ Services (unsubmitted)
                                        │
                                  Generate Claims ──▶ Draft Claims (claim_ready)
                                  (groups by patient +     │
                                   clinician + clinic,     │
                                   max 6 lines/CMS-1500,   │
                                   user assigns insurance)  │
                                        │                   │
Invoice PDF ──▶ AI Extraction ──▶ Reconciliation Report     │
                                   (matches services        │
                                    vs invoice)             │
                                        │                   │
EoB PDF ──▶ AI Extraction ──▶ Apply to Draft Claims ──▶ Resolved
                              (matches by clinician +       │
                               date overlap,            Record Payment
                               writes per-line              │
                               financials)             ──▶ Paid
```

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Backend** | Node.js + Express + TypeScript | Fast development, strong typing |
| **ORM** | Prisma | Type-safe DB access, automatic migrations |
| **Database** | PostgreSQL 16 | Relational integrity for financial data |
| **Frontend** | React 19 + TypeScript + Vite | Modern SPA with fast HMR |
| **Styling** | Tailwind CSS v4 + shadcn/ui | Utility-first CSS with accessible components |
| **State** | TanStack React Query | Server state with caching |
| **Auth** | JWT (access + refresh) + bcrypt | Stateless auth, secure passwords |
| **AI** | Anthropic Claude API | PDF document extraction and parsing |
| **Container** | Docker Compose | Single-command deployment |

## Quick Start

```bash
git clone https://github.com/icastrocr/claimpilot-public.git
cd claimpilot-public
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env for document import.
# The other defaults work for local development as-is.
docker compose up --build
# Open http://localhost:3000
# Log in with email demo@claimpilot.local and password password123
# (the demo user is seeded automatically on first boot)
```

## Features

### Core Workflow
1. **Import Superbill** — Upload clinic superbill PDFs; AI extracts services, clinician info (NPI, license), patient details
2. **Track Services** — View all service line items with filters (clinician, date range, status), sortable columns
3. **Generate Claims** — Group unsubmitted services into draft CMS-1500 claims (max 6 lines each), assign insurance provider, validation checks (NPI, EIN, diagnosis codes)
4. **Reconcile Invoices** — Upload clinic invoices to reconcile against services; identifies discrepancies, missing items, cancellation fees
5. **Apply EoBs** — Upload insurance Explanation of Benefits; matches to existing draft claims by clinician + date overlap, writes per-line financials, sets status to Resolved
6. **Record Payments** — Capture payment date, check number, and amount on resolved claims; moves status to Paid
7. **Track Claims** — Full lifecycle management with status history and financial details

### Service Status Lifecycle
```
unsubmitted → claim_ready (Generate Claims) → claimed (EoB Applied)
```

### Claim Status Lifecycle
```
draft → submitted → resolved (EoB) → paid (payment recorded) → closed
                              └→ denied → appealed/reprocessing/write_off
```

### Document Import (AI-Powered)
- **Superbill Import** — Extracts CPT codes, diagnosis codes, clinician (NPI, license), patient, fees; auto-creates clinic, clinician, dependent records
- **Invoice Reconciliation** — Matches invoice line items against existing services; generates persistent reports with match/discrepancy/cancellation tracking
- **EoB Import** — Extracts claim numbers, patient account numbers, per-line financials (allowed, plan paid, deductible, copay, coinsurance, amount owed, processing codes); applies to existing draft claims

### Dashboard
- Claim status tiles with drill-down navigation
- Financial summary (total billed, total paid)
- Recent claims quick access

### Administration
- Insurance providers management
- Clinic organizations with clinician sub-records
- Dependent/patient management
- Light/dark mode

## Project Structure

```
claimpilot/
├── frontend/                  # React SPA
│   └── src/
│       ├── components/        # UI components (shadcn/ui)
│       │   ├── layout/        # Sidebar, Layout
│       │   └── ui/            # Button, Card, Table, etc.
│       ├── pages/             # Route pages
│       │   ├── DashboardPage  # Overview with stat tiles
│       │   ├── ServicesPage   # Service list with filters + sorting
│       │   ├── ClaimGroupingPage # Generate Claims wizard
│       │   ├── ClaimsListPage # Claims with clinician column
│       │   ├── ClaimDetailPage # Details, EoB table, Payment, History
│       │   ├── DocumentUploadPage # Superbill/Invoice/EoB import
│       │   ├── ReconciliationReportsPage # Recon report list
│       │   └── ReconciliationReportDetailPage # Detailed recon
│       ├── hooks/             # useAuth, useTheme
│       ├── lib/               # API client, utilities
│       └── types/             # TypeScript interfaces
├── backend/                   # Express API server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts        # Register, login, refresh
│   │   │   ├── claims.ts      # Claims CRUD + events + payment
│   │   │   ├── claim-grouping.ts  # Preview + generate draft claims
│   │   │   ├── services.ts    # Service line items CRUD
│   │   │   ├── document-upload.ts  # AI extraction + confirm
│   │   │   ├── reconciliation-reports.ts  # Recon CRUD
│   │   │   ├── insurance-providers.ts
│   │   │   ├── clinic-providers.ts  # + clinicians
│   │   │   └── dependents.ts
│   │   ├── middleware/        # Auth (JWT), error handling
│   │   ├── utils/             # Validators (Zod), error classes
│   │   └── lib/               # Prisma client
│   └── prisma/
│       ├── schema.prisma      # 16-table schema
│       └── migrations/        # 4 migrations
├── docs/
│   ├── SPEC.md                          # Full product specification
│   ├── portal-submission-runbook.md     # Agent-readable portal runbook
│   └── examples/                        # Test PDF placeholder dir
├── docker-compose.yml
└── .env.example
```

## Database Schema (Key Tables)

```
users ──────────────────────┐
  │                         │
  ├── insurance_providers   │
  ├── clinic_organizations  │
  │     └── clinicians      │
  ├── dependents            │
  │                         │
  ├── service_line_items ◀──┤ (core tracking unit)
  │     ├── status: unsubmitted → claim_ready → claimed
  │     └── links to: clinic, clinician, dependent, insurance
  │                         │
  ├── claims ◀──────────────┤ (from EoB import)
  │     ├── service_period_start/end
  │     ├── financial: billed, allowed, paid, copay, etc.
  │     ├── status lifecycle with claim_events
  │     └── links to: services, clinic, dependent, insurance
  │                         │
  └── reconciliation_reports│ (from invoice import)
        ├── summary_json (match counts, totals)
        └── items_json (per-line reconciliation)
```

## API Endpoints

All endpoints under `/api/v1/`. Auth required except `/auth/*`.

| Group | Endpoints |
|-------|-----------|
| **Auth** | POST /auth/register, /auth/login, /auth/refresh |
| **Services** | GET/POST /services, PUT/DELETE /services/:id |
| **Claims** | GET/POST /claims, GET/PUT/DELETE /claims/:id, PUT /claims/:id/payment |
| **Claim Grouping** | POST /claims/group-preview, POST /claims/generate |
| **Claim Events** | GET/POST /claims/:id/events |
| **Documents** | POST /documents/extract, /documents/confirm-superbill, /documents/confirm-eob, /documents/reconcile-invoice |
| **Reconciliation** | GET /reconciliation-reports, GET/DELETE /reconciliation-reports/:id |
| **Insurance** | GET/POST/PUT/DELETE /insurance-providers |
| **Clinics** | GET/POST/PUT/DELETE /clinic-providers, clinicians sub-routes |
| **Dependents** | GET/POST/PUT/DELETE /dependents |

## Development

### Backend
```bash
cd backend
npm install
npx prisma generate
npm run dev        # Starts on port 4000
npm test           # Run tests
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Starts on port 3000 (Vite dev server)
```

### Database
```bash
cd backend
npx prisma migrate dev    # Create/apply migrations
npx prisma studio         # Visual DB browser
npm run db:seed           # Seed the demo user (email: demo@claimpilot.local, password: password123)
```

## Version History

| Version | Description |
|---------|-------------|
| **v0.4.0** | Claim generation engine, EoB-to-draft matching, per-line financials, payment recording, claim detail rework |
| **v0.3.0** | Duplicate detection for all 3 document importers |
| **v0.2.0** | Service-level tracking, AI document import (superbill/invoice/EoB), reconciliation reports, dashboard refinements |
| **v0.1.0** | Foundation — Docker setup, auth, claims CRUD, admin config, seed data |

## Public Snapshot Note

This repository is a redacted public copy of a private working application, initialized as a **brand-new git repository with no history from the original**. The original repo's commits contained Protected Health Information (PHI — patient names, dates of service, claim financials, insurer identifiers) that couldn't be safely scrubbed from past commits, so starting fresh was the only honest path.

Real patient names, clinician names, NPIs (National Provider Identifiers — the unique 10-digit IDs assigned to U.S. healthcare providers), tax IDs, claim numbers, and example PDFs have all been removed or replaced with placeholders. Example data in `docs/SPEC.md`, the runbook in `docs/portal-submission-runbook.md`, and the contents of `docs/examples/` are illustrative only. See `docs/examples/README.md` for guidance on supplying your own test documents.

The seed fixture in `backend/prisma/seed-data.json` is a redacted snapshot of a real working dataset: real out-of-network adjudication amounts, generated identifiers (clinician/clinic/patient names, NPIs, license numbers, claim numbers, member IDs), dates shifted by 30 months, free-text scrubbed. See [`backend/scripts/README.md`](backend/scripts/README.md) for the full redaction methodology.
