# Document Examples

This directory is intentionally empty in the public snapshot.

The original development environment used real medical PDFs (superbills, monthly invoices, and Explanation of Benefits documents) for testing the AI-powered import flow. Those files contained protected health information and have been removed.

## Testing the Document Importer Locally

To exercise the three importers (`/documents/extract`, `/documents/confirm-superbill`, `/documents/reconcile-invoice`, `/documents/confirm-eob`) you will need PDFs that resemble the formats described in `../SPEC.md`:

- **Superbill** — itemized session list with date, CPT code, modifier, place of service, fee, clinician name, and a footer block listing each clinician's NPI and license number.
- **Monthly Statement / Invoice** — flat list of dated transactions with amounts; may include "Missed/Cancelled Appointment Fee" entries that have no CPT code.
- **EoB (Explanation of Benefits)** — header with member info, claim metadata (claim number, patient account number, provider), and a per-line table with billed / allowed / plan-paid / deductible / copay / coinsurance / amount-owed columns. Provider names typically appear in the format `"F LASTNAME"`.

You can either generate synthetic PDFs that match these layouts or use any sample document — the extraction prompts in `backend/src/routes/document-upload.ts` are tuned for the exact field names listed in `SPEC.md` Section 1.4. Anything wildly different will require prompt adjustments.

A `ANTHROPIC_API_KEY` is required in `.env` to actually run the extraction (the rest of the app runs without one).
