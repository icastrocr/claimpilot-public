import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import type { ClaimStatus } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function formatDate(date: string | Date, fmt = "MMM d, yyyy"): string {
  if (typeof date === "string") {
    // Dates at UTC midnight (e.g. "2025-12-22T00:00:00.000Z") are date-only values
    // from Prisma @db.Date columns — parse as local to avoid timezone shift.
    // Real timestamps have non-zero time components (e.g. claim events with "T06:28:21.439Z").
    const isMidnightUtc = date.endsWith("T00:00:00.000Z");
    const isDateOnly = date.length === 10 || isMidnightUtc;

    if (!isDateOnly) {
      // Real timestamp — parse with parseISO to preserve time for formats like "h:mm a"
      return format(parseISO(date), fmt);
    }

    // Date-only: parse as local date to avoid timezone-shift-by-one-day bugs
    const dateOnly = date.slice(0, 10);
    const [y, m, d] = dateOnly.split("-").map(Number);
    return format(new Date(y, m - 1, d), fmt);
  }
  return format(date, fmt);
}

export function getStatusColor(status: ClaimStatus): string {
  const colors: Record<ClaimStatus, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    received:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    processing:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    resolved:
      "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    denied: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    reprocessing_requested:
      "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    reprocessing:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
    reprocessed:
      "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
    appealed:
      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    write_off:
      "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  };
  return colors[status] ?? colors.draft;
}

export function getStatusLabel(status: ClaimStatus): string {
  const labels: Record<ClaimStatus, string> = {
    draft: "Draft",
    submitted: "Submitted",
    received: "Received",
    processing: "Processing",
    resolved: "Resolved",
    paid: "Paid",
    closed: "Closed",
    denied: "Denied",
    reprocessing_requested: "Reprocessing Requested",
    reprocessing: "Reprocessing",
    reprocessed: "Reprocessed",
    appealed: "Appealed",
    write_off: "Write-Off",
  };
  return labels[status] ?? status;
}

export function getEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    status_change: "Status:",
    payment_received: "Payment",
    note_added: "Note",
    claim_created: "Created",
    claim_updated: "Updated",
    document_uploaded: "Document",
    appeal_filed: "Appeal",
    reprocessing_requested: "Reprocessing",
    payment_recorded: "Payment",
  };
  return labels[eventType] ?? eventType;
}
