import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Financial calculation tests.
 *
 * ClaimPilot stores monetary values as Prisma Decimal (arbitrary precision).
 * These tests verify that financial arithmetic avoids floating-point drift
 * and maintains the precision required for medical billing.
 */

// Helper: create a Decimal and round to 2 decimal places (currency)
function currency(value: string | number): Decimal {
  return new Decimal(value).toDecimalPlaces(2);
}

describe("Financial Calculations", () => {
  // ── Precision ────────────────────────────────────

  it("billed amount - insurance paid = patient responsibility", () => {
    const billedAmount = currency("350.75");
    const insurancePaid = currency("280.60");
    const patientResponsibility = billedAmount.minus(insurancePaid);

    expect(patientResponsibility.toFixed(2)).toBe("70.15");
  });

  it("no floating point drift: 0.1 + 0.2 calculations", () => {
    // Classic floating point problem: 0.1 + 0.2 !== 0.3 in IEEE 754
    const a = new Decimal("0.1");
    const b = new Decimal("0.2");
    const sum = a.plus(b);

    expect(sum.toFixed(2)).toBe("0.30");
    expect(sum.equals(new Decimal("0.3"))).toBe(true);

    // Verify native JS would fail this
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  // ── Patient responsibility breakdown ─────────────

  it("coinsurance + deductible + copay + plan_does_not_cover = patient_responsibility", () => {
    const coinsurance = currency("45.00");
    const deductible = currency("150.00");
    const copay = currency("30.00");
    const planDoesNotCover = currency("25.50");

    const patientResponsibility = coinsurance
      .plus(deductible)
      .plus(copay)
      .plus(planDoesNotCover);

    expect(patientResponsibility.toFixed(2)).toBe("250.50");
  });

  // ── Payment allocation ───────────────────────────

  it("payment allocation sum does not exceed payment total", () => {
    const paymentTotal = currency("500.00");

    const allocations = [
      currency("200.00"),
      currency("150.00"),
      currency("100.00"),
      currency("50.00"),
    ];

    const allocationSum = allocations.reduce(
      (acc, val) => acc.plus(val),
      new Decimal("0"),
    );

    expect(allocationSum.lessThanOrEqualTo(paymentTotal)).toBe(true);
    expect(allocationSum.toFixed(2)).toBe("500.00");
  });

  // ── Currency format ──────────────────────────────

  it("currency values maintain 2 decimal places", () => {
    // Division that would produce many decimal places
    const total = new Decimal("100.00");
    const parts = 3;
    const perPart = total.dividedBy(parts).toDecimalPlaces(2);

    // 100 / 3 = 33.33 (rounded to 2 decimal places)
    expect(perPart.toFixed(2)).toBe("33.33");

    // Verify remainder handling
    const allocated = perPart.times(parts);
    const remainder = total.minus(allocated);
    expect(remainder.toFixed(2)).toBe("0.01");

    // Total allocated + remainder = original
    expect(allocated.plus(remainder).toFixed(2)).toBe("100.00");
  });

  // ── Large amounts ────────────────────────────────

  it("large amounts (>$100,000) maintain precision", () => {
    const largeAmount = currency("123456.78");
    const payment = currency("100000.00");
    const remaining = largeAmount.minus(payment);

    expect(remaining.toFixed(2)).toBe("23456.78");

    // Very large amount
    const veryLarge = currency("999999.99");
    const small = currency("0.01");
    const result = veryLarge.plus(small);

    expect(result.toFixed(2)).toBe("1000000.00");
  });
});
