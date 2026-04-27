# UHC Claims Submission Runbook

> **About this document.** This runbook is the persistent memory layer the ClaimPilot run-time agent reads before driving the insurer's portal. Every hard-won finding lives here so the next session doesn't have to re-learn it. Names, identifiers, dates, and dollar amounts in this version have been replaced with generic placeholders for public sharing; the technical content is unchanged.
>
> *Submission artifact for the Klaviyo AI Builder Residency, April 2026.*

---

## Overview

This document describes the process for submitting out-of-network behavioral-health claims on the UHC/Optum portal (`liveandworkwell.com`) using data from ClaimPilot (`http://localhost:3000`). The claims are filed by an insured family member on behalf of a dependent receiving care from a small set of out-of-network providers.

The runbook is intentionally narrow: maybe 30 facts worth knowing about how this specific portal behaves, captured so the agent (and the human supervising it) can move fast and not relearn lessons.

---

## Portal Details

- **URL:** `https://www.liveandworkwell.com/en/member/<plan>/claims/submit-claim`
- **Authentication:** HealthSafe ID (Optum SSO)
- **Session behavior:** Sessions can timeout; the portal may redirect through HealthSafe ID but auto-redirects back if still authenticated.
- **Processing:** Claims are processed nightly; editable until then via "Claim history."

## ClaimPilot Details

- **URL:** `http://localhost:3000`
- **Session behavior:** Sessions expire frequently; the user may need to re-login multiple times during a long submission session.
- **Claim detail URL pattern:** `/claims/{claim-id}`
- **Claims list URL:** `/claims`
- **Note:** "View" buttons on the claims list page may all link to the same claim due to a UI bug. Use JavaScript to extract actual `href`s: `document.querySelectorAll('a[href*="/claims/"]')` and navigate via `window.location.href`.

---

## Key Data Mappings

### Place of Service (POS) Codes

| ClaimPilot POS | Portal Dropdown Value | Portal Label |
|---|---|---|
| 10 (Telehealth) | `02` | Virtual visit |
| 11 (Office) | `11` | Office |

### Common CPT Codes

| CPT | Description |
|---|---|
| 90847 | Family Therapy w/ Patient Present |
| 90846 | Family Therapy w/o Patient Present |
| 90834 | Individual Therapy (45 min) |
| 90832 | Individual Executive Functioning (30 min) |

### Common Diagnosis Codes

| Code | Description |
|---|---|
| F32.A | Depression |
| F41.9 | Anxiety disorder |

### Providers

Provider records are stored in ClaimPilot with: name, NPI, tax ID, license type, and address. Specific provider details are not included in this public version.

---

## Submission Workflow

### Step 1: Gather Claim Data from ClaimPilot

1. Navigate to the claim detail page in ClaimPilot.
2. Record: provider name, service dates, CPT codes, POS codes, amounts, diagnosis codes.
3. Note the total billed amount for verification.

### Step 2: Start a New Claim on the Portal

Two approaches:

**Option A — Prefill from Previous Claim (Preferred)**
1. Click "Prefill with previous claim" on the landing page.
2. A dialog shows previous claims with patient, provider, date, and procedure codes.
3. Select the most relevant previous claim (same provider, similar service lines).
4. Click "Prefill claim form" — this takes you directly to the Confirmation page with all data pre-populated.
5. The prefill copies *all* service lines from the previous claim, so you'll likely need to delete extras and edit the remaining ones.

**Option B — Start with Blank Claim**
1. Click "Start with blank claim."
2. Fill in patient info, provider search, diagnosis codes, then add service lines manually.

### Step 3: Edit Service Lines

The portal has a 4-step flow:
1. Insured/patient information
2. Provider information
3. Visit/service details
4. Confirmation and submittal

When prefilling, you land on step 4. From there:
- Click "edit" (lowercase) next to a service line to open the edit form.
- This navigates to step 3 with the edit form open for that specific line.
- After editing, click "Save Changes" to save that line.
- To add lines, use the "copy" button (duplicates a line and opens the edit form for the copy).
- To remove lines, click "delete" then confirm with "Delete item" in the confirmation dialog.
- When all lines are correct, click "Update" (if you came from step 4) or "Save & Continue" (if on step 3 directly) to return to the confirmation page.

### Step 4: Review and Submit

1. On the Confirmation page, verify all service lines, total amount, provider info, and diagnosis codes.
2. Click "Submit Claim."
3. A confirmation dialog appears — click "Yes, submit my claim."
4. **Download the PDF** by clicking "Download a PDF for your records."
5. Note the confirmation number.
6. Click "I have another claim to file" to start the next one.

### Step 5: Update ClaimPilot Status

After all claims are submitted on the portal, update their status in ClaimPilot:

1. Navigate to the Claims list page (`http://localhost:3000/claims`).
2. Each claim row has a checkbox on the left side.
3. Select the checkboxes for all claims that were just submitted.
4. Once at least one Draft claim is selected, a **"Mark as Submitted"** button appears at the top of the list.
5. Click "Mark as Submitted" — the status for all selected claims changes from "Draft" to "Submitted" immediately.
6. There is also a "Select all draft claims on this page" checkbox in the header row for convenience.

> The status change is on the **claims list page**, not the individual claim detail page.

---

## Critical Technical Details for Browser Automation

### React Form Inputs

The portal uses React. Standard DOM manipulation (setting `.value` and dispatching events) does NOT reliably update React's internal state. Values may appear visually but revert on save.

**The only reliable method** is calling React's `onChange` handler directly via the `__reactProps$` key on DOM elements:

```javascript
function setReactValue(input, value) {
  const propsKey = Object.keys(input).find(k => k.startsWith('__reactProps'));
  if (propsKey) {
    const props = input[propsKey];
    if (props && props.onChange) {
      props.onChange({
        target: { value: value },
        currentTarget: { value: value },
        preventDefault: () => {},
        stopPropagation: () => {}
      });
      return 'Called onChange directly';
    }
  }
  // Fallback (less reliable)
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'Used native setter fallback';
}
```

**This applies to:**
- Date of Service input (text input with `mm/dd/yyyy` format)
- Amount input (text input with placeholder `$0.01 - $9,999.99`)
- Procedure code input (combobox input with placeholder `Enter a procedure code`)
- Service location dropdown (`select` element — also use `__reactProps$` `onChange` with `{ target: { value: "02" } }` for Virtual visit or `{ target: { value: "11" } }` for Office)

### Finding Form Inputs

```javascript
// Find date input (by value pattern or placeholder)
const inputs = document.querySelectorAll('input');
let dateInput = null;
inputs.forEach(i => {
  if (i.value && i.value.match(/\d{2}\/\d{2}\/\d{4}/)) dateInput = i;
});

// Find amount input
let amountInput = null;
inputs.forEach(i => {
  if (i.placeholder && i.placeholder.includes('$0.01')) amountInput = i;
});

// Find procedure code input
const procInput = document.querySelector('input[placeholder="Enter a procedure code"]');

// Find service location dropdown
const selects = document.querySelectorAll('select');
let locationSelect = null;
selects.forEach(s => {
  s.querySelectorAll('option').forEach(o => {
    if (o.value === '02' || o.value === '11') locationSelect = s;
  });
});
```

### Clicking Buttons Reliably

**Always use JavaScript `.click()` instead of coordinate-based clicking.** Coordinate clicks frequently miss or hit the wrong element when the layout shifts or the portal re-renders.

```javascript
// Generic button finder and clicker
function clickButton(textContent) {
  const buttons = document.querySelectorAll('button');
  let btn = null;
  buttons.forEach(b => {
    if (b.textContent.trim() === textContent) btn = b;
  });
  if (btn) { btn.click(); return 'Clicked'; }
  return 'Not found';
}

// Examples:
clickButton('Save Changes');
clickButton('Submit Claim');
clickButton('Yes, submit my claim');
clickButton('Delete item');
clickButton('Update');
```

### Service Line Edit Buttons

The page has multiple "Edit" and "edit" buttons:
- Uppercase **"Edit"** buttons (indices ~6–10) are for header sections (Insured Info, Patient Info, Payment, Diagnosis).
- Lowercase **"edit"** buttons are for individual service lines.

To find service-line edit buttons:
```javascript
const editBtns = [];
document.querySelectorAll('button').forEach(b => {
  if (b.textContent.trim() === 'edit') editBtns.push(b);
});
// editBtns[0] = first service line, editBtns[1] = second, etc.
```

### Prefill Dialog Handling

The prefill dialog uses radio buttons. **Do not use coordinate clicks** on the dialog — they close it prematurely.

```javascript
// Select a claim in the prefill dialog
const radios = document.querySelectorAll('input[type="radio"]');
radios[0].click();  // Select first claim (index 0)

// Then click the prefill button
const buttons = document.querySelectorAll('button');
let prefillBtn = null;
buttons.forEach(b => {
  if (b.textContent.trim() === 'Prefill claim form') prefillBtn = b;
});
prefillBtn.click();
```

### Delete Confirmation

Clicking "delete" on a service line opens a modal dialog. You must click "Delete item" to confirm:

```javascript
// After clicking delete on a service line...
let deleteBtn = null;
document.querySelectorAll('button').forEach(b => {
  if (b.textContent.trim() === 'Delete item') deleteBtn = b;
});
if (deleteBtn) deleteBtn.click();
```

### Copying Service Lines

The "copy" button duplicates a service line and opens the edit form for the new copy. This is efficient for claims with many similar lines — create one correct line, then copy and adjust dates/locations.

```javascript
const copyBtns = [];
document.querySelectorAll('button').forEach(b => {
  if (b.textContent.trim() === 'copy') copyBtns.push(b);
});
// Click copy on a specific line
copyBtns[copyBtns.length - 1].click();  // Copy last line
// Edit form opens pre-filled — change what's needed, then Save Changes
```

---

## Efficiency Tips

1. **Save after every service-line edit** to avoid losing work due to session timeouts.
2. **Prefill from the most similar previous claim** to minimize edits — ideally same provider, same CPT codes.
3. **Use the copy feature** for claims with many identical service lines (same CPT, same amount) — create one correct line, then copy and only change the date and location.
4. **Download the PDF** immediately after each submission — the confirmation page has a "Download a PDF for your records" button.
5. **Keep ClaimPilot open in a separate tab** for reference, but be prepared for session expiry.
6. **When deleting multiple service lines**, delete from the *last* line backward to avoid index-shifting issues.
7. **Check the total amount** on the confirmation page before submitting — it should match ClaimPilot exactly.

---

## Submission Batch Template

Each monthly batch follows the same shape. The actual data (specific patients, providers, dates, amounts, confirmation numbers) is stored in ClaimPilot and is not included in this public runbook.

**Batch metadata captured per claim:**
- ClaimPilot claim ID
- Provider
- Service period
- Number of service lines
- Total billed amount
- Portal confirmation number (post-submission)
- PDF saved (yes/no)

**Resume Instructions (for any batch)**
1. Open Chrome with ClaimPilot (`localhost:3000/claims`) and `liveandworkwell.com` portal logged in.
2. On the portal, go to the submit-claim page and click "Prefill with previous claim."
3. Select the most relevant previous claim for each provider (same provider, similar CPT codes).
4. Edit service lines to match the data in ClaimPilot (delete extras, edit dates/amounts/locations/CPT codes, copy lines as needed).
5. Submit each claim, download PDF confirmation after each.
6. After all claims are submitted, go to the ClaimPilot claims list and bulk-mark them as Submitted.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Form values revert after save | Use React `__reactProps$` `onChange` method, not native DOM. |
| Calendar picker closes unexpectedly | Don't use the calendar UI; set the date via JavaScript directly. |
| "Save & Continue" or "Submit Claim" doesn't respond | Use JavaScript `.click()` instead of coordinate clicks. |
| Prefill dialog closes when clicking radio | Use JavaScript `radios[n].click()` instead of coordinate clicks. |
| ClaimPilot "View" links all go to same claim | Extract `href`s via JS and navigate with `window.location.href`. |
| ClaimPilot session expired | Log in again manually; the runbook makes resume cheap. |
| Portal redirects to HealthSafe ID | Usually auto-redirects back; wait for it. |
| `nativeInputValueSetter` doesn't update React state | This is expected; always use `__reactProps$` `onChange`. |
| Service line index shifts during deletion | Delete from the *last* line backward. |
| Total amount on confirmation doesn't match ClaimPilot | Stop. Find the diff before submitting. Submission is human-approved precisely for this case. |

---

*Curated by hand. Read by the agent before every session. The point of this file is that no one — human or model — should ever have to re-learn the same lesson twice.*
