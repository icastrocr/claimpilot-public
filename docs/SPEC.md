# ClaimPilot — Project Specification

> Out-of-Network Mental Health Claims Management Platform
> Version 1.0 — March 2026 | Local-First / HIPAA-Ready Architecture

---

## 1. Executive Summary

ClaimPilot is a local-first SaaS platform that helps parents of children receiving out-of-network mental health services manage the full lifecycle of insurance claims. From initial submission through payment tracking and reprocessing, the platform provides a unified workspace with AI-powered assistance to decode complex claim data and guide users through actions they would otherwise need deep insurance expertise to perform.

The platform runs entirely on the user's machine to avoid HIPAA compliance requirements for a public deployment, while being architecturally ready for cloud hosting when compliance infrastructure is in place.

### 1.1 Problem Statement

Parents navigating out-of-network mental health claims face compounding challenges:

- Insurance EOBs contain coded data (CPT codes, denial reason codes, adjustment codes) that require specialized knowledge to interpret
- Claims often require multiple rounds of reprocessing due to coding errors, incorrect allowed amounts, or coordination-of-benefits issues
- Tracking payments across multiple claims, checks, overpayments, and adjustments is error-prone without purpose-built tooling
- Taking action on denied or underpaid claims requires knowledge of specific insurer processes and deadlines
- Most available tools are designed for providers, not for individual families submitting directly

### 1.2 Target Users

Parents or guardians who pay out-of-network mental health providers upfront and submit claims for reimbursement directly to their insurance company. These users are typically not technically sophisticated and need a clean, guided experience that abstracts away the complexity of insurance claim management.

### 1.3 Current Manual Workflow (Baseline)

The platform replaces the following manual process, which must be fully supported from day one:

1. **Receive monthly bill + superbill from clinic** — Example Pediatric Clinic (EPC) sends two PDFs monthly: a Statement (regular bill) and a Superbill. Both cover a date range (e.g., 10/1–11/30).

2. **Parse the superbill** — The superbill is the primary source of structured claim data. It contains per-session line items with: date, units, CPT code, modifier (+95 for telehealth), description (includes clinician name), place of service (POS), diagnosis codes, amount paid, and fee. It also lists all clinicians with their individual NPI numbers and license numbers. The practice-level EIN and NPI are in the footer.

3. **Identify no-show appointments from the bill** — The regular bill includes "Missed/Cancelled Appointment Fee" entries that do NOT appear on the superbill. These are charged to the parent but cannot be submitted as insurance claims. The platform must capture these for financial tracking (total amount paid to clinic) even though they are not claimable.

4. **Split superbill by clinician** — A single superbill covers multiple clinicians (e.g., Dr. A. Example, Dr. B. Sample, Dr. C. Reed). When submitting to the insurance company, claims are filed **one per clinician** — all sessions for a clinician within the billing period go on a single claim submission. This means one superbill becomes 2–4 separate insurance claims.

5. **Submit claims via insurance portal** — Each clinician's sessions are submitted as a single claim through the insurance company's member portal.

6. **Track in spreadsheet** — The superbill data is processed by an LLM into a structured table and pasted into the "Clinic Invoices" sheet in Google Sheets. This sheet is the primary tracking tool, with columns for claim status and EOB details.

7. **Receive and record EOBs** — As EOBs arrive (often multiple per claim due to reprocessing), their details are recorded as unstructured text in a "Details and Comments" column. Key EOB fields: Provider Billed, Amount Saved, Plan Allowed Amount, Plan Paid, Applied to Deductible, Copay, Coinsurance, Plan Does Not Cover, Amount You Owe, and Claim Processing Codes (e.g., ND, 0H, M6).

8. **Record insurance advocate feedback** — An insurance advocate provides limited support. Their input is tracked in "Action" and "Insurance Comments" columns.

9. **Track payments (checks)** — Checks received are logged in a separate "Insurance Claims CKs" sheet with: Claim Number, Part (01, 01/02, etc. for multi-part claims), Payment Amount, Check Date, CK received flag, Amount Owed breakdown (Co-Insurance + Plan Paid = Allowed Amount), Billed amount, Clinic flag, and Caregiver (clinician name).

10. **Reconcile** — Running totals of amounts billed (from superbills) and total payments received (from checks) are maintained and compared to ensure nothing is missed.

### 1.4 Real Document Structures

The platform must parse and understand these specific document formats:

#### Superbill (Example clinic format)
- **Header**: Clinic name/address/phone, patient name, address, diagnosis code, date range
- **Patient info**: Patient birthdate, diagnostic codes, Practice EIN, Practice NPI
- **Line items**: Date | Units | Code | Modifiers | Description (includes clinician name) | POS | Amount Paid | Fee
- **Footer**: Per-clinician blocks with Clinician Name, License number, and individual Clinician NPI
- **Key**: POS 10 = Telehealth office, POS 11 = In-person office

#### Monthly Statement/Bill (Example clinic format)
- **Header**: Same clinic info, patient name, date range
- **Line items**: Date | Transaction description (CPT code + description + clinician) | Amount
- **Payment lines**: Credit/Debit entries with payment method
- **Special entries**: "Missed/Cancelled Appointment Fee" (no CPT code — not claimable)
- **Footer**: Unassigned credits, Amount Due, Tax ID, NPI

#### EOB (insurance company format — two versions exist)
- **Header**: Member info (Member, Member ID, Patient, Relationship, Group Name, Group Number) — note that the EoB extraction prompt is currently tuned to a single insurer's layout; adapting to other insurers may require additional prompt variants
- **Summary**: Amount Billed, Amount You Do Not Owe, Adjustments, Your Plan Paid, Total You Owe
- **Claim Detail table**: Services Received | Claim Processing Codes | Provider Billed | Amount Saved | Plan Allowed Amount | Plan Paid | Applied to Deductible | Copay | Coinsurance | Plan Does Not Cover | Amount You Owe
- **Claim Processing Codes**: ND (out-of-network, Medicare-based), 0H (reprocessed claim), M6 (reconsideration), etc.
- **Plan Balances**: Deductible and OOP progress for patient and family, in-network and out-of-network
- **Key metadata**: Claim Number (e.g., EX0000000001), Provider name, Patient Account Number, Provider Status (Out of Network)

#### Clinic Invoices Tracking Sheet (existing spreadsheet — column mapping)

The primary claim tracking spreadsheet has columns A–N. This is the structure the platform replaces:

| Col | Header | Example Data | Maps to |
|-----|--------|-------------|---------|
| A | # | Row number | — (auto) |
| B | Date | 12/06/2022 | `claims.date_of_service` |
| C | Code | 90834 +95 | `claims.cpt_code` + `claims.cpt_modifier` |
| D | Transaction | "Individual Therapy (45min)* with Dr. F. Coe [Lic# 12000; NPI# 1234567894], M.A." | `claims.service_description`, parse for clinician |
| E | POS | 10, 11 | `claims.place_of_service` |
| F | Amount Billed | $315.00 | `claims.billed_amount` |
| G | Provider | Dr. F., Dr. A., Dr. B., Dr. C. | `clinicians` lookup (first name) |
| H | Claim Submitted | Yes (green) / N/A | `claims.status` |
| I | Allowed | $315.00 | `claims.allowed_amount` |
| J | Paid | $252.00, -$144.98, $356.49 | `claims.insurance_paid` (color-coded: red = problem) |
| K | Claim # | EX0000000002 | `claims.claim_number` |
| L | Re-Processed | Yes / No / TBD / N/A | `claims.status` + `reprocessing_requests.status` |
| M | Details | "Initially Allowed $228.62 Paid $182.90 // Reviewed Claim: Paid $33.56 extra // $54.12 Co-Insurance" | `claim_events` (parse into structured EOB fields) |
| N | Comments | "Payment of future claim missing (deductible diff)", "EoB very confusing" | `claims.notes` + `claims.advocate_comments` |

**Special rows:** Row 3 contains running totals: total billed, Diff, total from CKs, and balance. Row 14-type entries show credit card credits (Credit/Debit Visa -XXXX, -$XX.XX) inline — these are provider-side payments, not insurance claims.

**The "Details" column is the most complex to migrate.** It contains semi-structured text with patterns like:
- `"$XX.XX Allowed & Deductible // as of MM/DD/YYYY $XXX Deductible"`
- `"Check #1: $XX.XX Check #2: $XXX.XX // Co-Insurance $XX"`
- `"DU00000002 $0 Paid/Allowed // Prev. Paid $XX.XX (adjusted MM/DD diff paid)"`
- `"Paid 2x $XXX+$XXX.XX // Overpayment. $XXX.XX = XXX.XX*4+XX.XX+XXX.XX"`

The platform must parse these patterns into structured fields (allowed amount, deductible applied, co-insurance, check references, overpayment flags) during data migration.

#### Insurance Claims CKs (Payment Tracking — existing spreadsheet column mapping)

| Column | Header | Description |
|--------|--------|-------------|
| Claim Number | e.g., DU00000001 | Insurance-assigned claim number |
| Part | 01, 01/02, 01/02/03 | Multi-service claim split indicator |
| Payment Amount | e.g., $XXX.XX | Amount allocated to this claim from check |
| Check Date | e.g., MM/DD/YYYY | Date check received/deposited |
| CK (Yes/No) | Yes | Whether physical check was received |
| Amount Owed | e.g., $XXX.XX | Patient responsibility / co-insurance |
| Co-Insurance | Amount | Co-insurance component |
| Plan Paid | Amount | What plan paid |
| Billed | Amount | Original billed amount |
| Clinic (Yes/No) | Yes | Whether claim came from clinic superbill |
| Caregiver | D ROE, E DOE, etc. | Clinician name |
| Comments | Free text | Notes |

**Running total:** Total billed across all claims. Validation formula: `Billed = Amount Owed + Plan Paid`.

### 1.5 Known Entities (Seed Data)

The platform should be seeded with this real configuration data:

**Insurance Provider**: Example Insurance Co. (out-of-network plan administered by a major insurer). Group: Example Employer LLC. Group #: 0000000. Claims phone: 800-555-0100. Appeals address: P.O. Box 12345, Anytown, ST 00000. Portal: portal.example.com.

**Clinic Provider (Organization)**: Example Pediatric Clinic, LLC. Address: 123 Example Street, Suite 100, Anytown, MA 02100-0000. Phone: (555) 555-0100. Tax ID/EIN: 123456789. NPI: 1234567890.

**Individual Clinicians** (each submits claims separately):
- Dr. A. Example, LMHC — License: 10001, NPI: 1234567891 (Executive Functioning, 90832)
- Dr. B. Sample, Psy.D. — License: 10002, NPI: 1234567892 (Individual Therapy, 90834; Family Therapy, 90847)
- Dr. C. Reed, Ph.D. — License: 10003, NPI: 1234567893 (Family Therapy, 90846/90847; Individual Therapy, 90834)
- Historical: Dr. D. Roe, Dr. E. Doe, Dr. F. Coe (earlier clinicians visible in payment records)

---

## 2. System Architecture

The system follows a modular monolith pattern suitable for local-first deployment with a clear path to distributed services.

### 2.1 Architecture Principles

| Principle | Guidance |
|-----------|----------|
| Deployment model | Single-machine Docker Compose stack. All services run locally behind localhost. |
| Tech stack freedom | Choose the optimal framework, ORM, and tooling. Document your choices and rationale in the project README. |
| Database | PostgreSQL (relational integrity required for financial data). Use migrations from day one. |
| Authentication | Email + password with bcrypt. JWT tokens for API auth. No OAuth needed initially. |
| API design | RESTful with consistent JSON envelope. Version prefix (`/api/v1/`). |
| Frontend | SPA with component-based architecture. Must work well for non-technical users. Dark/light mode support. |
| LLM integration | Anthropic Claude API via server-side proxy. Never expose API keys to the frontend. |
| File storage | Local filesystem with structured paths per user. No cloud storage initially. |
| HIPAA readiness | Encrypt data at rest (database-level). All API traffic over HTTPS in production. Audit logging for data access. No PHI in application logs. |

### 2.2 Project Structure

Use a monorepo with this top-level layout:

```
claimpilot/
├── frontend/          # SPA source
├── backend/           # API server source
├── docker/            # Dockerfiles if not colocated
├── docker-compose.yml
├── docs/
│   └── SPEC.md        # This file
├── .env.example
└── README.md
```

### 2.3 High-Level Components

| Component | Responsibility | Notes |
|-----------|---------------|-------|
| Frontend SPA | User interface, dashboard, claim views, chat | Communicates exclusively with Backend API |
| Backend API | Business logic, auth, CRUD, claim workflow | Stateless; all state in PostgreSQL |
| PostgreSQL | Persistent storage for all user and claim data | Single database with per-user row-level isolation |
| LLM Proxy Service | Routes chat requests to Claude API with claim context | Server-side only; manages prompt construction and tool use |
| File Ingestion Service | Parses uploaded EOBs, claim forms, check images | Accepts CSV, PDF, and structured formats |
| Background Worker | Scheduled tasks: payment reconciliation, reminders | Optional in Phase 1; required for agentic actions |

---

## 3. Data Model

All tables include standard audit fields (`created_at`, `updated_at`) and soft-delete support (`deleted_at`). Foreign keys enforce referential integrity throughout. All monetary fields use `DECIMAL(10,2)`, never floating point.

### 3.1 Users

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Unique user identifier |
| handle | VARCHAR(50) UNIQUE | User-chosen display name / handle |
| email | VARCHAR(255) UNIQUE | Login email address |
| password_hash | VARCHAR(255) | bcrypt hashed password |
| settings_json | JSONB | User preferences (theme, notifications, defaults) |
| is_active | BOOLEAN | Account active flag |

### 3.2 Insurance Providers

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Provider identifier |
| user_id | UUID (FK → Users) | Owning user |
| name | VARCHAR(255) | e.g., UnitedHealthcare, Aetna, Blue Cross |
| plan_type | VARCHAR(50) | PPO, HMO, EPO, POS, etc. |
| policy_number | VARCHAR(100) | Policy or member ID |
| group_number | VARCHAR(100) | Employer group number |
| claims_address | TEXT | Mailing address for paper claims |
| claims_phone | VARCHAR(20) | Claims department phone |
| portal_url | VARCHAR(500) | Online portal URL if available |
| notes | TEXT | Free-form notes about this insurer |

### 3.3 Clinic Providers (Organization + Individual Clinicians)

The clinic is an organization (e.g., Example Pediatric Clinic) with its own EIN and NPI. Individual clinicians within the organization each have their own NPI and license, and claims are submitted per-clinician. The data model must support both levels.

**Clinic Organizations:**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Organization identifier |
| user_id | UUID (FK → Users) | Owning user |
| name | VARCHAR(255) | Clinic name (e.g., Example Pediatric Clinic, LLC) |
| address | TEXT | Clinic address |
| phone | VARCHAR(20) | Clinic phone |
| ein | VARCHAR(20) | Employer Identification Number / Tax ID |
| npi | VARCHAR(10) | Organization-level NPI |
| superbill_format | VARCHAR(50) | How they issue superbills (PDF, portal, paper) |
| billing_contact | VARCHAR(255) | Billing contact email/name |
| notes | TEXT | Free-form notes |

**Clinicians (Individual Providers):**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Clinician identifier |
| user_id | UUID (FK → Users) | Owning user |
| clinic_id | UUID (FK → Clinic Organizations) | Parent clinic |
| name | VARCHAR(255) | Clinician full name |
| credential | VARCHAR(50) | e.g., LMHC, Psy.D., Ph.D., LCSW |
| license_number | VARCHAR(50) | State license number |
| npi | VARCHAR(10) | Individual clinician NPI |
| specialty | VARCHAR(100) | e.g., Executive Functioning, Individual Therapy, Family Therapy |
| typical_cpt_codes | VARCHAR(50)[] | CPT codes this clinician typically uses (e.g., [90832, 90834]) |
| rate_per_session | DECIMAL(10,2) | Typical session rate |
| is_active | BOOLEAN | Whether currently providing services |

### 3.4 Dependents (Patients)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Dependent identifier |
| user_id | UUID (FK → Users) | Parent / guardian user |
| first_name | VARCHAR(100) | Dependent first name |
| last_name | VARCHAR(100) | Dependent last name |
| date_of_birth | DATE | DOB (required for claim matching) |
| relationship | VARCHAR(50) | child, spouse, self |
| member_id | VARCHAR(100) | Insurance member ID if different from policy holder |

### 3.5 Claims

The central entity. Each claim represents a single submission to the insurance company. A claim groups all sessions for **one clinician** within a billing period (one superbill → multiple claims, one per clinician).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Claim identifier |
| user_id | UUID (FK → Users) | Owning user |
| insurance_provider_id | UUID (FK) | Which insurance plan |
| clinic_id | UUID (FK → Clinic Orgs) | Which clinic organization |
| clinician_id | UUID (FK → Clinicians) | Which individual clinician (claims are per-clinician) |
| dependent_id | UUID (FK) | Which patient / dependent |
| claim_number | VARCHAR(100) | Insurance-assigned claim number (from EOB, e.g., EX0000000001) |
| claim_part | VARCHAR(20) | Part identifier from insurer (e.g., "01", "01/02", "01/02/03") — some insurers split multi-service claims |
| date_of_service | DATE | Service date (or start of range) |
| date_of_service_end | DATE | End date if multi-day |
| date_submitted | DATE | When claim was mailed / submitted |
| cpt_code | VARCHAR(10) | CPT procedure code (e.g., 90837, 90834) |
| cpt_modifier | VARCHAR(10) | Modifier if any (e.g., 95 for telehealth) |
| place_of_service | VARCHAR(5) | POS code (10 = telehealth, 11 = office, etc.) |
| diagnosis_codes | VARCHAR(100)[] | Array of ICD-10 codes from superbill (e.g., F32.A, F41.9) |
| billed_amount | DECIMAL(10,2) | Amount billed by provider |
| allowed_amount | DECIMAL(10,2) | Insurance allowed/plan allowed amount (from EOB) |
| amount_saved | DECIMAL(10,2) | Amount saved / discount (from EOB, often $0 for OON) |
| insurance_paid | DECIMAL(10,2) | Amount insurance paid (Your Plan Paid) |
| patient_responsibility | DECIMAL(10,2) | Total amount you owe |
| deductible_applied | DECIMAL(10,2) | Amount applied to deductible |
| copay | DECIMAL(10,2) | Copay amount |
| coinsurance | DECIMAL(10,2) | Coinsurance amount |
| plan_does_not_cover | DECIMAL(10,2) | Non-covered amount (OON difference between billed and allowed) |
| claim_processing_codes | VARCHAR(20)[] | Array of codes from EOB (e.g., ND, 0H, M6) |
| status | VARCHAR(30) | See Status enum below |
| status_detail | TEXT | Human-readable status explanation |
| submission_method | VARCHAR(20) | mail, portal, fax, api |
| superbill_id | UUID (FK → Superbills, nullable) | Link back to source superbill document |
| advocate_action | TEXT | Action notes from insurance advocate |
| advocate_comments | TEXT | Comments from insurance advocate |
| notes | TEXT | User notes on this claim |

**Claim Status Enum:**

```
draft → submitted → received → processing → adjudicated → paid → closed
                                                        ↘ denied → reprocessing_requested → reprocessing → reprocessed → paid
                                                                  ↘ appealed
                                                                  ↘ write_off
```

Valid statuses: `draft`, `submitted`, `received`, `processing`, `adjudicated`, `paid`, `closed`, `denied`, `reprocessing_requested`, `reprocessing`, `reprocessed`, `appealed`, `write_off`

### 3.5a Superbills (Source Documents)

Tracks uploaded superbill PDFs — the source from which claims are generated.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Superbill identifier |
| user_id | UUID (FK → Users) | Owning user |
| clinic_id | UUID (FK → Clinic Orgs) | Which clinic issued this superbill |
| file_path | VARCHAR(500) | Path to stored PDF |
| billing_period_start | DATE | Start of covered period |
| billing_period_end | DATE | End of covered period |
| total_amount | DECIMAL(10,2) | Total billed on this superbill |
| received_date | DATE | When the superbill was received |
| parsed | BOOLEAN | Whether this has been parsed into claims |
| notes | TEXT | Notes |

### 3.5b Service Line Items

Individual session-level records parsed from superbills. Multiple line items roll up into a single claim (grouped by clinician).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Line item identifier |
| superbill_id | UUID (FK → Superbills) | Source superbill |
| claim_id | UUID (FK → Claims, nullable) | Which claim this was grouped into |
| clinician_id | UUID (FK → Clinicians) | Which clinician performed this service |
| date_of_service | DATE | Session date |
| cpt_code | VARCHAR(10) | CPT code (e.g., 90832, 90834, 90846, 90847) |
| cpt_modifier | VARCHAR(10) | Modifier (e.g., 95 for telehealth) |
| units | INTEGER | Number of units (usually 1) |
| place_of_service | VARCHAR(5) | POS code (10 or 11) |
| diagnosis_codes | VARCHAR(100)[] | ICD-10 codes for this session |
| description | TEXT | Service description from superbill |
| fee | DECIMAL(10,2) | Billed fee for this session |
| amount_paid | DECIMAL(10,2) | Amount paid to clinic for this session |

### 3.5c Non-Claimable Charges

Tracks charges from the monthly bill that cannot be submitted as insurance claims (e.g., no-show fees). Important for financial reconciliation — total paid to clinic = claimable sessions + non-claimable charges.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Charge identifier |
| user_id | UUID (FK → Users) | Owning user |
| clinic_id | UUID (FK → Clinic Orgs) | Which clinic |
| charge_type | VARCHAR(50) | missed_appointment, late_cancel, admin_fee, other |
| date | DATE | Date of the charge |
| amount | DECIMAL(10,2) | Amount charged |
| clinician_id | UUID (FK → Clinicians, nullable) | Which clinician if applicable |
| description | TEXT | Description from the bill |
| billing_period | VARCHAR(20) | Which billing period (e.g., "2025-10") |
| notes | TEXT | Notes |

### 3.6 Claim Events (History Log)

Every change to a claim generates an event, creating a full audit trail.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Event identifier |
| claim_id | UUID (FK → Claims) | Parent claim |
| event_type | VARCHAR(50) | status_change, note_added, payment_received, eob_received, reprocess_requested, document_uploaded, adjustment, llm_action |
| event_date | TIMESTAMPTZ | When the event occurred |
| previous_status | VARCHAR(30) | Status before (if status_change) |
| new_status | VARCHAR(30) | Status after (if status_change) |
| description | TEXT | Human-readable description |
| metadata_json | JSONB | Structured data for this event (amounts, codes, etc.) |
| source | VARCHAR(20) | manual, system, llm, api |

### 3.7 Payments

Tracks actual payments received, including physical checks. A single check may cover multiple claims. Maps directly to the "Insurance Claims CKs" sheet structure.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Payment identifier |
| user_id | UUID (FK → Users) | Owning user |
| payment_date | DATE | Date on check or deposit date |
| payment_method | VARCHAR(20) | check, eft, ach, other |
| check_number | VARCHAR(50) | Check number if applicable |
| total_amount | DECIMAL(10,2) | Total payment amount |
| payer | VARCHAR(255) | Who issued the payment (insurer name) |
| received | BOOLEAN | Whether the check has been physically received/deposited |
| notes | TEXT | Notes about this payment |

### 3.8 Payment Allocations

Join table linking payments to claims, since one check can cover multiple claims.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Allocation identifier |
| payment_id | UUID (FK → Payments) | Parent payment |
| claim_id | UUID (FK → Claims) | Associated claim |
| allocated_amount | DECIMAL(10,2) | Amount from this payment for this claim |
| is_overpayment | BOOLEAN | Whether this constitutes an overpayment |
| adjustment_reason | VARCHAR(100) | If this allocation is an adjustment, the reason |

### 3.9 EOB Documents

Explanation of Benefits documents received from the insurer. An EOB may cover one or more claims. Multiple EOBs can be received for the same claim (initial + reprocessing). Stores both the PDF and the extracted structured data.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Document identifier |
| user_id | UUID (FK → Users) | Owning user |
| insurance_provider_id | UUID (FK) | Which insurer issued this EOB |
| claim_id | UUID (FK → Claims, nullable) | Primary claim (an EOB may link to multiple via join table) |
| received_date | DATE | When the EOB was received |
| eob_date | DATE | Date printed on the EOB |
| file_path | VARCHAR(500) | Path to stored PDF / image |
| claim_number | VARCHAR(100) | Claim number from the EOB |
| provider_name | VARCHAR(255) | Provider name as shown on EOB |
| service_date_start | DATE | Start of service period covered |
| service_date_end | DATE | End of service period covered |
| provider_billed | DECIMAL(10,2) | Total amount billed |
| amount_saved | DECIMAL(10,2) | Discount / amount not owed |
| plan_allowed_amount | DECIMAL(10,2) | Plan allowed amount |
| plan_paid | DECIMAL(10,2) | Amount insurance paid |
| applied_to_deductible | DECIMAL(10,2) | Amount applied to deductible |
| copay | DECIMAL(10,2) | Copay amount |
| coinsurance | DECIMAL(10,2) | Coinsurance amount |
| plan_does_not_cover | DECIMAL(10,2) | Non-covered amount |
| total_you_owe | DECIMAL(10,2) | Total patient responsibility |
| claim_processing_codes | VARCHAR(20)[] | Processing codes (ND, 0H, M6, etc.) |
| adjustments | DECIMAL(10,2) | Adjustment amount (for reprocessed claims) |
| is_reprocessed | BOOLEAN | Whether this EOB reflects a reprocessed claim |
| notes | TEXT | Notes |

### 3.10 Reprocessing Requests

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Request identifier |
| claim_id | UUID (FK → Claims) | Claim being reprocessed |
| request_date | DATE | When the request was submitted |
| reason | TEXT | Why reprocessing is needed |
| reason_code | VARCHAR(50) | Categorized reason: `wrong_allowed_amount`, `coding_error`, `cob_issue`, `missing_info`, `duplicate_denial`, `timely_filing`, `other` |
| submission_method | VARCHAR(20) | phone, mail, portal, fax |
| reference_number | VARCHAR(100) | Call reference or tracking number |
| status | VARCHAR(30) | submitted, in_review, completed, denied |
| outcome | TEXT | Result of reprocessing |
| resolution_date | DATE | When resolved |

### 3.11 Chat Sessions

Stores LLM chat sessions scoped to a specific claim for context continuity.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Session identifier |
| user_id | UUID (FK → Users) | Owning user |
| claim_id | UUID (FK → Claims, nullable) | If scoped to a specific claim |
| title | VARCHAR(255) | Auto-generated or user-set title |
| messages_json | JSONB | Array of `{role, content, timestamp}` messages |
| created_at | TIMESTAMPTZ | Session start |

### 3.12 Plan Balance Snapshots

Tracks deductible and out-of-pocket progress over time, as reported on EOBs. Useful for projecting remaining liability.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (PK) | Snapshot identifier |
| user_id | UUID (FK → Users) | Owning user |
| dependent_id | UUID (FK → Dependents) | Which family member |
| eob_id | UUID (FK → EOBs, nullable) | Source EOB |
| as_of_date | DATE | Date of this snapshot |
| plan_year | VARCHAR(4) | Plan year (e.g., "2024") |
| network_type | VARCHAR(20) | in_network, out_of_network |
| scope | VARCHAR(20) | individual, family |
| deductible_max | DECIMAL(10,2) | Annual deductible maximum |
| deductible_applied | DECIMAL(10,2) | Amount applied to date |
| oop_max | DECIMAL(10,2) | Out-of-pocket maximum |
| oop_applied | DECIMAL(10,2) | OOP amount applied to date |

---

## 4. User Interface Specification

The UI should follow modern SaaS conventions familiar to users of tools like Notion, Linear, or Stripe Dashboard.

### 4.1 Design Principles

- Sidebar navigation with collapsible sections
- Card-based dashboard with summary metrics at a glance
- Data tables with sorting, filtering, and search for claim lists
- Slide-over panels or dedicated pages for individual claim detail
- Integrated chat panel (right-side drawer or bottom panel) at the claim level
- Light and dark mode with system preference detection
- Responsive but optimized for desktop (primary use case)
- Accessible (WCAG 2.1 AA) with keyboard navigation
- Toast notifications for async operations and status changes

### 4.2 Page Structure

| Page / View | Key Elements | Route |
|-------------|-------------|-------|
| Login / Register | Handle, email, password fields. Clean centered form. | `/login`, `/register` |
| Dashboard (Home) | Summary cards, charts, activity feed | `/dashboard` |
| Claims List | Filterable/sortable table with status badges, bulk actions | `/claims` |
| Claim Detail | Full claim data, status timeline, event history, linked payments, documents, chat panel | `/claims/:id` |
| Payments | Payment list with check details. Link/unlink to claims. Overpayment tracking. | `/payments` |
| Reprocessing | Filtered view of claims in reprocessing. Request forms. Status tracking. | `/reprocessing` |
| Admin: Insurance | CRUD for insurance provider profiles. Plan details. | `/admin/insurance` |
| Admin: Providers | CRUD for clinic/therapist profiles. NPI, rates. | `/admin/providers` |
| Admin: Dependents | CRUD for dependent / patient profiles. | `/admin/dependents` |
| Admin: Settings | User profile, password change, theme, LLM API key config. | `/admin/settings` |

### 4.3 Dashboard Specification

The dashboard is the landing page after login and should immediately communicate the user's claim portfolio health.

**Summary Cards (Top Row):**
- Total Claims (all time count)
- Pending Review (submitted + processing)
- Amount Reimbursed (sum of all payments received)
- Outstanding Balance (billed minus paid across all open claims)
- Denied / Needs Action (count requiring user intervention)

**Charts:**
- Claims by Status — horizontal stacked bar or donut chart
- Payments Over Time — line or bar chart by month
- Reimbursement Rate — percentage of billed vs. paid over time

**Reconciliation Panel:**
- Running total: Total Billed (from superbills) vs. Total Payments Received (from checks)
- Unreconciled amount (billed but not yet paid or denied)
- Non-claimable charges total (no-shows, etc.) — for tracking total out-of-pocket cost to clinic

**Activity Feed:**
A reverse-chronological list of recent claim events (last 20), each linking to the relevant claim. Show event type icon, short description, timestamp, and claim reference.

---

## 5. LLM Integration (AI Chat & Actions)

The LLM integration is a core differentiator. It transforms coded insurance data into understandable language and provides guided or autonomous actions on claims.

### 5.1 Architecture

- All LLM calls go through the backend API, never directly from the frontend
- The backend constructs prompts that include relevant claim context (claim data, EOB details, provider info, event history)
- Use the Anthropic Claude API (`claude-sonnet-4-20250514` or latest) with tool use for structured actions
- API key is stored in server-side environment configuration, never exposed to client
- Chat sessions are persisted per-claim for continuity

### 5.2 Capability Tiers

**Tier 1 — Explain / Interpret (Read-Only)**
- Decode CPT codes into plain English (e.g., 90837 = "Individual psychotherapy, 60 minutes")
- Explain ICD-10 diagnosis codes
- Interpret EOB denial reason codes and adjustment codes (e.g., CO-45, PR-2, OA-23)
- Summarize claim status and suggest what to watch for
- Explain the difference between allowed amount, billed amount, and patient responsibility
- Contextualize where a claim sits in the typical lifecycle

**Tier 2 — Guide (Step-by-Step Instructions)**
- How to submit a reprocessing request for a specific denial reason
- What information to gather before calling the insurance company
- How to write an appeal letter (with template generation)
- Checklist for submitting a new claim
- How to verify benefits for a new provider

**Tier 3 — Act (Agentic Actions via Tool Use)**

When backend capabilities exist, the LLM can take direct actions using Claude tool use:
- Update claim status based on user-described outcome of a phone call
- Create a reprocessing request record with pre-filled data
- Generate a draft appeal letter attached to the claim
- Log a payment and auto-allocate to matching claims
- Flag inconsistencies (e.g., payment doesn't match EOB allowed amount)

**All Tier 3 actions require explicit user confirmation before execution.** The LLM proposes the action, the UI shows a confirmation dialog with the specific changes, and the user approves or rejects.

### 5.3 Tool Use Schema (For Claude API)

Define these as tools available to the LLM during chat sessions:

| Tool Name | Description | Key Parameters |
|-----------|-------------|----------------|
| `explain_code` | Look up and explain a CPT, ICD-10, or denial reason code | `code_type`, `code_value` |
| `update_claim_status` | Change the status of the current claim | `new_status`, `reason`, `event_date` |
| `create_reprocessing_request` | File a reprocessing request for the current claim | `reason`, `reason_code`, `submission_method` |
| `log_payment` | Record a payment received | `amount`, `payment_date`, `check_number`, `claim_ids` |
| `generate_letter` | Draft an appeal or reprocessing letter | `letter_type`, `claim_id`, `key_points` |
| `search_claims` | Find claims matching criteria | `filters` (status, date_range, provider, patient) |
| `get_claim_summary` | Get a structured summary of a claim and its history | `claim_id` |

---

## 6. API Specification

RESTful API under `/api/v1/` prefix. All endpoints except `/auth/*` require Bearer token authentication.

### 6.1 Response Envelope

```json
// Success
{ "data": { ... }, "meta": { ... } }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

### 6.2 Endpoint Groups

| Group | Endpoints | Notes |
|-------|-----------|-------|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` | Returns JWT access + refresh tokens |
| Claims | `GET/POST /claims`, `GET/PUT/DELETE /claims/:id` | Full CRUD + filtering + pagination |
| Claim Events | `GET /claims/:id/events`, `POST /claims/:id/events` | Append-only event log |
| Payments | `GET/POST /payments`, `GET/PUT /payments/:id` | Payment records |
| Payment Allocations | `POST /payments/:id/allocations`, `DELETE /allocations/:id` | Link/unlink payments to claims |
| EOBs | `POST /eobs` (upload), `GET /eobs`, `GET /eobs/:id` | File upload + metadata |
| Reprocessing | `GET/POST /reprocessing`, `GET/PUT /reprocessing/:id` | Reprocessing request lifecycle |
| Insurance Providers | `GET/POST /insurance-providers`, `GET/PUT/DELETE /insurance-providers/:id` | Admin configuration |
| Clinic Providers | `GET/POST /clinic-providers`, `GET/PUT/DELETE /clinic-providers/:id` | Admin configuration |
| Dependents | `GET/POST /dependents`, `GET/PUT/DELETE /dependents/:id` | Patient profiles |
| Chat | `POST /chat/sessions`, `POST /chat/sessions/:id/messages`, `GET /chat/sessions` | LLM chat with tool use |
| Dashboard | `GET /dashboard/summary`, `GET /dashboard/activity` | Aggregated metrics |
| Data Import | `POST /import/csv`, `POST /import/eob-pdf` | Bulk data ingestion |

---

## 7. Data Ingestion Strategy

### 7.1 Ingestion Methods by Phase

| Method | Phase | Description |
|--------|-------|-------------|
| Manual entry | 1 | Form-based claim entry with validation and code lookups |
| CSV upload | 1 | Structured CSV import with column mapping UI and validation preview |
| EOB PDF parsing | 5 | Upload EOB PDFs; use LLM to extract claim data and populate fields |
| Superbill parsing | 5 | Parse provider superbills to pre-fill claim submissions |
| Insurance portal API | Future | Direct integration with insurer APIs (FHIR Patient Access, proprietary portals) |
| Email parsing | Future | Monitor email for EOB attachments and auto-ingest |

### 7.2 CSV Import Specification

The CSV importer is critical for initial data load. Required features:

- Upload CSV file with preview of first 10 rows
- Column mapping interface: dropdown to match CSV columns to claim fields
- Validation pass with error highlighting before commit
- Support for date format detection (MM/DD/YYYY, YYYY-MM-DD, etc.)
- Duplicate detection based on `claim_number` + `date_of_service`
- Dry-run mode that shows what would be created without committing

---

## 8. Phased Build Plan

Each phase produces a working, testable application. Complete each phase fully before moving to the next.

### 8.1 Phase 1 — Foundation & Core CRUD

**Goal:** A working application with authentication, data model, and basic claim management.

**Deliverables:**

1. Project scaffolding: chosen framework, folder structure, Docker Compose, database migrations
2. User registration and login (handle, email, password) with JWT auth
3. Complete database schema with all tables from Section 3
4. Admin pages: CRUD for insurance providers, clinic providers, and dependents
5. Claims list page with table, sorting, filtering, pagination
6. Claim detail page with all fields, status badge, and manual status updates
7. Claim event history (append-only log displayed as timeline)
8. Manual claim creation form with field validation
9. CSV import for bulk claim data with column mapping
10. Basic responsive layout with sidebar navigation and light/dark mode
11. Seed data: sample providers, dependents, and 15–20 claims in various statuses

**Tests:**
- Integration tests for all auth endpoints (register, login, refresh, protected route access)
- Integration tests for Claims CRUD endpoints (create, read, update, delete, list with filters)
- Unit tests for all financial calculations (ensure DECIMAL precision, no floating point drift)
- Unit tests for claim status transition validation (only valid transitions allowed)

### 8.2 Phase 2 — Payments & Dashboard

**Goal:** Financial tracking and at-a-glance portfolio overview.

**Deliverables:**

1. Payment recording (check number, amount, date, payer)
2. Payment-to-claim allocation (one check → many claims)
3. Overpayment and adjustment tracking
4. Dashboard with summary cards (totals, outstanding, denied)
5. Dashboard charts (claims by status, payments over time)
6. Activity feed on dashboard (recent claim events)
7. EOB document upload and storage with claim linking

**Tests:**
- Integration tests for Payment and Allocation endpoints
- Unit tests for allocation math (sum of allocations ≤ payment total, overpayment detection)
- Integration tests for dashboard summary endpoint (verify aggregation correctness)

### 8.3 Phase 3 — LLM Chat Integration

**Goal:** AI-powered claim interpretation and guided assistance.

**Deliverables:**

1. Backend LLM proxy service calling Anthropic Claude API
2. Chat UI panel on claim detail page (slide-over or drawer)
3. Claim context injection into prompts (claim data, history, provider info)
4. Code explanation capability (CPT, ICD-10, denial reason codes)
5. Guided action flows (step-by-step instructions displayed in chat)
6. Chat session persistence per claim
7. API key configuration in admin settings (stored server-side, encrypted)

**Tests:**
- Integration tests for chat session CRUD endpoints
- Unit tests for prompt construction (verify claim context is correctly injected)
- Unit test for API key encryption/decryption

### 8.4 Phase 4 — Agentic Actions & Reprocessing

**Goal:** The LLM can take actions on claims, and reprocessing workflows are fully supported.

**Deliverables:**

1. Claude tool use integration: LLM can call backend APIs to modify data
2. Reprocessing request creation and lifecycle tracking
3. Appeal letter generation (templated, customizable, attached to claim)
4. Smart payment logging via chat ("I received a check for $X" → auto-allocate)
5. Inconsistency detection (payment vs. EOB mismatches, missed follow-ups)
6. Action confirmation UX: LLM proposes action → user confirms → execution
7. Background worker for scheduled checks (stale claims, upcoming deadlines)

**Tests:**
- Integration tests for each LLM tool (mock Claude API, verify backend actions execute correctly)
- Integration tests for reprocessing request lifecycle
- Unit tests for inconsistency detection logic
- Test for action confirmation flow (proposed action without confirmation does not mutate data)

### 8.5 Phase 5 — Advanced Ingestion & Polish

**Goal:** Reduce manual data entry and polish the overall experience.

**Deliverables:**

1. EOB PDF parsing via LLM (upload → extract structured data → create/update claims)
2. Superbill parsing for pre-filling claim submissions
3. Enhanced search across all entities (global search bar)
4. Keyboard shortcuts for power users
5. Data export (CSV, PDF reports)
6. Onboarding flow for first-time users
7. Comprehensive error handling and empty states
8. Performance optimization (query optimization, frontend lazy loading)

**Tests:**
- Integration test for CSV/PDF export round-trip (export then re-import produces equivalent data)
- Unit tests for search indexing and query parsing

---

## 9. Security & HIPAA Readiness

While running locally avoids the regulatory requirement for full HIPAA compliance, the application should be built as if it will eventually be deployed in a compliant environment.

| Category | Requirement | Implementation |
|----------|-------------|----------------|
| Authentication | Strong password policy, secure token handling | bcrypt (cost factor 12+), JWT with short expiry (15 min), refresh tokens, HTTP-only cookies |
| Data at rest | Encrypt sensitive fields | PostgreSQL pgcrypto extension for PII fields; database-level encryption |
| Data in transit | Encrypted communication | HTTPS via reverse proxy in production mode |
| Access control | Per-user data isolation | All queries filtered by `user_id`; row-level security in PostgreSQL |
| Audit logging | Track all data access and modifications | Claim event log captures all mutations; separate access log for API calls |
| No PHI in logs | Application logs must not contain health data | Structured logging with explicit field allowlists; claim IDs only, never names or codes |
| Session management | Secure session lifecycle | Token revocation on password change; idle timeout |
| Input validation | Prevent injection and malformed data | Server-side validation on all inputs; parameterized queries (ORM-enforced) |
| File security | Secure document storage | Files stored outside web root; access only through authenticated API endpoints |

---

## 10. Local Deployment

The application runs as a Docker Compose stack on the user's machine.

### 10.1 Docker Compose Services

| Service | Image / Build | Purpose |
|---------|--------------|---------|
| frontend | Built from `/frontend` Dockerfile | Serves the SPA (production build via nginx or similar) |
| backend | Built from `/backend` Dockerfile | API server |
| db | `postgres:16-alpine` | PostgreSQL database with persistent volume |
| redis (optional) | `redis:7-alpine` | Session cache, background job queue (Phase 4+) |

### 10.2 Getting Started (Target Developer Experience)

```bash
git clone <repo>
cp .env.example .env          # Set ANTHROPIC_API_KEY here
docker compose up
# Open http://localhost:3000 and register an account
```

The `.env.example` file should include:

```env
# Required
DATABASE_URL=postgresql://claimpilot:claimpilot@db:5432/claimpilot
JWT_SECRET=change-me-in-production

# Required for Phase 3+
ANTHROPIC_API_KEY=sk-ant-...

# Optional
LOG_LEVEL=info
FRONTEND_URL=http://localhost:3000
```

---

## 11. Reference Data & Code Tables

The application should ship with embedded reference data for code interpretation and validation.

### 11.1 CPT Codes (Mental Health Subset)

| Code | Description | Typical Duration |
|------|-------------|-----------------|
| 90791 | Psychiatric diagnostic evaluation | 45–60 min |
| 90792 | Psychiatric diagnostic evaluation with medical services | 45–60 min |
| 90832 | Individual psychotherapy, 30 minutes | 16–37 min |
| 90834 | Individual psychotherapy, 45 minutes | 38–52 min |
| 90837 | Individual psychotherapy, 60 minutes | 53+ min |
| 90838 | Individual psychotherapy, crisis | 60+ min |
| 90839 | Psychotherapy for crisis, first 60 minutes | 60 min |
| 90840 | Psychotherapy for crisis, each additional 30 minutes | 30 min add-on |
| 90846 | Family psychotherapy without patient present | 50 min |
| 90847 | Family psychotherapy with patient present | 50 min |
| 90853 | Group psychotherapy | Varies |
| 96130 | Psychological testing evaluation | First hour |
| 96131 | Psychological testing evaluation | Each additional hour |
| 96136 | Psychological/neuropsychological test administration | First 30 min |
| 96137 | Psychological/neuropsychological test administration | Each additional 30 min |

### 11.3 Insurance Claim Processing Codes (From EOBs)

| Code | Meaning |
|------|---------|
| ND | Out-of-network service paid based on Medicare-allowed amount or other sources. Additional amount is patient responsibility. |
| 0H | Claim was reprocessed. Negative dollar amount shown is amount previously paid (not an overpayment). |
| M6 | This is a reconsideration of a previously processed claim. |

### 11.4 Place of Service Codes

| Code | Description |
|------|-------------|
| 10 | Telehealth provided in patient's home |
| 11 | Office (in-person) |
| 02 | Telehealth provided other than in patient's home |

| Code | Category | Meaning |
|------|----------|---------|
| CO-4 | Contractual | The procedure code is inconsistent with the modifier used |
| CO-45 | Contractual | Charges exceed the fee schedule / maximum allowable |
| CO-97 | Contractual | Payment adjusted because the benefit is in a managed care plan |
| PR-1 | Patient | Deductible amount |
| PR-2 | Patient | Coinsurance amount |
| PR-3 | Patient | Co-payment amount |
| OA-23 | Other | Payment adjusted due to authorization/pre-certification |
| CO-16 | Contractual | Claim/service lacks information needed for adjudication |
| CO-18 | Contractual | Duplicate claim/service |
| CO-29 | Contractual | Time limit for filing has expired |
| CO-50 | Contractual | Non-covered service (may need appeal) |
| CO-109 | Contractual | Claim not covered by this payer; forward to correct payer |
| CO-197 | Contractual | Precertification/authorization/notification absent |
| CO-252 | Contractual | Requires a managed care review for additional services |

---

## 12. Implementation Instructions

### 12.1 General Rules

- Read this entire specification before starting implementation
- Choose the tech stack you determine is best-fit. Document your choices and rationale in the project README
- PostgreSQL is the one non-negotiable technology choice
- Set up Docker Compose from the start so the app can be launched with `docker compose up`
- Use database migrations from the very first schema change
- Write clean, well-structured code with clear separation of concerns
- Include meaningful error messages that help non-technical users understand what went wrong
- Create seed data for development: sample insurance providers, clinic providers, dependents, and a realistic set of 15–20 claims in various statuses
- Implement proper loading states, empty states, and error states in the UI
- All financial calculations must use DECIMAL types, never floating point
- No PHI in application logs — use claim IDs for reference, never names or diagnosis codes

### 12.2 Per-Phase Prompts

Use these prompts when starting each phase in Claude Code:

**Phase 1:**
> Read `docs/SPEC.md` sections 2, 3, 4, and 8.1. Implement Phase 1: Foundation & Core CRUD. Set up the complete project scaffold with Docker Compose, implement user auth, create all database tables with migrations, build the admin configuration pages, claims list, claim detail view, claim creation form, CSV import, and sidebar navigation with light/dark mode. Include seed data and the tests specified in 8.1.

**Phase 2:**
> Read `docs/SPEC.md` sections 4.3 and 8.2. Implement Phase 2: Payments & Dashboard. Add payment recording and allocation to claims, overpayment tracking, the dashboard with summary cards and charts, activity feed, and EOB document upload. Include the tests specified in 8.2.

**Phase 3:**
> Read `docs/SPEC.md` sections 5 and 8.3. Implement Phase 3: LLM Chat Integration. Build the backend LLM proxy service calling the Anthropic Claude API, the chat UI on the claim detail page, claim context injection, code explanation, guided actions, chat persistence, and API key configuration in settings. Include the tests specified in 8.3.

**Phase 4:**
> Read `docs/SPEC.md` sections 5.3 and 8.4. Implement Phase 4: Agentic Actions & Reprocessing. Add Claude tool use so the LLM can modify claim data with user confirmation, implement reprocessing request workflows, appeal letter generation, smart payment logging via chat, inconsistency detection, and the background worker. Include the tests specified in 8.4.

**Phase 5:**
> Read `docs/SPEC.md` sections 7 and 8.5. Implement Phase 5: Advanced Ingestion & Polish. Add EOB PDF parsing via LLM, superbill parsing, global search, keyboard shortcuts, data export, onboarding flow, and comprehensive error handling. Optimize performance. Include the tests specified in 8.5.

### 12.3 Quality Checklist (Verify After Each Phase)

- [ ] `docker compose up` starts cleanly with no errors
- [ ] All new database tables have migrations (up and down)
- [ ] API endpoints return proper error responses (400, 401, 404, 422, 500)
- [ ] UI works for non-technical users: clear labels, helpful validation messages, no jargon
- [ ] All financial calculations use DECIMAL types, never floating point
- [ ] No PHI appears in application logs
- [ ] Seed data creates a realistic dataset for testing
- [ ] Navigation flows logically between related pages
- [ ] Loading, empty, and error states are all handled in the UI
- [ ] Specified tests pass

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| PHI | Protected Health Information — under U.S. law (HIPAA), this includes any patient-identifying health data such as names tied to medical conditions, dates of service, treatment details, and insurer identifiers |
| EOB | Explanation of Benefits — a statement from the insurer detailing how a claim was processed, what was paid, and what the patient owes |
| CPT Code | Current Procedural Terminology — standardized codes for medical services (e.g., 90837 = 60-min therapy session) |
| ICD-10 | International Classification of Diseases, 10th revision — diagnosis codes used on claims |
| NPI | National Provider Identifier — a unique 10-digit number for healthcare providers |
| Allowed Amount | The maximum amount the insurance will consider for a service, regardless of what the provider billed |
| Superbill | An itemized receipt from the provider listing services, codes, and charges for a visit |
| COB | Coordination of Benefits — process for determining which insurer pays first when a patient has multiple plans |
| Reprocessing | A request to the insurer to re-adjudicate a claim, typically due to an error in the original processing |
| Adjudication | The insurer's process of reviewing and deciding on a claim |
| Out-of-Network (OON) | A provider who does not have a contract with the patient's insurance plan, typically resulting in lower reimbursement rates |
