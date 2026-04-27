import axios from "axios";
import type {
  User,
  LoginCredentials,
  RegisterData,
  Claim,
  ClaimEvent,
  ClaimFilters,
  ServiceLineItem,
  ServiceFilters,
  InsuranceProvider,
  ClinicOrganization,
  Clinician,
  Dependent,
  ClaimGroupingFilters,
  ClaimGroupingPreview,
  ClaimGenerateResult,
  ClaimGenerateRequest,
} from "@/types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

// Auth token interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
// Backend envelope: { data: { user, accessToken, refreshToken } }
// After axios unwrap (r.data), we get the envelope, then extract .data
export const authApi = {
  login: (data: LoginCredentials) =>
    api.post("/auth/login", data).then((r) => r.data.data as { user: User; accessToken: string; refreshToken: string }),

  register: (data: RegisterData) =>
    api.post("/auth/register", data).then((r) => r.data.data as { user: User; accessToken: string; refreshToken: string }),

  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refreshToken }).then((r) => r.data.data as { accessToken: string; refreshToken: string }),
};

// Helper: unwrap backend envelope { data: T } -> T
const unwrap = <T>(r: { data: { data: T } }): T => r.data.data;

// --- Claims ---
export const claimsApi = {
  list: (filters?: ClaimFilters) =>
    api.get("/claims", { params: filters }).then((r) => r.data as { data: Claim[]; meta: { total: number; page: number; limit: number; totalPages: number } }),

  get: (id: string) =>
    api.get(`/claims/${id}`).then((r) => unwrap<Claim>(r)),

  create: (data: Partial<Claim>) =>
    api.post("/claims", data).then((r) => unwrap<Claim>(r)),

  update: (id: string, data: Partial<Claim>) =>
    api.put(`/claims/${id}`, data).then((r) => unwrap<Claim>(r)),

  delete: (id: string) =>
    api.delete(`/claims/${id}`).then((r) => r.data),

  getEvents: (id: string) =>
    api.get(`/claims/${id}/events`).then((r) => unwrap<ClaimEvent[]>(r)),

  addEvent: (id: string, data: Partial<ClaimEvent>) =>
    api.post(`/claims/${id}/events`, data).then((r) => unwrap<ClaimEvent>(r)),

  recordPayment: (id: string, data: { paymentDate: string; paymentCheckNumber?: string; paymentAmount: string }) =>
    api.put(`/claims/${id}/payment`, data).then((r) => unwrap<Claim>(r)),
};

// --- Services ---
export const servicesApi = {
  list: (filters?: ServiceFilters) =>
    api.get("/services", { params: filters }).then((r) => r.data as { data: ServiceLineItem[]; meta: { total: number; page: number; limit: number; totalPages: number } }),

  get: (id: string) =>
    api.get(`/services/${id}`).then((r) => unwrap<ServiceLineItem>(r)),

  create: (data: Partial<ServiceLineItem>) =>
    api.post("/services", data).then((r) => unwrap<ServiceLineItem>(r)),

  update: (id: string, data: Partial<ServiceLineItem>) =>
    api.put(`/services/${id}`, data).then((r) => unwrap<ServiceLineItem>(r)),

  delete: (id: string) =>
    api.delete(`/services/${id}`).then((r) => r.data),

  // markSubmitted removed — services transition via Generate Claims
};

// --- Insurance Providers ---
export const insuranceProvidersApi = {
  list: () =>
    api.get("/insurance-providers").then((r) => unwrap<InsuranceProvider[]>(r)),

  get: (id: string) =>
    api.get(`/insurance-providers/${id}`).then((r) => unwrap<InsuranceProvider>(r)),

  create: (data: Partial<InsuranceProvider>) =>
    api.post("/insurance-providers", data).then((r) => unwrap<InsuranceProvider>(r)),

  update: (id: string, data: Partial<InsuranceProvider>) =>
    api.put(`/insurance-providers/${id}`, data).then((r) => unwrap<InsuranceProvider>(r)),

  delete: (id: string) =>
    api.delete(`/insurance-providers/${id}`).then((r) => r.data),
};

// --- Clinic Providers ---
export const clinicProvidersApi = {
  list: () =>
    api.get("/clinic-providers").then((r) => unwrap<ClinicOrganization[]>(r)),

  get: (id: string) =>
    api.get(`/clinic-providers/${id}`).then((r) => unwrap<ClinicOrganization>(r)),

  create: (data: Partial<ClinicOrganization>) =>
    api.post("/clinic-providers", data).then((r) => unwrap<ClinicOrganization>(r)),

  update: (id: string, data: Partial<ClinicOrganization>) =>
    api.put(`/clinic-providers/${id}`, data).then((r) => unwrap<ClinicOrganization>(r)),

  delete: (id: string) =>
    api.delete(`/clinic-providers/${id}`).then((r) => r.data),

  listClinicians: (orgId: string) =>
    api.get(`/clinic-providers/${orgId}/clinicians`).then((r) => unwrap<Clinician[]>(r)),

  createClinician: (orgId: string, data: Partial<Clinician>) =>
    api.post(`/clinic-providers/${orgId}/clinicians`, data).then((r) => unwrap<Clinician>(r)),

  updateClinician: (clinicianId: string, data: Partial<Clinician>) =>
    api.put(`/clinic-providers/clinicians/${clinicianId}`, data).then((r) => unwrap<Clinician>(r)),

  deleteClinician: (clinicianId: string) =>
    api.delete(`/clinic-providers/clinicians/${clinicianId}`).then((r) => r.data),
};

// --- Dependents ---
export const dependentsApi = {
  list: () =>
    api.get("/dependents").then((r) => unwrap<Dependent[]>(r)),

  get: (id: string) =>
    api.get(`/dependents/${id}`).then((r) => unwrap<Dependent>(r)),

  create: (data: Partial<Dependent>) =>
    api.post("/dependents", data).then((r) => unwrap<Dependent>(r)),

  update: (id: string, data: Partial<Dependent>) =>
    api.put(`/dependents/${id}`, data).then((r) => unwrap<Dependent>(r)),

  delete: (id: string) =>
    api.delete(`/dependents/${id}`).then((r) => r.data),
};

// --- Import ---
export const importApi = {
  csvImport: (file: File, dryRun?: boolean) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post(
        `/import/csv${dryRun ? "?dryRun=true" : ""}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      )
      .then((r) => r.data.data);
  },
};

// --- Document Upload ---
export const documentApi = {
  extract: (file: File, documentType: "superbill" | "invoice" | "eob") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);
    return api
      .post("/documents/extract", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000, // 3 min for AI extraction
      })
      .then((r) => r.data.data);
  },

  confirmSuperbill: (data: {
    insuranceProviderId?: string;
    clinicId?: string;
    dependentId?: string;
    extracted?: { clinic?: any; patient?: any };
    services: any[];
  }) => api.post("/documents/confirm-superbill", data).then((r) => r.data.data),

  confirmEob: (data: {
    claims: any[];
    statementDate?: string;
  }) => api.post("/documents/confirm-eob", data).then((r) => r.data.data),

  reconcileInvoice: (data: { extracted: any; fileName?: string | null; force?: boolean }) =>
    api.post("/documents/reconcile-invoice", data).then((r) => r.data.data),
};

// --- Reconciliation Reports ---
export const reconciliationReportsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get("/reconciliation-reports", { params }).then((r) => r.data as { data: any[]; meta: any }),

  get: (id: string) =>
    api.get(`/reconciliation-reports/${id}`).then((r) => unwrap(r)),

  delete: (id: string) =>
    api.delete(`/reconciliation-reports/${id}`).then((r) => r.data),
};

// --- Claim Grouping ---
export const claimGroupingApi = {
  preview: (filters: ClaimGroupingFilters) =>
    api.post("/claims/group-preview", filters).then((r) => unwrap<ClaimGroupingPreview>(r)),

  generate: (data: ClaimGenerateRequest) =>
    api.post("/claims/generate", data).then((r) => unwrap<ClaimGenerateResult>(r)),
};

export default api;
