import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Filter, ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { claimsApi } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { ClaimStatus, ClaimFilters } from "@/types";

const STATUS_OPTIONS: ClaimStatus[] = [
  "draft",
  "submitted",
  "received",
  "processing",
  "resolved",
  "paid",
  "closed",
  "denied",
  "reprocessing_requested",
  "reprocessing",
  "reprocessed",
  "appealed",
  "write_off",
];

export function ClaimsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const statusFromUrl = searchParams.get("status") as ClaimStatus | null;
  const isFilteredFromDashboard = !!statusFromUrl;

  const [filters, setFilters] = useState<ClaimFilters>(() => ({
    page: 1,
    limit: 20,
    ...(statusFromUrl ? { status: statusFromUrl } : {}),
  }));

  // Sync URL params to filters on URL change
  useEffect(() => {
    const newStatus = searchParams.get("status") as ClaimStatus | null;
    setFilters((f) => ({
      ...f,
      status: newStatus || undefined,
      page: 1,
    }));
  }, [searchParams]);

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["claims", filters],
    queryFn: () => claimsApi.list(filters),
  });

  const claims = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  // ── Bulk selection state ────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset selection whenever filters/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters]);

  const draftClaimsOnPage = useMemo(
    () => claims.filter((c) => c.status === "draft"),
    [claims],
  );

  const allDraftsSelected =
    draftClaimsOnPage.length > 0 &&
    draftClaimsOnPage.every((c) => selectedIds.has(c.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllDrafts = () => {
    if (allDraftsSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(draftClaimsOnPage.map((c) => c.id)));
    }
  };

  const bulkSubmitMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => claimsApi.update(id, { status: "submitted" })),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (succeeded > 0 && failed === 0) {
        toast({
          title: `${succeeded} claim${succeeded > 1 ? "s" : ""} marked as submitted`,
        });
      } else if (succeeded > 0 && failed > 0) {
        toast({
          title: `${succeeded} updated, ${failed} failed`,
          description: "Some claims could not be transitioned.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to update claims",
          description: "No claims were transitioned.",
          variant: "destructive",
        });
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update claims",
        description: err?.response?.data?.error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isFilteredFromDashboard && (
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Claims</h1>
            <p className="text-muted-foreground">
              {isFilteredFromDashboard
                ? `Showing ${getStatusLabel(statusFromUrl!)} claims · `
                : "Manage and track all insurance claims."}
              {isFilteredFromDashboard && (
                <button
                  className="text-primary underline hover:text-primary/80"
                  onClick={() => navigate("/claims")}
                >
                  Show all
                </button>
              )}
            </p>
          </div>
        </div>
        {/* Claims are created via EoB import */}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search claims..."
                className="pl-9"
                value={filters.search || ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
                }
              />
            </div>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                setFilters((f) => ({
                  ...f,
                  status: value === "all" ? undefined : (value as ClaimStatus),
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {getStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between py-3">
            <p className="text-sm font-medium">
              {selectedCount} claim{selectedCount > 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkSubmitMutation.isPending}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  bulkSubmitMutation.mutate(Array.from(selectedIds))
                }
                disabled={bulkSubmitMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                {bulkSubmitMutation.isPending
                  ? "Updating..."
                  : "Mark as Submitted"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Claims table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-input"
                    checked={allDraftsSelected}
                    disabled={draftClaimsOnPage.length === 0}
                    onChange={toggleAllDrafts}
                    aria-label="Select all draft claims on this page"
                    title={
                      draftClaimsOnPage.length === 0
                        ? "No draft claims on this page"
                        : "Select/deselect all draft claims"
                    }
                  />
                </TableHead>
                <TableHead>Claim #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Clinician</TableHead>
                <TableHead className="text-center">Period</TableHead>
                <TableHead className="text-center">Services</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    Loading claims...
                  </TableCell>
                </TableRow>
              ) : claims.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No claims found.
                  </TableCell>
                </TableRow>
              ) : (
                claims.map((claim) => (
                  <TableRow
                    key={claim.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/claims/${claim.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-input disabled:cursor-not-allowed disabled:opacity-40"
                        checked={selectedIds.has(claim.id)}
                        disabled={claim.status !== "draft"}
                        onChange={() => toggleOne(claim.id)}
                        aria-label={`Select claim ${claim.claimNumber || claim.id}`}
                        title={
                          claim.status !== "draft"
                            ? "Only draft claims can be selected for bulk submit"
                            : ""
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {claim.claimNumber || "—"}
                    </TableCell>
                    <TableCell>
                      {claim.dependent
                        ? `${claim.dependent.firstName} ${claim.dependent.lastName}`
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {(claim as any).serviceLineItems?.[0]?.clinician?.name ?? "\u2014"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      {claim.servicePeriodStart
                        ? (() => {
                            const start = formatDate(claim.servicePeriodStart);
                            const end = claim.servicePeriodEnd
                              ? formatDate(claim.servicePeriodEnd)
                              : null;
                            return end && end !== start
                              ? `${start} – ${end}`
                              : start;
                          })()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {claim._count?.serviceLineItems ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {claim.totalBilled != null
                        ? formatCurrency(claim.totalBilled)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getStatusColor(claim.status)}>
                        {getStatusLabel(claim.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to={`/claims/${claim.id}`} onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > (filters.limit ?? 20) && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {claims.length} of {total} claims
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(filters.page ?? 1) <= 1}
              onClick={() =>
                setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                (filters.page ?? 1) * (filters.limit ?? 20) >= total
              }
              onClick={() =>
                setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))
              }
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
