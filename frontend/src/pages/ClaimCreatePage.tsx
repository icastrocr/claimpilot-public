import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  claimsApi,
  insuranceProvidersApi,
  clinicProvidersApi,
  dependentsApi,
} from "@/lib/api";
import { toast } from "@/components/ui/toast";

export function ClaimCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    dependentId: "",
    insuranceProviderId: "",
    clinicId: "",
    clinicianId: "",
    dateOfService: "",
    diagnosisCodes: "",
    cptCode: "",
    billedAmount: "",
    notes: "",
  });

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
    queryKey: ["clinicians", form.clinicId],
    queryFn: () => clinicProvidersApi.listClinicians(form.clinicId),
    enabled: !!form.clinicId,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => claimsApi.create(data),
    onSuccess: (result) => {
      toast({
        title: "Claim created",
        description: `Claim ${result.claimNumber ?? ""} has been created.`,
      });
      navigate(`/claims/${result.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.response?.data?.message || "Failed to create claim",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      dependentId: form.dependentId || undefined,
      insuranceProviderId: form.insuranceProviderId || undefined,
      clinicId: form.clinicId || undefined,
      clinicianId: form.clinicianId || undefined,
      dateOfService: form.dateOfService,
      diagnosisCodes: form.diagnosisCodes
        ? form.diagnosisCodes.split(",").map((s) => s.trim())
        : [],
      cptCode: form.cptCode,
      billedAmount: parseFloat(form.billedAmount),
      notes: form.notes || undefined,
    });
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Claim</h1>
        <p className="text-muted-foreground">
          Submit a new insurance claim.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Patient & Insurance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Patient & Insurance</CardTitle>
              <CardDescription>
                Select the patient and insurance information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Patient / Dependent</Label>
                <Select
                  value={form.dependentId}
                  onValueChange={(v) => update("dependentId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {(dependents ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.firstName} {d.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Insurance Provider</Label>
                <Select
                  value={form.insuranceProviderId}
                  onValueChange={(v) => update("insuranceProviderId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select insurance" />
                  </SelectTrigger>
                  <SelectContent>
                    {(insuranceProviders ?? []).map((ip) => (
                      <SelectItem key={ip.id} value={ip.id}>
                        {ip.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Provider */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Provider</CardTitle>
              <CardDescription>
                Select the clinic and clinician.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Clinic / Organization</Label>
                <Select
                  value={form.clinicId}
                  onValueChange={(v) => {
                    update("clinicId", v);
                    update("clinicianId", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clinics ?? []).map((co) => (
                      <SelectItem key={co.id} value={co.id}>
                        {co.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Clinician (optional)</Label>
                <Select
                  value={form.clinicianId}
                  onValueChange={(v) => update("clinicianId", v)}
                  disabled={!form.clinicId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select clinician" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clinicians ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Claim details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Claim Details</CardTitle>
              <CardDescription>
                Enter the service and billing information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Service Date</Label>
                  <Input
                    type="date"
                    value={form.dateOfService}
                    onChange={(e) => update("dateOfService", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Diagnosis Codes</Label>
                  <Input
                    placeholder="e.g. F41.1, F32.1"
                    value={form.diagnosisCodes}
                    onChange={(e) => update("diagnosisCodes", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPT Code</Label>
                  <Input
                    placeholder="e.g. 90837"
                    value={form.cptCode}
                    onChange={(e) => update("cptCode", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Billed Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.billedAmount}
                    onChange={(e) => update("billedAmount", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 flex gap-4">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create Claim"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/claims")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
