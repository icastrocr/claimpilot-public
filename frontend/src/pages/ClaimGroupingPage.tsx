import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Send,
  Eye,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { claimGroupingApi, insuranceProvidersApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type {
  ClaimGroup,
  ClaimGroupingFilters,
  ClaimGroupingPreview,
  ClaimGenerateResult,
  InsuranceProvider,
} from "@/types";

type Step = "filters" | "preview" | "result";

export function ClaimGroupingPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("filters");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [preview, setPreview] = useState<ClaimGroupingPreview | null>(null);
  const [result, setResult] = useState<ClaimGenerateResult | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ClaimGroupingFilters>({});

  // Insurance assignments: groupKey → insuranceProviderId
  const [insuranceAssignments, setInsuranceAssignments] = useState<
    Record<string, string>
  >({});

  // Fetch insurance providers for the dropdown
  const { data: insuranceProviders = [] } = useQuery({
    queryKey: ["insuranceProviders"],
    queryFn: () => insuranceProvidersApi.list(),
  });

  const previewMutation = useMutation({
    mutationFn: (f: ClaimGroupingFilters) => claimGroupingApi.preview(f),
    onSuccess: (data) => {
      setPreview(data);
      setStep("preview");
      setExpandedGroups(new Set(data.groups.map((_g, i) => String(i))));
      // Reset insurance assignments
      setInsuranceAssignments({});
    },
    onError: (err: any) => {
      toast({
        title: "Failed to preview grouping",
        description: err.response?.data?.error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: claimGroupingApi.generate,
    onSuccess: (data) => {
      setResult(data);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      toast({
        title: `${data.summary.claimsCreated} draft claims created`,
        description: `${data.summary.servicesLinked} services linked, $${data.summary.totalBilled} total billed`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to generate claims",
        description: err.response?.data?.error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handlePreview = () => {
    const f: ClaimGroupingFilters = {};
    if (dateFrom) f.dateFrom = dateFrom;
    if (dateTo) f.dateTo = dateTo;
    setFilters(f);
    previewMutation.mutate(f);
  };

  const handleGenerate = () => {
    if (!preview) return;
    generateMutation.mutate({
      ...filters,
      insuranceAssignments,
    });
  };

  const toggleGroup = (index: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleReset = () => {
    setStep("filters");
    setPreview(null);
    setResult(null);
    setExpandedGroups(new Set());
    setInsuranceAssignments({});
  };

  const setInsuranceForGroup = (groupKey: string, insuranceId: string) => {
    setInsuranceAssignments((prev) => ({ ...prev, [groupKey]: insuranceId }));
  };

  // Apply same insurance to all groups at once
  const setInsuranceForAll = (insuranceId: string) => {
    if (!preview) return;
    const assignments: Record<string, string> = {};
    for (const group of preview.groups) {
      assignments[group.key] = insuranceId;
    }
    setInsuranceAssignments(assignments);
  };

  // Count how many groups have insurance assigned
  const groupsWithInsurance = preview
    ? preview.groups.filter((g) => insuranceAssignments[g.key]).length
    : 0;
  const allGroupsHaveInsurance =
    preview != null &&
    preview.groups.length > 0 &&
    groupsWithInsurance === preview.groups.length;

  // Count groups that are ready (have insurance + pass validation)
  const readyCount = preview
    ? preview.groups.filter(
        (g) => g.isValid && insuranceAssignments[g.key],
      ).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate Claims</h1>
        <p className="text-muted-foreground">
          Group unsubmitted services into draft claims ready for clearinghouse
          submission.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        <StepIndicator
          label="1. Select Date Range"
          active={step === "filters"}
          completed={step === "preview" || step === "result"}
        />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StepIndicator
          label="2. Assign Insurance & Review"
          active={step === "preview"}
          completed={step === "result"}
        />
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <StepIndicator
          label="3. Claims Created"
          active={step === "result"}
          completed={false}
        />
      </div>

      {/* Step 1: Filters */}
      {step === "filters" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Services to Group</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a date range to find unsubmitted services. They will be
              grouped by patient + clinician + clinic into draft claims (max 6
              lines per CMS-1500). You'll assign the insurance provider in the
              next step.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">From</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">To</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <Button
                onClick={handlePreview}
                disabled={(!dateFrom && !dateTo) || previewMutation.isPending}
              >
                <Eye className="mr-2 h-4 w-4" />
                {previewMutation.isPending ? "Loading..." : "Preview Grouping"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && preview && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              label="Total Services"
              value={String(preview.summary.totalServices)}
            />
            <SummaryCard
              label="Claim Groups"
              value={String(preview.summary.totalGroups)}
            />
            <SummaryCard
              label="Ready to Generate"
              value={String(readyCount)}
              variant={readyCount > 0 ? "success" : "default"}
            />
            <SummaryCard
              label="Total Billed"
              value={formatCurrency(preview.summary.totalBilled)}
            />
          </div>

          {preview.groups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>No unsubmitted services found in this date range.</p>
                <p className="text-sm mt-1">
                  Make sure services have been imported and are still in
                  "Unsubmitted" status.
                </p>
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Bulk insurance assignment */}
              {insuranceProviders.length > 0 && preview.groups.length > 1 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-medium whitespace-nowrap">
                        Apply to all groups:
                      </span>
                      <Select onValueChange={setInsuranceForAll}>
                        <SelectTrigger className="w-[300px]">
                          <SelectValue placeholder="Select insurance for all groups..." />
                        </SelectTrigger>
                        <SelectContent>
                          {insuranceProviders.map((ip) => (
                            <SelectItem key={ip.id} value={ip.id}>
                              {ip.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Group list */}
              <div className="space-y-3">
                {preview.groups.map((group, index) => (
                  <GroupCard
                    key={`${group.key}-${index}`}
                    group={group}
                    index={index}
                    expanded={expandedGroups.has(String(index))}
                    onToggle={() => toggleGroup(String(index))}
                    insuranceProviders={insuranceProviders}
                    selectedInsuranceId={insuranceAssignments[group.key] ?? ""}
                    onInsuranceChange={(id) =>
                      setInsuranceForGroup(group.key, id)
                    }
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleReset}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={readyCount === 0 || generateMutation.isPending}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  {generateMutation.isPending
                    ? "Creating..."
                    : `Generate ${readyCount} Draft Claim${readyCount !== 1 ? "s" : ""}`}
                </Button>
                {!allGroupsHaveInsurance && preview.groups.length > 0 && (
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    {preview.groups.length - groupsWithInsurance} group(s) still
                    need insurance assigned
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Step 3: Result */}
      {step === "result" && result && (
        <>
          <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                    {result.summary.claimsCreated} Draft Claims Created
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    {result.summary.servicesLinked} services linked &middot;{" "}
                    {formatCurrency(result.summary.totalBilled)} total billed
                    {result.summary.groupsSkipped > 0 &&
                      ` \u00B7 ${result.summary.groupsSkipped} group(s) skipped`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Created claims table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Created Claims</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Clinician</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead className="text-center">Part</TableHead>
                    <TableHead className="text-center">Lines</TableHead>
                    <TableHead className="text-right">Total Billed</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.created.map((claim) => (
                    <TableRow key={claim.claimId}>
                      <TableCell className="font-medium">
                        {claim.patient}
                      </TableCell>
                      <TableCell>{claim.clinician}</TableCell>
                      <TableCell>{claim.insuranceProvider}</TableCell>
                      <TableCell className="text-center">
                        {claim.claimPart || "\u2014"}
                      </TableCell>
                      <TableCell className="text-center">
                        {claim.serviceCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(claim.totalBilled)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                          Draft
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/claims/${claim.claimId}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Skipped groups */}
          {result.skipped.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-900">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Skipped Groups
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Clinician</TableHead>
                      <TableHead className="text-center">Lines</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.skipped.map((skip, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {skip.patient}
                        </TableCell>
                        <TableCell>{skip.clinician}</TableCell>
                        <TableCell className="text-center">
                          {skip.serviceCount}
                        </TableCell>
                        <TableCell>
                          <ul className="text-sm text-destructive space-y-0.5">
                            {skip.issues.map((issue, j) => (
                              <li key={j}>{issue.message}</li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleReset}>
              Group More Services
            </Button>
            <Button onClick={() => navigate("/claims")}>
              <Send className="mr-2 h-4 w-4" />
              View All Claims
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────

function StepIndicator({
  label,
  active,
  completed,
}: {
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        active
          ? "bg-primary text-primary-foreground"
          : completed
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {completed && <CheckCircle2 className="inline h-3 w-3 mr-1" />}
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "success" | "warning";
}) {
  const colors = {
    default: "",
    success: "border-green-200 dark:border-green-900",
    warning: "border-amber-200 dark:border-amber-900",
  };
  return (
    <Card className={colors[variant]}>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  index,
  expanded,
  onToggle,
  insuranceProviders,
  selectedInsuranceId,
  onInsuranceChange,
}: {
  group: ClaimGroup;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  insuranceProviders: InsuranceProvider[];
  selectedInsuranceId: string;
  onInsuranceChange: (id: string) => void;
}) {
  const hasInsurance = !!selectedInsuranceId;
  const isReady = group.isValid && hasInsurance;

  return (
    <Card
      className={
        !group.isValid
          ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"
          : !hasInsurance
            ? "border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20"
            : ""
      }
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 rounded-t-lg"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}

        <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium">
            {group.dependent.firstName} {group.dependent.lastName}
          </span>
          <span className="text-sm text-muted-foreground">
            {group.clinician.name}
            {group.clinician.credential && `, ${group.clinician.credential}`}
          </span>
          <span className="text-sm text-muted-foreground">
            {group.clinic.name}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {group.services.length} line
            {group.services.length !== 1 ? "s" : ""}
          </span>
          <span className="font-medium">
            {formatCurrency(group.totalBilled)}
          </span>
          {isReady ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : !group.isValid ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-3 space-y-3">
          {/* Insurance selector */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-medium whitespace-nowrap">
              Insurance Provider:
            </label>
            <Select
              value={selectedInsuranceId || undefined}
              onValueChange={onInsuranceChange}
            >
              <SelectTrigger
                className={`w-[300px] ${!hasInsurance ? "border-amber-400 dark:border-amber-600" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <SelectValue placeholder="Select insurance provider..." />
              </SelectTrigger>
              <SelectContent>
                {insuranceProviders.map((ip) => (
                  <SelectItem key={ip.id} value={ip.id}>
                    {ip.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasInsurance && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Required
              </span>
            )}
          </div>

          {/* Validation issues */}
          {group.validationIssues.length > 0 && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-3 space-y-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                This group cannot be submitted until these issues are resolved:
              </p>
              <ul className="text-sm text-red-700 dark:text-red-300 ml-6 list-disc space-y-0.5">
                {group.validationIssues.map((issue, i) => (
                  <li key={i}>
                    <strong>{issue.entityName || issue.entityType}:</strong>{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Service period */}
          <div className="text-sm text-muted-foreground">
            Service period: {formatDate(group.servicePeriod.start)} &mdash;{" "}
            {formatDate(group.servicePeriod.end)}
            {group.dependent.memberId && (
              <span className="ml-4">
                Member ID: {group.dependent.memberId}
              </span>
            )}
          </div>

          {/* Services table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>CPT</TableHead>
                <TableHead>Mod</TableHead>
                <TableHead className="text-center">POS</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Dx Codes</TableHead>
                <TableHead className="text-center">Units</TableHead>
                <TableHead className="text-right">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.services.map((svc) => (
                <TableRow key={svc.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(svc.dateOfService)}
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
                  <TableCell className="font-mono text-xs">
                    {svc.diagnosisCodes.length > 0
                      ? svc.diagnosisCodes.join(", ")
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-center">{svc.units}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(svc.billedAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
