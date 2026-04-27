import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Layers,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
} from "lucide-react";
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
import { servicesApi, clinicProvidersApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ServiceStatus, ServiceFilters, Clinician } from "@/types";

const STATUS_OPTIONS: { value: ServiceStatus; label: string }[] = [
  { value: "unsubmitted", label: "Unsubmitted" },
  { value: "claim_ready", label: "Claim Ready" },
  { value: "claimed", label: "Claimed" },
];

function getServiceStatusColor(status: ServiceStatus): string {
  const colors: Record<ServiceStatus, string> = {
    unsubmitted:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    claim_ready:
      "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    claimed:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  };
  return colors[status] ?? colors.unsubmitted;
}

function getServiceStatusLabel(status: ServiceStatus): string {
  const labels: Record<ServiceStatus, string> = {
    unsubmitted: "Unsubmitted",
    claim_ready: "Claim Ready",
    claimed: "Claimed",
  };
  return labels[status] ?? status;
}

// Sortable columns config
type SortField =
  | "dateOfService"
  | "cptCode"
  | "billedAmount"
  | "status"
  | "createdAt";

interface SortConfig {
  field: SortField;
  order: "asc" | "desc";
}

function SortIcon({
  field,
  current,
}: {
  field: SortField;
  current: SortConfig;
}) {
  if (current.field !== field)
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  return current.order === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

export function ServicesPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<ServiceFilters>({
    page: 1,
    limit: 50,
    sortBy: "dateOfService",
    sortOrder: "desc",
  });

  const [sort, setSort] = useState<SortConfig>({
    field: "dateOfService",
    order: "desc",
  });

  // Fetch all clinics to get clinicians for the filter dropdown
  const { data: clinics = [] } = useQuery({
    queryKey: ["clinicProviders"],
    queryFn: () => clinicProvidersApi.list(),
  });

  // Build flat list of clinicians from clinics
  const allClinicians: Clinician[] = clinics.flatMap(
    (c) => c.clinicians ?? [],
  );
  // Deduplicate by id
  const clinicianMap = new Map(allClinicians.map((c) => [c.id, c]));
  const clinicians = [...clinicianMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["services", filters],
    queryFn: () => servicesApi.list(filters),
  });

  const services = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const handleSort = (field: SortField) => {
    const newOrder =
      sort.field === field && sort.order === "asc" ? "desc" : "asc";
    setSort({ field, order: newOrder });
    setFilters((f) => ({
      ...f,
      sortBy: field,
      sortOrder: newOrder,
      page: 1,
    }));
  };

  const hasActiveFilters =
    filters.status ||
    filters.clinicianId ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.search;

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 50,
      sortBy: sort.field,
      sortOrder: sort.order,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="text-muted-foreground">
            Track service line items from superbill imports.
          </p>
        </div>
        <Button onClick={() => navigate("/claims/generate")}>
          <Layers className="mr-2 h-4 w-4" />
          Generate Claims
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Row 1: Search + Status */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by CPT code or description..."
                className="pl-9"
                value={filters.search || ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    search: e.target.value,
                    page: 1,
                  }))
                }
              />
            </div>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                setFilters((f) => ({
                  ...f,
                  status:
                    value === "all"
                      ? undefined
                      : (value as ServiceStatus),
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
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: Clinician + Date Range */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-1.5 sm:min-w-[220px]">
              <label className="text-xs font-medium text-muted-foreground">
                Clinician
              </label>
              <Select
                value={filters.clinicianId || "all"}
                onValueChange={(value) =>
                  setFilters((f) => ({
                    ...f,
                    clinicianId: value === "all" ? undefined : value,
                    page: 1,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Clinicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinicians</SelectItem>
                  {clinicians.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.credential ? `, ${c.credential}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                From
              </label>
              <Input
                type="date"
                value={filters.dateFrom || ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    dateFrom: e.target.value || undefined,
                    page: 1,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                To
              </label>
              <Input
                type="date"
                value={filters.dateTo || ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    dateTo: e.target.value || undefined,
                    page: 1,
                  }))
                }
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} service{total !== 1 ? "s" : ""}
          {hasActiveFilters ? " matching filters" : ""}
        </p>
      </div>

      {/* Services table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("dateOfService")}
                >
                  Date
                  <SortIcon field="dateOfService" current={sort} />
                </TableHead>
                <TableHead>Patient</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("cptCode")}
                >
                  CPT
                  <SortIcon field="cptCode" current={sort} />
                </TableHead>
                <TableHead>Mod</TableHead>
                <TableHead className="text-center">POS</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Clinician</TableHead>
                <TableHead>Dx</TableHead>
                <TableHead className="text-center">Units</TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none"
                  onClick={() => handleSort("billedAmount")}
                >
                  Fee
                  <SortIcon field="billedAmount" current={sort} />
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer select-none"
                  onClick={() => handleSort("status")}
                >
                  Status
                  <SortIcon field="status" current={sort} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Loading services...
                  </TableCell>
                </TableRow>
              ) : services.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {hasActiveFilters
                      ? "No services match the current filters."
                      : "No services found. Import a superbill to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                services.map((svc) => (
                  <TableRow key={svc.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(svc.dateOfService)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {svc.dependent
                        ? `${svc.dependent.firstName} ${svc.dependent.lastName}`
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {svc.cptCode}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {svc.cptModifier || "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-center">
                      {svc.placeOfService || "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {svc.description || "\u2014"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {svc.clinician?.name ?? "\u2014"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {svc.diagnosisCodes?.length
                        ? svc.diagnosisCodes.join(", ")
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-center">
                      {svc.units ?? 1}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(svc.billedAmount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getServiceStatusColor(svc.status)}>
                        {getServiceStatusLabel(svc.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > (filters.limit ?? 50) && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(filters.page! - 1) * filters.limit! + 1}–
            {Math.min(filters.page! * filters.limit!, total)} of {total}
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
                (filters.page ?? 1) * (filters.limit ?? 50) >= total
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
