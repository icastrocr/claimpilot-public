import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { claimsApi, servicesApi } from "@/lib/api";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import type { Claim, ClaimStatus } from "@/types";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

function StatCard({ title, value, subtitle, icon, onClick }: StatCardProps) {
  return (
    <Card
      className={onClick ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const { data: claimsData } = useQuery({
    queryKey: ["claims", { limit: 100 }],
    queryFn: () => claimsApi.list({ limit: 100 }),
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services", { limit: 100 }],
    queryFn: () => servicesApi.list({ limit: 100 }),
  });

  const claims = claimsData?.data ?? [];
  const services = servicesData?.data ?? [];

  const stats = {
    total: claims.length,
    totalServices: services.length,
    unsubmittedServices: services.filter((s) => s.status === "unsubmitted").length,
    submitted: claims.filter((c) => c.status === "submitted").length,
    resolved: claims.filter((c) => c.status === "resolved").length,
    denied: claims.filter((c) => c.status === "denied").length,
    closed: claims.filter((c) => c.status === "closed").length,
    totalBilled: services.reduce((sum, s) => sum + (parseFloat(s.billedAmount as any) || 0), 0),
    totalPaid: claims.reduce((sum, c) => sum + (parseFloat(c.insurancePaid as any) || 0), 0),
  };

  const recentClaims = [...claims]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your claims management activity.
        </p>
      </div>

      {/* Row 1: Services + Claims stat tiles */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          title="Services"
          value={stats.totalServices}
          subtitle={stats.unsubmittedServices > 0 ? `${stats.unsubmittedServices} unsubmitted` : undefined}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          onClick={() => navigate("/services")}
        />
        <StatCard
          title="Total Claims"
          value={stats.total}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          onClick={() => navigate("/claims")}
        />
        <StatCard
          title="Submitted"
          value={stats.submitted}
          icon={<Clock className="h-4 w-4 text-yellow-500" />}
          onClick={() => navigate("/claims?status=submitted")}
        />
        <StatCard
          title="Resolved"
          value={stats.resolved}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          onClick={() => navigate("/claims?status=resolved")}
        />
        <StatCard
          title="Denied"
          value={stats.denied}
          subtitle={
            stats.total > 0
              ? `${Math.round((stats.denied / stats.total) * 100)}% denial rate`
              : undefined
          }
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          onClick={() => navigate("/claims?status=denied")}
        />
        <StatCard
          title="Closed"
          value={stats.closed}
          icon={<AlertCircle className="h-4 w-4 text-slate-500" />}
          onClick={() => navigate("/claims?status=closed")}
        />
      </div>

      {/* Row 2: Financial summary (no drill-down) */}
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          title="Total Billed"
          value={formatCurrency(stats.totalBilled)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Paid"
          value={formatCurrency(stats.totalPaid)}
          subtitle={
            stats.totalBilled > 0
              ? `${Math.round((stats.totalPaid / stats.totalBilled) * 100)}% of billed amount`
              : "No claims yet"
          }
          icon={<DollarSign className="h-4 w-4 text-green-500" />}
        />
      </div>

      {/* Recent claims */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Claims</CardTitle>
          <CardDescription>Latest claims submitted to the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentClaims.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No claims yet. Create your first claim to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {recentClaims.map((claim: Claim) => (
                <div
                  key={claim.id}
                  onClick={() => navigate(`/claims/${claim.id}`)}
                  className="flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{claim.claimNumber || "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {claim.dependent
                        ? `${claim.dependent.firstName} ${claim.dependent.lastName}`
                        : "Unknown patient"}
                      {claim.servicePeriodStart && (
                        <> &middot; {formatDate(claim.servicePeriodStart)}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {claim.totalBilled != null
                        ? formatCurrency(claim.totalBilled)
                        : "—"}
                    </span>
                    <Badge className={getStatusColor(claim.status)}>
                      {getStatusLabel(claim.status)}
                    </Badge>
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
