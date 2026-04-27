import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Receipt,
  Check,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import {
  documentApi,
  insuranceProvidersApi,
  clinicProvidersApi,
  dependentsApi,
} from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/utils";

type Step = "upload" | "extracting" | "preview" | "confirming" | "done" | "reconciling" | "report";
type DocType = "superbill" | "invoice" | "eob";

export function DocumentUploadPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [docType, setDocType] = useState<DocType>("superbill");
  const [file, setFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  // Mapping selections
  const [insuranceProviderId, setInsuranceProviderId] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [dependentId, setDependentId] = useState("");
  // clinicianId per service line (for superbill)
  const [clinicianMap, setClinicianMap] = useState<Record<number, string>>({});
  // editable service data
  const [editedServices, setEditedServices] = useState<any[]>([]);
  // reconciliation report
  const [reconciliationReport, setReconciliationReport] = useState<any>(null);

  // Fetch reference data
  const { data: insuranceProviders } = useQuery({
    queryKey: ["insurance-providers"],
    queryFn: () => insuranceProvidersApi.list(),
  });
  const { data: clinics } = useQuery({
    queryKey: ["clinic-providers"],
    queryFn: () => clinicProvidersApi.list(),
  });
  const { data: dependents } = useQuery({
    queryKey: ["dependents"],
    queryFn: () => dependentsApi.list(),
  });
  const { data: clinicians } = useQuery({
    queryKey: ["clinicians", clinicId],
    queryFn: () => clinicProvidersApi.listClinicians(clinicId),
    enabled: !!clinicId,
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  // Extract mutation
  const extractMutation = useMutation({
    mutationFn: () => documentApi.extract(file!, docType),
    onSuccess: (data) => {
      setExtracted(data.extracted);
      // For invoice, skip preview and go straight to reconciliation
      if (docType === "invoice") {
        setStep("reconciling");
        return;
      }
      // Initialize editable services
      if (docType === "superbill" && data.extracted.services) {
        setEditedServices(data.extracted.services.map((s: any, i: number) => ({
          ...s,
          _index: i,
          _included: true,
        })));
      } else if (docType === "eob" && data.extracted.claims) {
        // Flatten EoB claims into service lines
        const lines: any[] = [];
        for (const claim of data.extracted.claims) {
          for (const svc of claim.services || []) {
            lines.push({
              ...svc,
              claimNumber: claim.claimNumber,
              patientAccountNumber: claim.patientAccountNumber,
              provider: claim.provider,
              networkStatus: claim.networkStatus,
              _included: true,
            });
          }
        }
        setEditedServices(lines);
      }
      setStep("preview");
    },
    onError: (err: any) => {
      toast({
        title: "Extraction failed",
        description:
          err.response?.data?.message || "Could not extract data from PDF",
        variant: "destructive",
      });
      setStep("upload");
    },
  });

  // Confirm superbill
  const confirmSuperbillMutation = useMutation({
    mutationFn: () => {
      const services = editedServices
        .filter((s) => s._included)
        .map((s) => ({
          dateOfService: s.dateOfService,
          cptCode: s.cptCode,
          cptModifier: s.cptModifier || null,
          clinician: s.clinician || null, // name string — backend will find/create
          clinicianId: clinicianMap[s._index] || undefined, // override if manually selected
          diagnosisCodes: s.diagnosisCodes || [],
          placeOfService: s.placeOfService || null,
          units: s.units || 1,
          billedAmount: s.billedAmount,
          description: s.description || null,
        }));
      return documentApi.confirmSuperbill({
        insuranceProviderId: insuranceProviderId || undefined,
        clinicId: clinicId || undefined, // optional — auto-created from extracted data
        dependentId: dependentId || undefined, // optional — auto-created from extracted data
        extracted: extracted ? { clinic: extracted.clinic, patient: extracted.patient } : undefined,
        services,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      toast({ title: `${data.createdCount} services imported from superbill` });
    },
    onError: (err: any) => {
      toast({
        title: "Import failed",
        description: err.response?.data?.message || "Could not create services",
        variant: "destructive",
      });
      setStep("preview");
    },
  });

  // Confirm EoB — group service lines back by claimNumber
  const confirmEobMutation = useMutation({
    mutationFn: () => {
      const includedLines = editedServices.filter((s) => s._included);

      // Group by claimNumber to create one Claim per EoB claim
      const claimMap = new Map<string, any[]>();
      for (const line of includedLines) {
        const key = line.claimNumber || "unknown";
        if (!claimMap.has(key)) claimMap.set(key, []);
        claimMap.get(key)!.push(line);
      }

      const claims = Array.from(claimMap.entries()).map(([claimNumber, services]) => ({
        claimNumber: claimNumber !== "unknown" ? claimNumber : null,
        patientAccountNumber: services[0]?.patientAccountNumber || null,
        provider: services[0]?.provider || null,
        networkStatus: services[0]?.networkStatus || null,
        services: services.map((s) => ({
          dateOfService: s.dateOfService,
          providerBilled: s.providerBilled,
          planAllowedAmount: s.planAllowedAmount,
          planPaid: s.planPaid,
          deductible: s.deductible,
          copay: s.copay,
          coinsurance: s.coinsurance,
          planDoesNotCover: s.planDoesNotCover,
          amountYouOwe: s.amountYouOwe,
          amountSaved: s.amountSaved,
          claimProcessingCodes: s.claimProcessingCodes || [],
          description: s.description,
        })),
      }));

      return documentApi.confirmEob({
        claims,
        statementDate: extracted?.statementDate || undefined,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      toast({
        title: `${data.updatedCount ?? data.createdCount ?? 0} claim(s) updated with EoB data`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Import failed",
        description: err.response?.data?.message || "Could not update claims",
        variant: "destructive",
      });
      setStep("preview");
    },
  });

  // Duplicate invoice dialog state
  const [invoiceDuplicate, setInvoiceDuplicate] = useState<any>(null);

  // Reconcile invoice against existing services
  const reconcileInvoice = useCallback((force = false) => {
    if (!extracted) return;
    setStep("reconciling");
    setInvoiceDuplicate(null);
    documentApi
      .reconcileInvoice({ extracted, fileName: file?.name || null, force })
      .then((data) => {
        if (data.duplicateFound) {
          setInvoiceDuplicate(data);
          setStep("upload");
          return;
        }
        setReconciliationReport(data);
        setStep("report");
      })
      .catch((err: any) => {
        toast({
          title: "Reconciliation failed",
          description:
            err.response?.data?.message || "Could not reconcile invoice against services",
          variant: "destructive",
        });
        setStep("upload");
      });
  }, [extracted, file]);

  // Trigger reconciliation when extraction completes for invoice
  const [reconcileTriggered, setReconcileTriggered] = useState(false);
  useEffect(() => {
    if (step === "reconciling" && extracted && !invoiceDuplicate && !reconcileTriggered) {
      setReconcileTriggered(true);
      reconcileInvoice(false);
    }
  }, [step, extracted, reconcileTriggered]);

  const handleExtract = () => {
    if (!file) return;
    setStep("extracting");
    extractMutation.mutate();
  };

  const handleConfirm = () => {
    setStep("confirming");
    if (docType === "superbill") {
      confirmSuperbillMutation.mutate();
    } else {
      confirmEobMutation.mutate();
    }
  };

  const toggleService = (index: number) => {
    setEditedServices((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, _included: !s._included } : s,
      ),
    );
  };

  const removeService = (index: number) => {
    setEditedServices((prev) => prev.filter((_, i) => i !== index));
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setExtracted(null);
    setResult(null);
    setEditedServices([]);
    setClinicianMap({});
    setReconciliationReport(null);
    setInvoiceDuplicate(null);
    setReconcileTriggered(false);
  };

  const includedCount = editedServices.filter((s) => s._included).length;
  // Superbill: auto-creates clinic/patient from extracted data, so only need services
  const canConfirmSuperbill = includedCount > 0;
  const canConfirmEob = includedCount > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Documents</h1>
        <p className="text-muted-foreground">
          Upload superbills or EoBs to automatically extract and import claim
          data.
        </p>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Type</CardTitle>
              <CardDescription>
                Select the type of document you&apos;re uploading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setDocType("superbill")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    docType === "superbill"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <FileText className="h-8 w-8 mb-2 text-primary" />
                  <p className="font-semibold">Superbill</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    From your clinic — creates new services with CPT codes
                    and charges.
                  </p>
                </button>
                <button
                  onClick={() => setDocType("invoice")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    docType === "invoice"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <Receipt className="h-8 w-8 mb-2 text-orange-500" />
                  <p className="font-semibold">Invoice / Statement</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    From your clinic — reconciles against existing services to
                    find discrepancies. Import the superbill first.
                  </p>
                </button>
                <button
                  onClick={() => setDocType("eob")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    docType === "eob"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                  <p className="font-semibold">Explanation of Benefits</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    From insurance — shows how claims were processed, amounts
                    paid and owed.
                  </p>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload PDF</CardTitle>
              <CardDescription>
                Drag and drop or click to select your{" "}
                {docType === "superbill" ? "superbill" : docType === "invoice" ? "invoice" : "EoB"} PDF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                {file ? (
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : isDragActive ? (
                  <p className="text-muted-foreground">Drop the PDF here...</p>
                ) : (
                  <p className="text-muted-foreground">
                    Drag & drop a PDF here, or click to browse
                  </p>
                )}
              </div>
              {file && (
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleExtract}>
                    <FileText className="mr-2 h-4 w-4" />
                    Extract Data
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Extracting */}
      {step === "extracting" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Extracting data from PDF...</p>
            <p className="text-sm text-muted-foreground mt-1">
              AI is reading your {docType === "superbill" ? "superbill" : docType === "invoice" ? "invoice" : "EoB"}{" "}
              and extracting structured data. This may take 15–30 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview */}
      {step === "preview" && extracted && (
        <div className="space-y-6">
          {/* Document summary */}
          <Card>
            <CardHeader>
              <CardTitle>
                Extracted from{" "}
                {docType === "superbill" ? "Superbill" : "EoB"}
              </CardTitle>
              <CardDescription>
                {editedServices.length} service lines extracted.{" "}
                Review, edit, and map to your records before importing.
              </CardDescription>
            </CardHeader>
            {docType === "superbill" && extracted.clinic && (
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Clinic</span>
                    <p className="font-medium">{extracted.clinic.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Patient</span>
                    <p className="font-medium">{extracted.patient?.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">EIN</span>
                    <p className="font-medium font-mono">
                      {extracted.clinic.ein || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">NPI</span>
                    <p className="font-medium font-mono">
                      {extracted.clinic.npi || "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            )}
            {docType === "eob" && (
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Insurance</span>
                    <p className="font-medium">
                      {extracted.insuranceProvider}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Member</span>
                    <p className="font-medium">{extracted.member?.name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Member ID</span>
                    <p className="font-medium font-mono">
                      {extracted.member?.memberId || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Patient</span>
                    <p className="font-medium">{extracted.patient?.name}</p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Mapping dropdowns — required for EoB, optional overrides for superbill */}
          {docType === "eob" ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">EoB will be matched to existing draft claims</p>
                    <p className="mt-1">
                      The system will match each service line by date and clinician to your existing draft claims.
                      Make sure you've imported the superbill and generated claims first.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Auto-detected from Superbill</CardTitle>
                <CardDescription>
                  Clinic, patient, and clinicians will be automatically created or matched from the document. You can optionally link an insurance provider.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Insurance Provider (optional)</Label>
                  <Select
                    value={insuranceProviderId || "none"}
                    onValueChange={(v) => setInsuranceProviderId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select insurance (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(insuranceProviders ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Service lines table */}
          <Card>
            <CardHeader>
              <CardTitle>
                Service Lines ({includedCount} of {editedServices.length}{" "}
                included)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">✓</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>CPT</TableHead>
                      {docType === "superbill" && (
                        <>
                          <TableHead>Clinician</TableHead>
                          <TableHead>Diagnosis</TableHead>
                          <TableHead>Billed</TableHead>
                        </>
                      )}
                      {docType === "eob" && (
                        <>
                          <TableHead>Claim #</TableHead>
                          <TableHead>Billed</TableHead>
                          <TableHead>Allowed</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>You Owe</TableHead>
                          <TableHead>Codes</TableHead>
                        </>
                      )}
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedServices.map((svc, i) => (
                      <TableRow
                        key={i}
                        className={svc._included ? "" : "opacity-40"}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={svc._included}
                            onChange={() => toggleService(i)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {svc.dateOfService
                            ? formatDate(svc.dateOfService)
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {svc.cptCode || "—"}
                          {svc.cptModifier ? ` +${svc.cptModifier}` : ""}
                        </TableCell>
                        {docType === "superbill" && (
                          <>
                            <TableCell>
                              {clinicians && clinicians.length > 0 ? (
                                <Select
                                  value={
                                    clinicianMap[i] || ""
                                  }
                                  onValueChange={(v) =>
                                    setClinicianMap((m) => ({
                                      ...m,
                                      [i]: v,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue
                                      placeholder={
                                        svc.clinician || "Select"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {clinicians.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  {svc.clinician || "—"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {svc.diagnosisCodes?.join(", ") || "—"}
                            </TableCell>
                            <TableCell>
                              {svc.billedAmount
                                ? formatCurrency(svc.billedAmount)
                                : "—"}
                            </TableCell>
                          </>
                        )}
                        {docType === "eob" && (
                          <>
                            <TableCell className="font-mono text-xs">
                              {svc.claimNumber || "—"}
                            </TableCell>
                            <TableCell>
                              {formatCurrency(svc.providerBilled)}
                            </TableCell>
                            <TableCell>
                              {formatCurrency(svc.planAllowedAmount)}
                            </TableCell>
                            <TableCell className="text-green-600 dark:text-green-400">
                              {formatCurrency(svc.planPaid)}
                            </TableCell>
                            <TableCell>
                              {formatCurrency(svc.amountYouOwe)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {svc.claimProcessingCodes?.join(", ") || "—"}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeService(i)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>
              Start Over
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={
                docType === "superbill"
                  ? !canConfirmSuperbill
                  : !canConfirmEob
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {docType === "superbill"
                ? `Import ${includedCount} Services`
                : `Apply EoB to Claims`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirming */}
      {step === "confirming" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Importing data...</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Reconciling */}
      {step === "reconciling" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Reconciling invoice against services...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Matching invoice line items to your imported services.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step: Reconciliation Report */}
      {step === "report" && reconciliationReport && (() => {
        const report = reconciliationReport;
        const summary = report.summary;
        const reportItems = report.items || [];

        const statusIcon = (status: string) => {
          switch (status) {
            case "matched": return <Check className="h-4 w-4 text-green-600" />;
            case "discrepancy": return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
            case "missing_from_system": return <XCircle className="h-4 w-4 text-red-600" />;
            case "missing_from_invoice": return <Info className="h-4 w-4 text-blue-600" />;
            case "cancellation_fee": return <AlertCircle className="h-4 w-4 text-gray-500" />;
            default: return null;
          }
        };

        const statusLabel = (status: string) => {
          switch (status) {
            case "matched": return "Matched";
            case "discrepancy": return "Discrepancy";
            case "missing_from_system": return "Missing from System";
            case "missing_from_invoice": return "Missing from Invoice";
            case "cancellation_fee": return "Cancellation Fee";
            default: return status;
          }
        };

        const rowBg = (status: string) => {
          switch (status) {
            case "discrepancy": return "bg-yellow-50 dark:bg-yellow-950/20";
            case "missing_from_system": return "bg-red-50 dark:bg-red-950/20";
            case "missing_from_invoice": return "bg-blue-50 dark:bg-blue-950/20";
            case "cancellation_fee": return "bg-gray-50 dark:bg-gray-950/20";
            default: return "";
          }
        };

        return (
          <div className="space-y-6">
            {/* Header */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Reconciliation Report</CardTitle>
                <CardDescription>
                  {report.clinic} · {report.patient} ·{" "}
                  {formatDate(report.billingPeriod.start)} – {formatDate(report.billingPeriod.end)}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-green-600">{summary.matched}</div>
                  <p className="text-xs text-muted-foreground">Matched</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{summary.discrepancies}</div>
                  <p className="text-xs text-muted-foreground">Discrepancies</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-red-600">{summary.missingFromSystem}</div>
                  <p className="text-xs text-muted-foreground">Missing from System</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-blue-600">{summary.missingFromInvoice}</div>
                  <p className="text-xs text-muted-foreground">Missing from Invoice</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-gray-500">{summary.cancellationFees}</div>
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
                    <p className="text-xl font-bold">{formatCurrency(summary.totalInvoiceBilled)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">System Billed</p>
                    <p className="text-xl font-bold">{formatCurrency(summary.totalSystemBilled)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Difference</p>
                    <p className={`text-xl font-bold ${parseFloat(summary.difference) !== 0 ? "text-yellow-600" : "text-green-600"}`}>
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
                      {reportItems.map((item: any, i: number) => {
                        const invoiceAmt = parseFloat(item.invoiceLine?.billedAmount || "0");
                        const systemAmt = parseFloat(item.systemService?.billedAmount || "0");
                        const diff = item.invoiceLine && item.systemService
                          ? (invoiceAmt - systemAmt).toFixed(2)
                          : null;
                        return (
                          <TableRow key={i} className={rowBg(item.status)}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {statusIcon(item.status)}
                                <span className="text-xs">{statusLabel(item.status)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(item.invoiceLine?.date || item.systemService?.date || "")}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {item.invoiceLine?.cptCode || item.systemService?.cptCode || "—"}
                              {(item.invoiceLine?.cptModifier || item.systemService?.cptModifier)
                                ? ` +${item.invoiceLine?.cptModifier || item.systemService?.cptModifier}`
                                : ""}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">
                              {item.invoiceLine?.description || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {item.invoiceLine?.clinician || item.systemService?.clinician || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.invoiceLine ? formatCurrency(item.invoiceLine.billedAmount) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.systemService ? formatCurrency(item.systemService.billedAmount) : "—"}
                            </TableCell>
                            <TableCell className={`text-right ${diff && parseFloat(diff) !== 0 ? "text-yellow-600 font-medium" : ""}`}>
                              {diff !== null ? formatCurrency(diff) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
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

            {/* Actions */}
            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>
                Start Over
              </Button>
              <div className="flex gap-3">
                {reconciliationReport?.id && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `/reconciliation-reports/${reconciliationReport.id}`,
                      )
                    }
                  >
                    <Receipt className="mr-2 h-4 w-4" />
                    View Saved Report
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => navigate("/reconciliation-reports")}
                >
                  View All Reports
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Invoice Duplicate Dialog */}
      {invoiceDuplicate && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-lg font-semibold">Reconciliation Report Already Exists</p>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              A report for this billing period ({formatDate(invoiceDuplicate.billingPeriod?.start)} –{" "}
              {formatDate(invoiceDuplicate.billingPeriod?.end)}) was created on{" "}
              {formatDate(invoiceDuplicate.existingReportDate)}.
            </p>
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => navigate(`/reconciliation-reports/${invoiceDuplicate.existingReportId}`)}
              >
                View Existing Report
              </Button>
              <Button onClick={() => {
                setInvoiceDuplicate(null);
                reconcileInvoice(true);
              }}>
                Create New Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Done */}
      {step === "done" && result && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-semibold">Import Complete</p>
            <div className="text-sm text-muted-foreground mt-2 space-y-1 text-center">
              {result.services && (
                <>
                  {result.createdCount > 0 && <p>{result.createdCount} services imported</p>}
                  {result.skippedCount > 0 && (
                    <p className="text-yellow-600">{result.skippedCount} duplicates skipped</p>
                  )}
                  {result.createdCount === 0 && result.skippedCount > 0 && (
                    <p className="mt-1">All services already exist in the system.</p>
                  )}
                </>
              )}
              {result.claims && (
                <>
                  {result.createdCount > 0 && <p>{result.createdCount} claims created</p>}
                  {result.skippedCount > 0 && result.skippedClaims?.map((sc: any, i: number) => (
                    <p key={i} className="text-yellow-600 text-sm">
                      {sc.claimNumber ? `#${sc.claimNumber}: ` : ""}{sc.reason}
                    </p>
                  ))}
                </>
              )}
              {result.matchedServicesCount > 0 && (
                <p>{result.matchedServicesCount} services matched</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={reset}>
                Import Another
              </Button>
              <Button onClick={() => navigate(result.services ? "/services" : "/claims")}>
                {result.services ? "View Services" : "View Claims"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
