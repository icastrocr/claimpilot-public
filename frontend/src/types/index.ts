export type ClaimStatus =
  | "draft"
  | "submitted"
  | "received"
  | "processing"
  | "resolved"
  | "paid"
  | "closed"
  | "denied"
  | "reprocessing_requested"
  | "reprocessing"
  | "reprocessed"
  | "appealed"
  | "write_off";

export interface User {
  id: string;
  handle: string;
  email: string;
}

export interface InsuranceProvider {
  id: string;
  userId: string;
  name: string;
  planType?: string;
  policyNumber?: string;
  groupNumber?: string;
  claimsAddress?: string;
  claimsPhone?: string;
  portalUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Clinician {
  id: string;
  userId: string;
  clinicId: string;
  name: string;
  credential?: string;
  licenseNumber?: string;
  npi?: string;
  specialty?: string;
  typicalCptCodes: string[];
  ratePerSession?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicOrganization {
  id: string;
  userId: string;
  name: string;
  address?: string;
  phone?: string;
  ein?: string;
  npi?: string;
  superbillFormat?: string;
  billingContact?: string;
  notes?: string;
  clinicians?: Clinician[];
  createdAt: string;
  updatedAt: string;
}

export interface Dependent {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  relationship: string;
  memberId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  userId: string;
  paymentDate: string;
  paymentMethod: string;
  checkNumber?: string;
  totalAmount: string;
  payer?: string;
  received: boolean;
  notes?: string;
}

export interface ClaimEvent {
  id: string;
  claimId: string;
  eventType: string;
  eventDate: string;
  previousStatus?: string;
  newStatus?: string;
  description?: string;
  metadataJson?: Record<string, unknown>;
  source: string;
  createdAt: string;
}

export type ServiceStatus = "unsubmitted" | "claim_ready" | "claimed";

export interface ServiceLineItem {
  id: string;
  userId: string;
  clinicId: string;
  dependentId: string;
  insuranceProviderId?: string;
  superbillId?: string;
  claimId?: string;
  clinicianId: string;
  dateOfService: string;
  cptCode: string;
  cptModifier?: string;
  units: number;
  placeOfService?: string;
  diagnosisCodes: string[];
  description?: string;
  billedAmount: string;
  amountPaid?: string;
  allowedAmount?: string;
  amountSaved?: string;
  planPaid?: string;
  deductibleApplied?: string;
  copay?: string;
  coinsurance?: string;
  planDoesNotCover?: string;
  amountOwed?: string;
  processingCodes?: string[];
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
  clinician?: Clinician;
  clinic?: ClinicOrganization;
  insuranceProvider?: InsuranceProvider;
  dependent?: Dependent;
  claim?: { id: string; claimNumber?: string; status: string };
}

export interface Claim {
  id: string;
  userId: string;
  insuranceProviderId: string;
  clinicId: string;
  dependentId: string;
  claimNumber?: string;
  patientAccountNumber?: string;
  claimPart?: string;
  paymentDate?: string;
  paymentCheckNumber?: string;
  paymentAmount?: string;
  dateSubmitted?: string;
  servicePeriodStart?: string;
  servicePeriodEnd?: string;
  totalBilled?: string;
  allowedAmount?: string;
  amountSaved?: string;
  insurancePaid?: string;
  patientResponsibility?: string;
  deductibleApplied?: string;
  copay?: string;
  coinsurance?: string;
  planDoesNotCover?: string;
  claimProcessingCodes: string[];
  status: ClaimStatus;
  statusDetail?: string;
  submissionMethod?: string;
  advocateAction?: string;
  advocateComments?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  insuranceProvider?: InsuranceProvider;
  clinic?: ClinicOrganization;
  dependent?: Dependent;
  claimEvents?: ClaimEvent[];
  serviceLineItems?: ServiceLineItem[];
  _count?: { serviceLineItems: number };
}

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ClaimFilters {
  status?: ClaimStatus;
  insuranceProviderId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ServiceFilters {
  status?: ServiceStatus;
  clinicianId?: string;
  insuranceProviderId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ── Claim Grouping ──────────────────────────────────

export interface ClaimGroupValidationIssue {
  field: string;
  message: string;
  entityType: string;
  entityId: string;
  entityName?: string;
}

export interface ClaimGroupService {
  id: string;
  dateOfService: string;
  cptCode: string;
  cptModifier?: string | null;
  units: number;
  placeOfService?: string | null;
  diagnosisCodes: string[];
  billedAmount: string;
  description?: string | null;
}

export interface ClaimGroup {
  key: string;
  dependent: { id: string; firstName: string; lastName: string; memberId: string | null; dateOfBirth: string };
  clinician: { id: string; name: string; npi: string | null; credential: string | null };
  clinic: { id: string; name: string; npi: string | null; ein: string | null };
  services: ClaimGroupService[];
  servicePeriod: { start: string; end: string };
  totalBilled: string;
  lineCount: number;
  validationIssues: ClaimGroupValidationIssue[];
  isValid: boolean;
}

export interface ClaimGroupingPreview {
  groups: ClaimGroup[];
  summary: {
    totalGroups: number;
    totalServices: number;
    validGroups: number;
    invalidGroups: number;
    totalBilled: string;
  };
}

export interface ClaimGroupingFilters {
  serviceIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  clinicianId?: string;
  clinicId?: string;
  dependentId?: string;
}

export interface ClaimGenerateRequest extends ClaimGroupingFilters {
  insuranceAssignments: Record<string, string>; // groupKey → insuranceProviderId
}

export interface ClaimGenerateResult {
  created: Array<{
    claimId: string;
    claimPart: string | null;
    serviceCount: number;
    totalBilled: string;
    patient: string;
    clinician: string;
    insuranceProvider: string;
  }>;
  skipped: Array<{
    patient: string;
    clinician: string;
    serviceCount: number;
    issues: ClaimGroupValidationIssue[];
  }>;
  summary: {
    claimsCreated: number;
    servicesLinked: number;
    groupsSkipped: number;
    totalBilled: string;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  handle: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
}
