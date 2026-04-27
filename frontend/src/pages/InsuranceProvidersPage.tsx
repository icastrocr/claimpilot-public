import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { insuranceProvidersApi } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { InsuranceProvider } from "@/types";

export function InsuranceProvidersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceProvider | null>(null);
  const [form, setForm] = useState({
    name: "",
    planType: "",
    policyNumber: "",
    groupNumber: "",
    claimsPhone: "",
    portalUrl: "",
    notes: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["insurance-providers"],
    queryFn: () => insuranceProvidersApi.list(),
  });

  const providers = data ?? [];

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editing
        ? insuranceProvidersApi.update(editing.id, data)
        : insuranceProvidersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insurance-providers"] });
      toast({ title: editing ? "Provider updated" : "Provider created" });
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
    mutationFn: (id: string) => insuranceProvidersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insurance-providers"] });
      toast({ title: "Provider deleted" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", planType: "", policyNumber: "", groupNumber: "", claimsPhone: "", portalUrl: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (provider: InsuranceProvider, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(provider);
    setForm({
      name: provider.name,
      planType: provider.planType || "",
      policyNumber: provider.policyNumber || "",
      groupNumber: provider.groupNumber || "",
      claimsPhone: provider.claimsPhone || "",
      portalUrl: provider.portalUrl || "",
      notes: provider.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Insurance Providers
          </h1>
          <p className="text-muted-foreground">
            Manage insurance companies and payers.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Plan Type</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead>Group #</TableHead>
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
                    No insurance providers found.
                  </TableCell>
                </TableRow>
              ) : (
                providers.map((provider) => (
                  <TableRow
                    key={provider.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(provider, { stopPropagation: () => {} } as React.MouseEvent)}
                  >
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell>{provider.planType || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{provider.policyNumber || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{provider.groupNumber || "-"}</TableCell>
                    <TableCell>{provider.claimsPhone || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => openEdit(provider, e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(provider.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Provider" : "Add Insurance Provider"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the insurance provider details."
                : "Enter the details for the new insurance provider."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Plan Type</Label>
              <Input
                value={form.planType}
                onChange={(e) => setForm((f) => ({ ...f, planType: e.target.value }))}
                placeholder="e.g. PPO, HMO"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Policy Number</Label>
                <Input
                  value={form.policyNumber}
                  onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Group Number</Label>
                <Input
                  value={form.groupNumber}
                  onChange={(e) => setForm((f) => ({ ...f, groupNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Claims Phone</Label>
              <Input
                value={form.claimsPhone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, claimsPhone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Portal URL</Label>
              <Input
                value={form.portalUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, portalUrl: e.target.value }))
                }
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
