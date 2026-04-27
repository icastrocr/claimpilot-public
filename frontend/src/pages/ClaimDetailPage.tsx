import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Receipt,
  FileCheck,
  History,
  ArrowRight,
  List,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { claimsApi } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
  getEventLabel,
} from "@/lib/utils";
import { toast } from "@/components/ui/toast";

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>
        {value || "\u2014"}
      </span>
    </div>
  );
}

export function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: claim, isLoading } = useQuery({
    queryKey: ["claim", id],
    queryFn: () => claimsApi.get(id!),
    enabled: !!id,
  });

  const { data: events } = useQuery({
    queryKey: ["claim-events", id],
    queryFn: () => claimsApi.getEvents(id!),
    enabled: !!id,
  });

  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: "",
    paymentCheckNumber: "",
    paymentAmount: "",
  });

  const paymentMutation = useMutation({
    mutationFn: (data: {
      paymentDate: string;
      paymentCheckNumber?: string;
      paymentAmount: string;
    }) => claimsApi.recordPayment(id!, data),
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      setShowPaymentForm(false);
      queryClient.invalidateQueries({ queryKey: ["claim", id] });
      queryClient.invalidateQueries({ queryKey: ["claim-events", id] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to record payment",
        description: err.response?.data?.error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const eventsList = events ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading claim...</p>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Claim not found.</p>
        <Button variant="outline" onClick={() => navigate("/claims")}>
          Back to Claims
        </Button>
      </div>
    );
  }

  const hasEobData = claim.serviceLineItems?.some(
    (s) =>
      s.allowedAmount != null ||
      s.planPaid != null ||
      s.amountSaved != null ||
      s.deductibleApplied != null ||
      s.processingCodes?.length,
  );

  const hasPayment = !!claim.paymentDate;

  // Get the clinician from the first service line
  const clinician = claim.serviceLineItems?.[0]?.clinician;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/claims")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {claim.claimNumber || "Draft Claim"}
            </h1>
            <Badge className={getStatusColor(claim.status)}>
              {getStatusLabel(claim.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {claim.dependent
              ? `${claim.dependent.firstName} ${claim.dependent.lastName}`
              : "Unknown patient"}
            {clinician && <> &middot; {clinician.name}</>}
            {claim.servicePeriodStart && (
              <>
                {" "}
                &middot; {formatDate(claim.servicePeriodStart)}
                {claim.servicePeriodEnd &&
                  formatDate(claim.servicePeriodEnd) !==
                    formatDate(claim.servicePeriodStart) && (
                    <> &ndash; {formatDate(claim.servicePeriodEnd)}</>
                  )}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Section 1: Claim Details ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5" />
              Claim Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 divide-y">
            <DetailRow
              label="Status"
              value={
                <Badge className={getStatusColor(claim.status)}>
                  {getStatusLabel(claim.status)}
                </Badge>
              }
            />
            <DetailRow
              label="Patient"
              value={
                claim.dependent
                  ? `${claim.dependent.firstName} ${claim.dependent.lastName}`
                  : undefined
              }
            />
            <DetailRow
              label="Relationship"
              value={
                claim.dependent?.relationship ? (
                  <span className="capitalize">
                    {claim.dependent.relationship}
                  </span>
                ) : undefined
              }
            />
            <DetailRow
              label="Patient Account #"
              value={claim.patientAccountNumber}
              mono
            />
            <DetailRow
              label="Member ID"
              value={claim.dependent?.memberId}
              mono
            />
            <DetailRow
              label="Insurance"
              value={claim.insuranceProvider?.name}
            />
            <DetailRow label="Clinic" value={claim.clinic?.name} />
            <DetailRow
              label="Clinician"
              value={
                clinician
                  ? `${clinician.name}${clinician.credential ? `, ${clinician.credential}` : ""}`
                  : undefined
              }
            />
            {claim.servicePeriodStart && (
              <DetailRow
                label="Service Period"
                value={(() => {
                  const start = formatDate(claim.servicePeriodStart);
                  const end = claim.servicePeriodEnd
                    ? formatDate(claim.servicePeriodEnd)
                    : null;
                  return end && end !== start ? `${start} \u2013 ${end}` : start;
                })()}
              />
            )}
            {claim.dateSubmitted && (
              <DetailRow
                label="Date Submitted"
                value={formatDate(claim.dateSubmitted)}
              />
            )}
            {claim.notes && <DetailRow label="Notes" value={claim.notes} />}
          </CardContent>
        </Card>

        {/* ── Section 2: Payment ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5" />
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasPayment ? (
              <div className="space-y-1 divide-y">
                <DetailRow
                  label="Status"
                  value={
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      Received
                    </Badge>
                  }
                />
                <DetailRow
                  label="Payment Date"
                  value={
                    claim.paymentDate
                      ? formatDate(claim.paymentDate)
                      : undefined
                  }
                />
                <DetailRow
                  label="Check Number"
                  value={claim.paymentCheckNumber}
                  mono
                />
                <DetailRow
                  label="Amount"
                  value={
                    claim.paymentAmount != null ? (
                      <span className="text-green-600 dark:text-green-400">
                        {formatCurrency(claim.paymentAmount)}
                      </span>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  >
                    Pending
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    No payment recorded yet
                  </span>
                </div>

                {!showPaymentForm ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPaymentForm(true)}
                  >
                    Record Payment
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Payment Date</Label>
                        <Input
                          type="date"
                          value={paymentForm.paymentDate}
                          onChange={(e) =>
                            setPaymentForm((f) => ({
                              ...f,
                              paymentDate: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Check #</Label>
                        <Input
                          value={paymentForm.paymentCheckNumber}
                          onChange={(e) =>
                            setPaymentForm((f) => ({
                              ...f,
                              paymentCheckNumber: e.target.value,
                            }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Amount</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={paymentForm.paymentAmount}
                          onChange={(e) =>
                            setPaymentForm((f) => ({
                              ...f,
                              paymentAmount: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={
                          !paymentForm.paymentDate ||
                          !paymentForm.paymentAmount ||
                          paymentMutation.isPending
                        }
                        onClick={() =>
                          paymentMutation.mutate({
                            paymentDate: paymentForm.paymentDate,
                            paymentCheckNumber:
                              paymentForm.paymentCheckNumber || undefined,
                            paymentAmount: paymentForm.paymentAmount,
                          })
                        }
                      >
                        {paymentMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPaymentForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3: EoB Service Line Details ── */}
      {hasEobData && claim.serviceLineItems && claim.serviceLineItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck className="h-5 w-5" />
              EoB Service Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Codes</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Saved</TableHead>
                  <TableHead className="text-right">Allowed</TableHead>
                  <TableHead className="text-right">Plan Paid</TableHead>
                  <TableHead className="text-right">Deductible</TableHead>
                  <TableHead className="text-right">Copay</TableHead>
                  <TableHead className="text-right">Coinsurance</TableHead>
                  <TableHead className="text-right">Not Covered</TableHead>
                  <TableHead className="text-right">You Owe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claim.serviceLineItems.map((svc) => (
                  <TableRow key={svc.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(svc.dateOfService)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-center">
                      {svc.processingCodes?.length
                        ? svc.processingCodes.join(", ")
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(svc.billedAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.amountSaved != null
                        ? formatCurrency(svc.amountSaved)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.allowedAmount != null
                        ? formatCurrency(svc.allowedAmount)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.planPaid != null
                        ? formatCurrency(svc.planPaid)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.deductibleApplied != null
                        ? formatCurrency(svc.deductibleApplied)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.copay != null
                        ? formatCurrency(svc.copay)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.coinsurance != null
                        ? formatCurrency(svc.coinsurance)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {svc.planDoesNotCover != null
                        ? formatCurrency(svc.planDoesNotCover)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {svc.amountOwed != null
                        ? formatCurrency(svc.amountOwed)
                        : "\u2014"}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(
                      claim.serviceLineItems
                        .reduce((s, v) => s + Number(v.billedAmount || 0), 0)
                        .toFixed(2),
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.amountSaved != null
                      ? formatCurrency(claim.amountSaved)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.allowedAmount != null
                      ? formatCurrency(claim.allowedAmount)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.insurancePaid != null
                      ? formatCurrency(claim.insurancePaid)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.deductibleApplied != null
                      ? formatCurrency(claim.deductibleApplied)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.copay != null
                      ? formatCurrency(claim.copay)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.coinsurance != null
                      ? formatCurrency(claim.coinsurance)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.planDoesNotCover != null
                      ? formatCurrency(claim.planDoesNotCover)
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {claim.patientResponsibility != null
                      ? formatCurrency(claim.patientResponsibility)
                      : "\u2014"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Section 4: Linked Services ── */}
      {claim.serviceLineItems &&
        claim.serviceLineItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <List className="h-5 w-5" />
                Linked Services ({claim.serviceLineItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>CPT</TableHead>
                    <TableHead>Mod</TableHead>
                    <TableHead>POS</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Clinician</TableHead>
                    <TableHead>Dx</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claim.serviceLineItems.map((svc) => (
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
                      <TableCell className="font-mono text-sm">
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
                      <TableCell className="text-right">
                        {svc.units ?? 1}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(svc.billedAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

      {/* ── Section 5: History ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsList.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              No history recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {eventsList.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-4 rounded-lg border p-4"
                >
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {getEventLabel(event.eventType)}
                        {event.previousStatus && event.newStatus && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            {getStatusLabel(event.previousStatus as any)}{" "}
                            <ArrowRight className="inline h-3 w-3" />{" "}
                            {getStatusLabel(event.newStatus as any)}
                          </span>
                        )}
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {formatDate(event.createdAt, "MMM d, yyyy h:mm a")}
                      </time>
                    </div>
                    {event.description && (
                      <p className="text-sm text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                    {event.source && event.source !== "manual" && (
                      <p className="text-xs text-muted-foreground/60">
                        Source: {event.source}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
