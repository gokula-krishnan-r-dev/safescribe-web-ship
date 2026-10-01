'use client';

import { useState } from 'react';
import { Plus, Search, UserCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { REVIEWER_TYPES } from '@safescript/shared';
import {
  useRetireReviewerLibrary,
  useReviewerLibraryList,
  useSaveReviewerLibrary,
} from '@/features/reference-library/hooks';
import type { ReviewerLibraryItem } from '@/features/reference-library/types';

const schema = z
  .object({
    reviewerType: z.enum(['internal', 'external']),
    name: z.string().min(1, 'Name is required'),
    credentials: z.string().min(1, 'Credentials are required'),
    role: z.string().min(1, 'Role is required'),
    organization: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reviewerType === 'external' && !data.organization?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Organization is required for external reviewers',
        path: ['organization'],
      });
    }
  });

type FormData = z.infer<typeof schema>;

export function ReviewerLibraryPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewerLibraryItem | null>(null);

  const list = useReviewerLibraryList({
    search,
    reviewerType: typeFilter,
    status: statusFilter,
    page,
    pageSize: 25,
  });
  const save = useSaveReviewerLibrary();
  const retire = useRetireReviewerLibrary();
  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      reviewerType: 'internal',
      name: '',
      credentials: '',
      role: '',
      organization: '',
    },
  });

  const openAdd = () => {
    setEditing(null);
    form.reset({
      reviewerType: 'internal',
      name: '',
      credentials: '',
      role: '',
      organization: '',
    });
    setFormOpen(true);
  };

  const openEdit = (item: ReviewerLibraryItem) => {
    setEditing(item);
    form.reset({
      reviewerType: item.reviewerType === 'external' ? 'external' : 'internal',
      name: item.name,
      credentials: item.credentials,
      role: item.role,
      organization: item.organization ?? '',
    });
    setFormOpen(true);
  };

  const submit = form.handleSubmit(async (data) => {
    try {
      await save.mutateAsync({
        id: editing?.id,
        data: {
          ...data,
          organization: data.organization?.trim() || null,
        },
      });
      toast.success(editing ? 'Master reviewer updated.' : 'Master reviewer added.');
      setFormOpen(false);
      setEditing(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save master reviewer.');
    }
  });

  const handleRetire = async (item: ReviewerLibraryItem) => {
    try {
      await retire.mutateAsync({ id: item.id, restore: item.isRetired });
      toast.success(item.isRetired ? 'Master reviewer restored.' : 'Master reviewer retired.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update master reviewer.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <UserCheck className="h-5 w-5 text-primary" />
            Reviewer Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master reviewers for governance. Link a reviewer onto any pathway with review details.
          </p>
        </div>
        <Button type="button" size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add reviewer
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, credentials, or organization…"
            className="pl-9"
          />
        </div>
        <Select
          className="w-full lg:w-[180px]"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All types' },
            ...REVIEWER_TYPES.map((v) => ({
              value: v,
              label: v === 'internal' ? 'Internal' : 'Independent peer',
            })),
          ]}
        />
        <Select
          className="w-full lg:w-[160px]"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'retired', label: 'Retired' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      <Card className="overflow-hidden border-border/80 shadow-sm">
        {list.isLoading ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">Loading reviewers…</p>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium">No master reviewers yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a reviewer here, then link them onto any pathway.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border/80 bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Reviewer</th>
                  <th className="px-3 py-2.5 font-semibold">Type</th>
                  <th className="px-3 py-2.5 font-semibold">Role</th>
                  <th className="px-3 py-2.5 font-semibold">Pathways</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <p className="font-medium leading-snug">
                        {item.name}
                        {item.credentials ? `, ${item.credentials}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.organization || '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {item.reviewerType === 'external' ? 'Independent peer' : 'Internal'}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{item.role}</td>
                    <td className="px-3 py-3 text-muted-foreground">{item.pathwayUsageCount}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={item.isRetired}
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => void handleRetire(item)}
                        >
                          {item.isRetired ? 'Restore' : 'Retire'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={(open) => !open && setFormOpen(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit master reviewer' : 'Add master reviewer'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.watch('reviewerType')}
                onChange={(e) =>
                  form.setValue('reviewerType', e.target.value as 'internal' | 'external')
                }
                options={[
                  { value: 'internal', label: 'Internal clinical review' },
                  { value: 'external', label: 'Independent peer review' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-name">Name</Label>
              <Input id="rv-name" {...form.register('name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-cred">Credentials</Label>
              <Input id="rv-cred" {...form.register('credentials')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-role">Role</Label>
              <Input id="rv-role" {...form.register('role')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rv-org">Organization</Label>
              <Input id="rv-org" {...form.register('organization')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
