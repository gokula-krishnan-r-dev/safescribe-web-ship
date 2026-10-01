'use client';

import { useMemo, useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Loader2,
  Phone,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useCreateFaxContact,
  useDeleteFaxContact,
  useManageFaxContacts,
  useUpdateFaxContact,
} from './hooks';
import { formatDocumentFaxNumber } from '@safescript/shared';
import type { PharmacyFaxContact } from './types';

function looksLikeFaxNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function formatFaxDisplay(value: string): string {
  return formatDocumentFaxNumber(value) ?? value;
}

type FormState = {
  name: string;
  faxNumber: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: '',
  faxNumber: '',
  notes: '',
  isActive: true,
};

export function FaxContactsSettingsPage() {
  const { data, isLoading } = useManageFaxContacts();
  const createContact = useCreateFaxContact();
  const updateContact = useUpdateFaxContact();
  const deleteContact = useDeleteFaxContact();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PharmacyFaxContact | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const contacts = data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.faxNumber.includes(q) ||
        c.faxNumber.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
        (c.notes ?? '').toLowerCase().includes(q),
    );
  }, [contacts, search]);

  /** Group by fax number so shared numbers are visible. */
  const grouped = useMemo(() => {
    const map = new Map<string, PharmacyFaxContact[]>();
    for (const c of filtered) {
      const key = c.faxNumber;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setTouched(false);
    setDialogOpen(true);
  };

  const openEdit = (contact: PharmacyFaxContact) => {
    setEditing(contact);
    setForm({
      name: contact.name,
      faxNumber: contact.faxNumber,
      notes: contact.notes ?? '',
      isActive: contact.isActive,
    });
    setTouched(false);
    setDialogOpen(true);
  };

  const nameOk = form.name.trim().length >= 2;
  const faxOk = looksLikeFaxNumber(form.faxNumber);
  const saving = createContact.isPending || updateContact.isPending;

  const handleSave = async () => {
    setTouched(true);
    if (!nameOk || !faxOk) return;
    try {
      if (editing) {
        await updateContact.mutateAsync({
          id: editing.id,
          name: form.name.trim(),
          faxNumber: form.faxNumber.trim(),
          notes: form.notes.trim() || null,
          isActive: form.isActive,
        });
        toast.success('Fax contact updated');
      } else {
        await createContact.mutateAsync({
          name: form.name.trim(),
          faxNumber: form.faxNumber.trim(),
          notes: form.notes.trim() || undefined,
          isActive: form.isActive,
        });
        toast.success('Fax contact added');
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      const error = err as { message?: string | string[] };
      const message = Array.isArray(error.message)
        ? error.message[0]
        : error.message;
      toast.error(message ?? 'Could not save fax contact');
    }
  };

  const handleToggleActive = async (contact: PharmacyFaxContact, isActive: boolean) => {
    try {
      await updateContact.mutateAsync({ id: contact.id, isActive });
      toast.success(isActive ? 'Contact activated' : 'Contact deactivated');
    } catch {
      toast.error('Could not update contact status');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteContact.mutateAsync(deleteId);
      toast.success('Fax contact removed');
      setDeleteId(null);
    } catch {
      toast.error('Could not remove fax contact');
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Fax"
        description="Save clinic and prescriber fax numbers for your pharmacy. Pharmacists can pick them when sending documents."
        breadcrumbs={[{ label: 'Fax' }]}
        actions={
          <Button type="button" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        }
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-primary" />
            Pharmacy fax directory
          </CardTitle>
          <CardDescription>
            Multiple names can share one fax number (e.g. several doctors at the same clinic).
            Inactive contacts stay in this list but are hidden from Send Fax.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or fax number…"
                className="pl-9"
              />
            </div>
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {contacts.length} contact{contacts.length === 1 ? '' : 's'}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
              <Printer className="mx-auto h-8 w-8 text-muted-foreground/70" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                {contacts.length === 0 ? 'No fax contacts yet' : 'No matches'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {contacts.length === 0
                  ? 'Add clinics and prescribers so pharmacists can autofill Send Fax in documentation.'
                  : 'Try a different name or number.'}
              </p>
              {contacts.length === 0 ? (
                <Button type="button" className="mt-4 gap-1.5" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Add first contact
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(([faxNumber, rows]) => (
                <div
                  key={faxNumber}
                  className="overflow-hidden rounded-xl border border-border/70 bg-card"
                >
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[13px] font-semibold tracking-tight text-foreground">
                      {formatFaxDisplay(faxNumber)}
                    </span>
                    {rows.length > 1 ? (
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                        {rows.length} names
                      </span>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-border/60">
                    {rows.map((contact) => (
                      <li
                        key={contact.id}
                        className={cn(
                          'flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                          !contact.isActive && 'bg-muted/20 opacity-80',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-foreground">
                            {contact.name}
                          </p>
                          {contact.notes ? (
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                              {contact.notes}
                            </p>
                          ) : null}
                          {!contact.isActive ? (
                            <p className="mt-1 text-[11px] font-medium text-amber-700">
                              Inactive — hidden from Send Fax
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="mr-1 flex items-center gap-2">
                            <Switch
                              checked={contact.isActive}
                              onCheckedChange={(v) => void handleToggleActive(contact, v)}
                              aria-label={`Active: ${contact.name}`}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(contact)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(contact.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit fax contact' : 'Add fax contact'}</DialogTitle>
            <DialogDescription>
              Name and fax number are required. You can reuse the same fax number for multiple
              names.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="fax-contact-name">Recipient name</Label>
              <Input
                id="fax-contact-name"
                autoFocus
                placeholder="e.g. Dr. Smith / Walk-in Clinic"
                value={form.name}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onBlur={() => setTouched(true)}
              />
              {touched && !nameOk ? (
                <p className="text-xs text-destructive">Enter a name (at least 2 characters)</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fax-contact-number">Fax number</Label>
              <Input
                id="fax-contact-number"
                inputMode="tel"
                placeholder="e.g. 416-555 1234"
                value={form.faxNumber}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, faxNumber: e.target.value }))}
                onBlur={() => setTouched(true)}
              />
              {touched && !faxOk ? (
                <p className="text-xs text-destructive">
                  Enter a valid fax number (at least 10 digits)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  North American numbers are stored as +1…
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fax-contact-notes">Notes (optional)</Label>
              <Input
                id="fax-contact-notes"
                placeholder="e.g. Family medicine clinic"
                value={form.notes}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Show this contact in Send Fax for pharmacists
                </p>
              </div>
              <Switch
                checked={form.isActive}
                disabled={saving}
                onCheckedChange={(isActive) => setForm((f) => ({ ...f, isActive }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || (touched && (!nameOk || !faxOk))}
              onClick={() => void handleSave()}
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                'Save changes'
              ) : (
                'Add contact'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Remove fax contact?"
        description="This contact will no longer appear in Send Fax. Past fax logs are not affected."
        confirmLabel="Remove"
        variant="destructive"
        loading={deleteContact.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
