import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clinicProvidersApi } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { ClinicOrganization, Clinician } from "@/types";

export function ClinicProvidersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clinicianDialogOpen, setClinicianDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicOrganization | null>(null);
  const [editingClinician, setEditingClinician] = useState<Clinician | null>(null);
  const [expandedClinicId, setExpandedClinicId] = useState<string | null>(null);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    ein: "",
    npi: "",
    address: "",
    phone: "",
    billingContact: "",
    notes: "",
  });
  const [clinicianForm, setClinicianForm] = useState({
    name: "",
    credential: "",
    licenseNumber: "",
    npi: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["clinic-providers"],
    queryFn: () => clinicProvidersApi.list(),
  });

  const providers = data ?? [];

  // Fetch clinicians for expanded clinic
  const { data: clinicians, isLoading: cliniciansLoading } = useQuery({
    queryKey: ["clinicians", expandedClinicId],
    queryFn: () => clinicProvidersApi.listClinicians(expandedClinicId!),
    enabled: !!expandedClinicId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editing
        ? clinicProvidersApi.update(editing.id, data)
        : clinicProvidersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-providers"] });
      toast({ title: editing ? "Clinic updated" : "Clinic created" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.response?.data?.message || "Operation failed",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clinicProvidersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinic-providers"] });
      toast({ title: "Clinic deleted" });
    },
  });

  const saveClinicianMutation = useMutation({
    mutationFn: (data: any) =>
      editingClinician
        ? clinicProvidersApi.updateClinician(editingClinician.id, data)
        : clinicProvidersApi.createClinician(selectedClinicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicians", expandedClinicId] });
      toast({ title: editingClinician ? "Clinician updated" : "Clinician added" });
      closeClinicianDialog();
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.response?.data?.message || "Operation failed",
        variant: "destructive",
      });
    },
  });

  const deleteClinicianMutation = useMutation({
    mutationFn: (id: string) => clinicProvidersApi.deleteClinician(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicians", expandedClinicId] });
      toast({ title: "Clinician removed" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", ein: "", npi: "", address: "", phone: "", billingContact: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (provider: ClinicOrganization, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(provider);
    setForm({
      name: provider.name,
      ein: provider.ein || "",
      npi: provider.npi || "",
      address: provider.address || "",
      phone: provider.phone || "",
      billingContact: provider.billingContact || "",
      notes: provider.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const openCreateClinician = (clinicId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClinicId(clinicId);
    setEditingClinician(null);
    setClinicianForm({ name: "", credential: "", licenseNumber: "", npi: "" });
    setClinicianDialogOpen(true);
  };

  const openEditClinician = (clinician: Clinician) => {
    setEditingClinician(clinician);
    setSelectedClinicId(clinician.clinicId);
    setClinicianForm({
      name: clinician.name,
      credential: clinician.credential || "",
      licenseNumber: clinician.licenseNumber || "",
      npi: clinician.npi || "",
    });
    setClinicianDialogOpen(true);
  };

  const closeClinicianDialog = () => {
    setClinicianDialogOpen(false);
    setEditingClinician(null);
  };

  const toggleExpand = (clinicId: string) => {
    setExpandedClinicId((prev) => (prev === clinicId ? null : clinicId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const handleClinicianSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveClinicianMutation.mutate(clinicianForm);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Clinic Providers
          </h1>
          <p className="text-muted-foreground">
            Manage clinic organizations and their clinicians.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Clinic
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>EIN</TableHead>
                <TableHead>NPI</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : providers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No clinic providers found.
                  </TableCell>
                </TableRow>
              ) : (
                providers.map((provider) => (
                  <>
                    <TableRow
                      key={provider.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleExpand(provider.id)}
                    >
                      <TableCell className="w-8">
                        {expandedClinicId === provider.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{provider.name}</TableCell>
                      <TableCell className="font-mono text-sm">{provider.ein || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{provider.npi || "-"}</TableCell>
                      <TableCell>{provider.phone || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={(e) => openEdit(provider, e)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(provider.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded clinician rows */}
                    {expandedClinicId === provider.id && (
                      <TableRow key={`${provider.id}-clinicians`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="px-8 py-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <UserRound className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">Clinicians</span>
                              </div>
                              <Button size="sm" variant="outline" onClick={(e) => openCreateClinician(provider.id, e)}>
                                <Plus className="mr-1 h-3 w-3" />
                                Add Clinician
                              </Button>
                            </div>
                            {cliniciansLoading ? (
                              <p className="text-sm text-muted-foreground py-2">Loading clinicians...</p>
                            ) : !clinicians || clinicians.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">No clinicians yet. Add one to get started.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Credential</TableHead>
                                    <TableHead>License #</TableHead>
                                    <TableHead>NPI</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {clinicians.map((clinician) => (
                                    <TableRow
                                      key={clinician.id}
                                      className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => openEditClinician(clinician)}
                                    >
                                      <TableCell className="font-medium">{clinician.name}</TableCell>
                                      <TableCell>{clinician.credential || "-"}</TableCell>
                                      <TableCell className="font-mono text-sm">{clinician.licenseNumber || "-"}</TableCell>
                                      <TableCell className="font-mono text-sm">{clinician.npi || "-"}</TableCell>
                                      <TableCell>
                                        <Badge variant={clinician.isActive ? "default" : "secondary"}>
                                          {clinician.isActive ? "Active" : "Inactive"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditClinician(clinician); }}>
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteClinicianMutation.mutate(clinician.id); }}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Clinic Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Clinic" : "Add Clinic"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the clinic details."
                : "Enter the details for the new clinic."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>EIN</Label>
                <Input value={form.ein} onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>NPI</Label>
                <Input value={form.npi} onChange={(e) => setForm((f) => ({ ...f, npi: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Billing Contact</Label>
              <Input value={form.billingContact} onChange={(e) => setForm((f) => ({ ...f, billingContact: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Clinician Dialog */}
      <Dialog open={clinicianDialogOpen} onOpenChange={setClinicianDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClinician ? "Edit Clinician" : "Add Clinician"}</DialogTitle>
            <DialogDescription>
              {editingClinician
                ? "Update the clinician details."
                : "Enter the details for the new clinician."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleClinicianSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={clinicianForm.name} onChange={(e) => setClinicianForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Credential</Label>
              <Input value={clinicianForm.credential} onChange={(e) => setClinicianForm((f) => ({ ...f, credential: e.target.value }))} placeholder="e.g. LCSW, PhD, LMHC" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>NPI</Label>
                <Input value={clinicianForm.npi} onChange={(e) => setClinicianForm((f) => ({ ...f, npi: e.target.value }))} placeholder="10-digit NPI" />
              </div>
              <div className="space-y-2">
                <Label>License Number</Label>
                <Input value={clinicianForm.licenseNumber} onChange={(e) => setClinicianForm((f) => ({ ...f, licenseNumber: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeClinicianDialog}>Cancel</Button>
              <Button type="submit" disabled={saveClinicianMutation.isPending}>
                {saveClinicianMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
