import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Check,
  AlertTriangle,
  XCircle,
  Info,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { reconciliationReportsApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";

export function ReconciliationReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: report, isLoading } = useQuery({
    queryKey: ["reconciliation-report", id],
    queryFn: () => reconciliationReportsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-lg font-medium">Report not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/reconciliation-reports")}
        >
          Back to Reports
        </Button>
      </div>
    );
  }

  const summary = (report as any).summary || {};
  const items = [...((report as any).items || [])].sort((a: any, b: any) => {
    const dateA = a.invoiceLine?.date || a.systemService?.date || "";
    const dateB = b.invoiceLine?.date || b.systemService?.date || "";
    return dateA.localeCompare(dateB);
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "matched":
        return <Check className="h-4 w-4 text-green-600" />;
      case "discrepancy":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "missing_from_system":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "missing_from_invoice":
        return <Info className="h-4 w-4 text-blue-600" />;
      case "cancellation_fee":
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "matched":
        return "Matched";
      case "discrepancy":
        return "Discrepancy";
      case "missing_from_system":
        return "Missing from System";
      case "missing_from_invoice":
        return "Missing from Invoice";
      case "cancellation_fee":
        return "Cancellation Fee";
      default:
        return status;
    }
  };

  const rowBg = (status: string) => {
    switch (status) {
      case "discrepancy":
        return "bg-yellow-50 dark:bg-yellow-950/20";
      case "missing_from_system":
        return "bg-red-50 dark:bg-red-950/20";
      case "missing_from_invoice":
        return "bg-blue-50 dark:bg-blue-950/20";
      case "cancellation_fee":
        return "bg-gray-50 dark:bg-gray-950/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => navigate("/reconciliation-reports")}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Reconciliation Report</CardTitle>
          <CardDescription>
            {(report as any).clinic} · {(report as any).patient} ·{" "}
            {formatDate((report as any).billingPeriodStart)} –{" "}
            {formatDate((report as any).billingPeriodEnd)}
            {(report as any).fileName && (
              <span className="ml-2 text-xs">({(report as any).fileName})</span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-600">
              {summary.matched}
            </div>
            <p className="text-xs text-muted-foreground">Matched</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {(summary.discrepancies || 0) + (summary.missingFromSystem || 0) + (summary.missingFromInvoice || 0) + (summary.cancellationFees || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Discrepancies</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-red-600">
              {summary.missingFromSystem}
            </div>
            <p className="text-xs text-muted-foreground">Missing from System</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary.missingFromInvoice}
            </div>
            <p className="text-xs text-muted-foreground">
              Missing from Invoice
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-gray-500">
              {summary.cancellationFees}
            </div>
            <p className="text-xs text-muted-foreground">Cancellation Fees</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Invoice Billed</p>
              <p className="text-xl font-bold">
                {formatCurrency(summary.totalInvoiceBilled)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">System Billed</p>
              <p className="text-xl font-bold">
                {formatCurrency(summary.totalSystemBilled)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Difference</p>
              <p
                className={`text-xl font-bold ${
                  parseFloat(summary.difference) !== 0
                    ? "text-yellow-600"
                    : "text-green-600"
                }`}
              >
                {formatCurrency(summary.difference)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>CPT</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Clinician</TableHead>
                  <TableHead className="text-right">Invoice</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: any, i: number) => {
                  const invoiceAmt = parseFloat(
                    item.invoiceLine?.billedAmount || "0",
                  );
                  const systemAmt = parseFloat(
                    item.systemService?.billedAmount || "0",
                  );
                  const diff =
                    item.invoiceLine && item.systemService
                      ? (invoiceAmt - systemAmt).toFixed(2)
                      : null;
                  return (
                    <TableRow key={i} className={rowBg(item.status)}>
                      <TableCell className="text-center text-muted-foreground text-xs">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {statusIcon(item.status)}
                          <span className="text-xs">
                            {statusLabel(item.status)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(
                          item.invoiceLine?.date ||
                            item.systemService?.date ||
                            "",
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {item.invoiceLine?.cptCode ||
                          item.systemService?.cptCode ||
                          "—"}
                        {(item.invoiceLine?.cptModifier ||
                          item.systemService?.cptModifier) &&
                          ` +${
                            item.invoiceLine?.cptModifier ||
                            item.systemService?.cptModifier
                          }`}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {item.invoiceLine?.description || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.invoiceLine?.clinician ||
                          item.systemService?.clinician ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.invoiceLine
                          ? formatCurrency(item.invoiceLine.billedAmount)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.systemService
                          ? formatCurrency(item.systemService.billedAmount)
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          diff && parseFloat(diff) !== 0
                            ? "text-yellow-600 font-medium"
                            : ""
                        }`}
                      >
                        {diff !== null ? formatCurrency(diff) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[300px] whitespace-normal break-words">
                        {item.note || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
