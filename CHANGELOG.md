# Changelog

## v0.4.0 — Claim Generation & EoB Matching (March 2026)

### Claim Generation Engine
- **Generate Claims page** (`/claims/generate`) — 3-step wizard to group unsubmitted services into draft CMS-1500 claims
- Groups by **patient + clinician + clinic**, max 6 service lines per claim (CMS-1500 limit), overflow creates Part 2, 3, etc.
- **Insurance assigned at generation time** — user selects insurance provider per group (or bulk-apply to all groups)
- **Validation checks** before generation: clinician NPI, clinic NPI/EIN, diagnosis codes
- Services transition from `unsubmitted` → `claim_ready` when linked to a draft claim

### EoB Import Rework
- EoB import now **matches existing draft claims** instead of creating new ones
- Matching by clinician name + overlapping service date range
- If no matching draft claim found, the import is rejected with a clear error message
- **Per-line EoB financials** stored on each ServiceLineItem: allowed amount, plan paid, deductible, copay, coinsurance, plan does not cover, amount owed, processing codes
- Claim-level aggregates computed from service lines
- **Patient account number** extracted from EoB and stored on claim
- Removed "Map to Records" section — no longer needed since matching uses existing draft claims
- Button text changed from "Create N Claims from EoB" → "Apply EoB to Claims"

### Claim Detail Page Rework
- **Claim Details section** — patient, relationship, patient account #, member ID, insurance, clinic, clinician, service period, status
- **Payment section** — shows "Pending" with "Record Payment" button, or payment details (date, check #, amount) when recorded
- **EoB Service Details table** — per-line breakdown matching EoB format: date, processing codes, billed, saved, allowed, plan paid, deductible, copay, coinsurance, not covered, you owe; totals row
- **Linked Services table** — always shown with CPT, modifier, POS, description, clinician, diagnosis codes, units, fee
- **History** — uses `createdAt` timestamp (fixes default date display), shows source labels, includes payment_recorded events
- Recording payment transitions claim from `resolved` → `paid`

### Services Page Improvements
- **Advanced filters** — clinician dropdown, date range (from/to), status, search by CPT/description
- **Sortable columns** — date, CPT, fee, status (click header to toggle asc/desc)
- **Clear filters** button when filters are active
- Removed checkbox/mark-submitted workflow (replaced by Generate Claims)
- Status renamed: `submitted` → `claim_ready`
- Page size increased to 50; result count shows filter state
- "Generate Claims" button in header links to `/claims/generate`

### Claims List
- Added **Clinician column** (pulled from first service line item)

### Status Rename
- `adjudicated` → `resolved` throughout the stack (backend statuses, frontend labels/colors, dashboard, transitions)

### Payment Recording
- New `PUT /claims/:id/payment` endpoint — records payment date, check number, amount
- Creates `status_change` event (resolved → paid) in claim history
- Schema: added `paymentDate`, `paymentCheckNumber`, `paymentAmount` to Claim model

### Bug Fixes
- **Date timezone fix** — dates stored as `@db.Date` (UTC midnight) no longer shift back one day in local timezone display
- **formatDate()** now detects midnight UTC strings and parses as local dates; real timestamps preserve time component
- **Dependents page** — removed Member ID column and form field; fixed DoB display
- **nginx cache fix** — `index.html` now has `no-cache` headers to prevent stale deploys after rebuilds
- Removed seed data references
- Fixed clinician credential/NPI/license extraction from superbills

### Schema Migration
- `claims`: added `patient_account_number`, `payment_date`, `payment_check_number`, `payment_amount`
- `service_line_items`: added `allowed_amount`, `amount_saved`, `plan_paid`, `deductible_applied`, `copay`, `coinsurance`, `plan_does_not_cover`, `amount_owed`, `processing_codes`

---

## v0.3.0 — Duplicate Detection (March 2026)

- Duplicate detection for all 3 document importers (superbill, invoice, EoB)
- Superbill: checks date + CPT + clinician + dependent before creating service
- Invoice: checks billing period before creating reconciliation report
- EoB: checks claim number + insurance provider before creating claim

---

## v0.2.0 — Services & Document Import (March 2026)

- Service-level tracking with claim references
- AI-powered document upload (Superbill, Invoice, EoB) using Claude API
- Auto-create/match clinic, clinician, dependent from superbill data
- Invoice reconciliation with persistent reports
- EoB import with claim creation and service matching
- Dashboard tiles and financial summary
- UI polish: table styling, alignment, dark mode

---

## v0.1.0 — Foundation (March 2026)

- Docker Compose setup (Express + React + PostgreSQL + nginx)
- JWT authentication (register, login, refresh)
- Database schema (16 tables) with Prisma ORM
- Claims CRUD with status lifecycle and events
- CSV import for legacy data
- Admin pages: insurance providers, clinic organizations, clinicians, dependents
- Settings page with theme toggle
