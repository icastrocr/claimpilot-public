import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";

// Pages
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ClaimsListPage } from "@/pages/ClaimsListPage";
import { ClaimCreatePage } from "@/pages/ClaimCreatePage";
import { ClaimDetailPage } from "@/pages/ClaimDetailPage";
import { ServicesPage } from "@/pages/ServicesPage";
import { InsuranceProvidersPage } from "@/pages/InsuranceProvidersPage";
import { ClinicProvidersPage } from "@/pages/ClinicProvidersPage";
import { DependentsPage } from "@/pages/DependentsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { CsvImportPage } from "@/pages/CsvImportPage";
import { DocumentUploadPage } from "@/pages/DocumentUploadPage";
import { ReconciliationReportsPage } from "@/pages/ReconciliationReportsPage";
import { ReconciliationReportDetailPage } from "@/pages/ReconciliationReportDetailPage";
import { ClaimGroupingPage } from "@/pages/ClaimGroupingPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes with layout */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/claims" element={<ClaimsListPage />} />
        <Route path="/claims/generate" element={<ClaimGroupingPage />} />
        <Route path="/claims/new" element={<ClaimCreatePage />} />
        <Route path="/claims/:id" element={<ClaimDetailPage />} />
        <Route path="/admin/insurance" element={<InsuranceProvidersPage />} />
        <Route path="/admin/providers" element={<ClinicProvidersPage />} />
        <Route path="/admin/dependents" element={<DependentsPage />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="/import/csv" element={<CsvImportPage />} />
        <Route path="/import/documents" element={<DocumentUploadPage />} />
        <Route path="/reconciliation-reports" element={<ReconciliationReportsPage />} />
        <Route path="/reconciliation-reports/:id" element={<ReconciliationReportDetailPage />} />
      </Route>

      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
