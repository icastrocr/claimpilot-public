# Backend scripts

## `export-redacted-fixture.ts`

Reads a real ClaimPilot database, applies redaction + date-shift rules, and writes `backend/prisma/seed-data.json`. The seed script (`prisma/seed.ts`) loads that JSON on first boot to give a reviewer a populated UI without shipping any real PHI.

**Read-only** against the source database.

### What gets redacted

| Field | Treatment |
|---|---|
| Clinic / clinician / patient / insurer names | Fixed placeholders (Dr. A. Example, Example Pediatric Clinic, Example Insurance Co., Patient A) |
| NPIs, EINs, license numbers, claim numbers, member IDs, check numbers | Sequential placeholders (`1234567891`, `EX0000000001`, etc.) |
| Free-text notes, descriptions, advocate comments | `[redacted note]` if non-empty, `null` otherwise |
| All dates | Minus 2 years and 6 months (preserves cadence and spacing) |
| All UUIDs | Regenerated, with referential integrity preserved |
| Reconciliation report `summaryJson` | Aggregate counts/totals — kept as-is |
| Reconciliation report `itemsJson` | Walked recursively; clinician names mapped to placeholders, descriptions redacted, UUIDs remapped, dates shifted |

### What stays as-is

Amounts (billed, allowed, plan paid, deductible, copay, coinsurance, patient responsibility), CPT codes, modifiers, place-of-service codes, ICD-10 diagnosis codes, processing codes (ND, 0H, M6), statuses, credentials (LMHC, Psy.D.), plan types, charge types, and the structural relationships between records.

### Workflow

```bash
# 1. From a fresh checkout of the public repo:
git clone https://github.com/icastrocr/claimpilot-public.git ~/tmp/seed-prep
cd ~/tmp/seed-prep/backend
npm install
npx prisma generate

# 2. Generate the fixture by pointing at a private ClaimPilot database.
#    (The default docker-compose DB exposes 5432 on the host.)
DATABASE_URL=postgres://claimpilot:claimpilot@localhost:5432/claimpilot \
  npm run db:export-redacted-fixture

# 3. Eyeball backend/prisma/seed-data.json. If anything looks off,
#    adjust the script and re-run.

# 4. Test the seeded experience end-to-end in this fresh checkout:
cd ~/tmp/seed-prep
docker compose down -v       # wipe any prior DB volume
docker compose up --build    # boots, runs migrations, seeds the fixture
# Open http://localhost:3000, log in as demo / password123, click around.

# 5. When satisfied, copy backend/prisma/seed-data.json into your local
#    checkout of the public repo and commit it.
```

### Configuration

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Source database connection string (required) |
| `SOURCE_USER_HANDLE` | Pick a specific user when the DB has multiple users (optional; default: first user found) |
