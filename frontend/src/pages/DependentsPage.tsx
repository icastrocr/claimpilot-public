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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dependentsApi } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import type { Dependent } from "@/types";

export function DependentsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dependent | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    relationship: "self" as string,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dependents"],
    queryFn: () => dependentsApi.list(),
  });

  const dependents = data ?? [];

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editing
        ? dependentsApi.update(editing.id, data)
        : dependentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dependents"] });
      toast({ title: editing ? "Dependent updated" : "Dependent created" });
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
    mutationFn: (id: string) => dependentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dependents"] });
      toast({ title: "Dependent deleted" });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      relationship: "self",
    });
    setDialogOpen(true);
  };

  const openEdit = (dep: Dependent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(dep);
    setForm({
      firstName: dep.firstName,
      lastName: dep.lastName,
      // Strip time portion — input[type=date] needs YYYY-MM-DD only
      dateOfBirth: dep.dateOfBirth ? dep.dateOfBirth.slice(0, 10) : "",
      relationship: dep.relationship,
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
          <h1 className="text-3xl font-bold tracking-tight">Dependents</h1>
          <p className="text-muted-foreground">
            Manage patients and dependents.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Dependent
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : dependents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No dependents found.
                  </TableCell>
                </TableRow>
              ) : (
                dependents.map((dep) => (
                  <TableRow
                    key={dep.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(dep)}
                  >
                    <TableCell className="font-medium">
                      {dep.firstName} {dep.lastName}
                    </TableCell>
                    <TableCell>{formatDate(dep.dateOfBirth)}</TableCell>
                    <TableCell className="capitalize">{dep.relationship}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => openEdit(dep, e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(dep.id); }}>
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
            <DialogTitle>{editing ? "Edit Dependent" : "Add Dependent"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the dependent details." : "Enter the details for the new dependent."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select value={form.relationship} onValueChange={(v) => setForm((f) => ({ ...f, relationship: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">Self</SelectItem>
                  <SelectItem value="spouse">Spouse</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
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
    </div>
  );
}
