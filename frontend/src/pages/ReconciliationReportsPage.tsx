import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Trash2,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Upload,
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
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

export function ReconciliationReportsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["reconciliation-reports", page],
    queryFn: () => reconciliationReportsApi.list({ page, limit }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reconciliationReportsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-reports"] });
      toast({ title: "Report deleted" });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err.response?.data?.message || "Could not delete report",
        variant: "destructive",
      });
    },
  });

  const reports = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, totalPages: 1 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Reconciliation Reports
          </h1>
          <p className="text-muted-foreground">
            Previously generated invoice reconciliation reports.
          </p>
        </div>
        <Button onClick={() => navigate("/import/documents")}>
          <Upload className="mr-2 h-4 w-4" />
          Import Invoice
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>
            {meta.total} report{meta.total !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No reports yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Reconciliation reports are created when you upload an invoice in{" "}
                <button
                  onClick={() => navigate("/import/documents")}
                  className="text-primary underline"
                >
                  Import Documents
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-center">Matched</TableHead>
                    <TableHead className="text-center">Discrepancies</TableHead>
                    <TableHead className="text-center">Missing</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report: any) => {
                    const summary = report.summary || {};
                    return (
                      <TableRow
                        key={report.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          navigate(`/reconciliation-reports/${report.id}`)
                        }
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatDate(report.createdAt)}
                        </TableCell>
                        <TableCell>{report.clinic || "—"}</TableCell>
                        <TableCell>{report.patient || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(report.billingPeriodStart)} –{" "}
                          {formatDate(report.billingPeriodEnd)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-600 font-medium">
                            {summary.matched ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={
                              (summary.discrepancies ?? 0) > 0
                                ? "text-yellow-600 font-medium"
                                : ""
                            }
                          >
                            {summary.discrepancies ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={
                              (summary.missingFromSystem ?? 0) > 0
                                ? "text-red-600 font-medium"
                                : ""
                            }
                          >
                            {summary.missingFromSystem ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {report.fileName || "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(report.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
