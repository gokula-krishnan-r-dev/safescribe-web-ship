'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Mail,
  Search,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import {
  CONTACT_INQUIRY_NOTE_MAX,
  CONTACT_INQUIRY_STATUSES,
  CONTACT_SUPPORT_EMAIL,
  CONTACT_TOPIC_OPTIONS,
  type ContactInquiryStatus,
} from '@safescript/shared';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { getPublicApiUrl } from '@/lib/api-url';
import {
  useContactInquiries,
  useContactInquiry,
  useUpdateContactInquiry,
  type ContactInquiryListItem,
} from './hooks';

const STATUS_TABS: Array<{ value: string; label: string; countKey: 'all' | ContactInquiryStatus }> = [
  { value: '', label: 'All', countKey: 'all' },
  { value: CONTACT_INQUIRY_STATUSES.NEW, label: 'New', countKey: 'new' },
  { value: CONTACT_INQUIRY_STATUSES.OPEN, label: 'In progress', countKey: 'open' },
  { value: CONTACT_INQUIRY_STATUSES.CLOSED, label: 'Closed', countKey: 'closed' },
];

export function ContactInboxPage() {
  const [params, setParams] = useState({
    page: 1,
    limit: 20,
    search: '',
    topic: '',
    status: '',
  });
  const [searchInput, setSearchInput] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => ({ ...p, search: searchInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch, isFetching } = useContactInquiries(params);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (k === 'page' || k === 'limit') return;
        if (v) qs.set(k, String(v));
      });
      const res = await fetch(`${getPublicApiUrl()}/api/v1/contact/inquiries/export?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contact-inquiries.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded', { announce: true });
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Contact inbox"
        description="Messages from the public Contact Us form — product support, demos, and partnerships."
        breadcrumbs={[{ label: 'Contact inbox' }]}
        actions={
          <Button variant="outline" onClick={() => void handleExport()}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:px-4">
            {STATUS_TABS.map((tab) => {
              const count = data?.counts?.[tab.countKey] ?? 0;
              const active = params.status === tab.value;
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setParams((p) => ({ ...p, status: tab.value, page: 1 }))}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[11px] font-semibold',
                      active ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 border-b border-border p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, email, pharmacy, or message…"
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
              value={params.topic}
              onChange={(e) => setParams((p) => ({ ...p, topic: e.target.value, page: 1 }))}
            >
              <option value="">All topics</option>
              {CONTACT_TOPIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={8} />
            </div>
          ) : isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => void refetch()} />
            </div>
          ) : !data?.data.length ? (
            <div className="p-4">
              <EmptyState
                title="No inquiries"
                description="New Contact Us submissions will appear here as soon as they are sent."
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">From</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Topic</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Message</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((row) => (
                      <InquiryRow
                        key={row.id}
                        row={row}
                        onOpen={() => setSelectedId(row.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
                <p>
                  {data.meta.total} {data.meta.total === 1 ? 'inquiry' : 'inquiries'}
                  {isFetching ? ' · updating' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={params.page <= 1}
                    onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span>
                    {params.page} / {data.meta.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={params.page >= data.meta.totalPages}
                    onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <InquiryDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function InquiryRow({ row, onOpen }: { row: ContactInquiryListItem; onOpen: () => void }) {
  const isNew = row.status === CONTACT_INQUIRY_STATUSES.NEW;
  return (
    <tr
      className={cn(
        'cursor-pointer border-b border-border/70 transition-colors hover:bg-muted/50',
        isNew && 'bg-primary/[0.03]',
      )}
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <p className={cn('text-foreground', isNew && 'font-semibold')}>{row.fullName}</p>
        <p className="text-xs text-muted-foreground">{row.organization}</p>
        <p className="text-xs text-muted-foreground">{row.workEmail}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-foreground">{row.topicLabel}</td>
      <td className="max-w-[360px] px-4 py-3 text-muted-foreground">
        <p className="line-clamp-2">{row.preview}</p>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(row.createdAt)}</td>
    </tr>
  );
}

function InquiryDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useContactInquiry(id);
  const update = useUpdateContactInquiry();
  const [note, setNote] = useState('');
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    setNote(data?.internalNote ?? '');
  }, [data?.id, data?.internalNote]);

  useEffect(() => {
    if (!data || data.status !== CONTACT_INQUIRY_STATUSES.NEW) return;
    if (openedRef.current === data.id) return;
    openedRef.current = data.id;
    update.mutate({ id: data.id, status: CONTACT_INQUIRY_STATUSES.OPEN });
    // Intentionally omit `update` — mark each inquiry once when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, data?.status]);

  const setStatus = (status: ContactInquiryStatus) => {
    if (!id) return;
    update.mutate(
      { id, status },
      {
        onSuccess: () =>
          toast.success(
            status === CONTACT_INQUIRY_STATUSES.CLOSED
              ? 'Marked as closed'
              : 'Moved to in progress',
          ),
        onError: () => toast.error('Could not update status'),
      },
    );
  };

  const saveNote = () => {
    if (!id) return;
    update.mutate(
      { id, internalNote: note },
      {
        onSuccess: () => toast.success('Note saved'),
        onError: () => toast.error('Could not save note'),
      },
    );
  };

  const copyEmail = async () => {
    if (!data?.workEmail) return;
    try {
      await navigator.clipboard.writeText(data.workEmail);
      toast.success('Email copied', { announce: true });
    } catch {
      toast.error('Could not copy email');
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {isLoading ? (
          <div className="py-10 text-sm text-muted-foreground">Loading inquiry…</div>
        ) : isError || !data ? (
          <div className="py-10 text-sm text-muted-foreground">Could not load this inquiry.</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{data.fullName}</DialogTitle>
              <DialogDescription>
                {data.organization} · {data.topicLabel} · {formatDate(data.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={data.status} />
              {data.status !== CONTACT_INQUIRY_STATUSES.CLOSED ? (
                <Button size="sm" onClick={() => setStatus(CONTACT_INQUIRY_STATUSES.CLOSED)}>
                  <Check className="h-4 w-4" />
                  Mark closed
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus(CONTACT_INQUIRY_STATUSES.OPEN)}
                >
                  Reopen
                </Button>
              )}
              <a
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href={`mailto:${data.workEmail}?subject=${encodeURIComponent(`Re: SafeScribe — ${data.topicLabel}`)}`}
              >
                <Mail className="h-4 w-4" />
                Reply
              </a>
              <Button size="sm" variant="ghost" onClick={() => void copyEmail()}>
                <Copy className="h-4 w-4" />
                Copy email
              </Button>
            </div>

            <dl className="grid gap-3 rounded-xl border border-border/80 bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Work email</dt>
                <dd className="mt-1 font-medium">{data.workEmail}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Organization</dt>
                <dd className="mt-1 font-medium">{data.organization}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Topic</dt>
                <dd className="mt-1 font-medium">{data.topicLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Handled by</dt>
                <dd className="mt-1 font-medium">
                  {data.handledBy?.fullName ?? '—'}
                  {data.handledAt ? ` · ${formatDate(data.handledAt)}` : ''}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Message</p>
              <p className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm leading-relaxed">
                {data.message}
              </p>
            </div>

            <div>
              <label htmlFor="inquiry-note" className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Internal note
              </label>
              <Textarea
                id="inquiry-note"
                value={note}
                maxLength={CONTACT_INQUIRY_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Private notes for the Super Admin team — not sent to the sender."
                className="min-h-[96px]"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {note.length} / {CONTACT_INQUIRY_NOTE_MAX}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveNote}
                  disabled={update.isPending || note === (data.internalNote ?? '')}
                >
                  Save note
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Public replies still go through {CONTACT_SUPPORT_EMAIL}. Opening a new inquiry moves it to In progress.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
