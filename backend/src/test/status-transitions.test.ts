import { describe, it, expect } from "vitest";
import {
  isValidStatusTransition,
  type ClaimStatus,
} from "../utils/validators.js";

describe("Claim Status Transitions", () => {
  // ── Valid Transitions ────────────────────────────

  describe("valid transitions", () => {
    const validTransitions: [ClaimStatus, ClaimStatus][] = [
      ["draft", "submitted"],
      ["submitted", "received"],
      ["submitted", "processing"],
      ["received", "processing"],
      ["processing", "adjudicated"],
      ["processing", "denied"],
      ["adjudicated", "paid"],
      ["adjudicated", "denied"],
      ["paid", "closed"],
      ["paid", "reprocessing_requested"],
      ["denied", "reprocessing_requested"],
      ["denied", "appealed"],
      ["denied", "write_off"],
      ["reprocessing_requested", "reprocessing"],
      ["reprocessing", "reprocessed"],
      ["reprocessing", "denied"],
      ["reprocessed", "paid"],
      ["reprocessed", "denied"],
      ["appealed", "paid"],
      ["appealed", "denied"],
      ["appealed", "write_off"],
    ];

    it.each(validTransitions)(
      "%s -> %s is valid",
      (from, to) => {
        expect(isValidStatusTransition(from, to)).toBe(true);
      },
    );
  });

  // ── Invalid Transitions ──────────────────────────

  describe("invalid transitions", () => {
    const invalidTransitions: [ClaimStatus, ClaimStatus][] = [
      ["draft", "paid"],
      ["draft", "denied"],
      ["submitted", "paid"],
      ["processing", "paid"], // must go through adjudicated
      ["paid", "draft"],
      ["closed", "draft"],
      ["closed", "submitted"],
      ["write_off", "draft"],
      ["denied", "paid"], // must go through reprocessing or appeal
    ];

    it.each(invalidTransitions)(
      "%s -> %s is invalid",
      (from, to) => {
        expect(isValidStatusTransition(from, to)).toBe(false);
      },
    );
  });

  // ── Terminal states ──────────────────────────────

  describe("terminal states have no outgoing transitions", () => {
    it("closed cannot transition to anything", () => {
      const allStatuses: ClaimStatus[] = [
        "draft", "submitted", "received", "processing",
        "adjudicated", "paid", "closed", "denied",
        "reprocessing_requested", "reprocessing", "reprocessed",
        "appealed", "write_off",
      ];

      for (const target of allStatuses) {
        expect(isValidStatusTransition("closed", target)).toBe(false);
      }
    });

    it("write_off cannot transition to anything", () => {
      const allStatuses: ClaimStatus[] = [
        "draft", "submitted", "received", "processing",
        "adjudicated", "paid", "closed", "denied",
        "reprocessing_requested", "reprocessing", "reprocessed",
        "appealed", "write_off",
      ];

      for (const target of allStatuses) {
        expect(isValidStatusTransition("write_off", target)).toBe(false);
      }
    });
  });

  // ── Self-transitions ─────────────────────────────

  describe("self-transitions are not allowed", () => {
    const statuses: ClaimStatus[] = [
      "draft", "submitted", "received", "processing",
      "adjudicated", "paid", "closed", "denied",
      "reprocessing_requested", "reprocessing", "reprocessed",
      "appealed", "write_off",
    ];

    it.each(statuses)("%s -> %s (same status) is invalid", (status) => {
      expect(isValidStatusTransition(status, status)).toBe(false);
    });
  });
});
