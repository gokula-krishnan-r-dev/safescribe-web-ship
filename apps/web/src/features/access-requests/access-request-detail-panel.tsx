'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  ACCESS_REQUEST_MATCH_TYPES,
  ACCESS_REQUEST_REJECT_REASONS,
  ACCESS_REQUEST_STATUSES,
  formatCanadianPhoneDisplay,
  isExactPharmacyMatch,
} from '@safescript/shared';
import {
  Activity,
  Building2,
  Check,
  FileText,
  Loader2,
  Network,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { MatchBadge, RequestStatusBadge } from './access-request-badges';
import {
  pharmacyManagementHref,
  useApproveNewAccessRequest,
  useLinkExistingAccessRequest,
  useNeedsReviewAccessRequest,
  useRecheckAccessRequestMatch,
  useRejectAccessRequest,
  useSaveAccessRequestNotes,
  useAccessRequest,
  type AccessRequestDetail,
} from './hooks';

type ConfirmKind = 'activate' | 'link' | 'create-new' | null;

export function AccessRequestDetailPanel({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useAccessRequest(id);
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [detailTab, setDetailTab] = useState('details');

  const approveNew = useApproveNewAccessRequest();
  const linkExisting = useLinkExistingAccessRequest();
  const reject = useRejectAccessRequest();
  const needsReview = useNeedsReviewAccessRequest();
  const recheck = useRecheckAccessRequestMatch();
  const saveNotes = useSaveAccessRequestNotes();

  useEffect(() => {
    setNotes(data?.notes ?? '');
    setDetailTab('details');
    setConfirm(null);
    setRejectOpen(false);
  }, [data?.id, data?.notes]);

  const busy =
    approveNew.isPending ||
    linkExisting.isPending ||
    reject.isPending ||
    needsReview.isPending ||
    recheck.isPending ||
    saveNotes.isPending;

  const onActionError = (error: unknown) => toast.error(getErrorMessage(error, 'Could not update this request'));

  const saveNote = () => {
    saveNotes.mutate(
      { id, notes },
      {
        onSuccess: () => toast.success('Note saved'),
        onError: onActionError,
      },
    );
  };

  const runApproveNew = (forceCreate = false) => {
    approveNew.mutate(
      { id, notes, forceCreate },
      {
        onSuccess: () => {
          setConfirm(null);
          toast.success('SafeScribe access activated');
        },
        onError: onActionError,
      },
    );
  };

  const runLink = () => {
    linkExisting.mutate(
      { id, notes, pharmacyId: data?.matchedPharmacy?.id },
      {
        onSuccess: () => {
          setConfirm(null);
          toast.success('Request linked and SafeScribe activated');
        },
        onError: onActionError,
      },
    );
  };

  if (isLoading) {
    return (
      <aside className="flex h-full w-full flex-col border-l border-border bg-card md:w-[420px] lg:w-[460px]">
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading request…
        </div>
      </aside>
    );
  }

  if (isError || !data) {
    return (
      <aside className="flex h-full w-full flex-col border-l border-border bg-card md:w-[420px] lg:w-[460px]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">Could not load this request.</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  const open = data.status !== ACCESS_REQUEST_STATUSES.APPROVED && data.status !== ACCESS_REQUEST_STATUSES.REJECTED;
  const exact = isExactPharmacyMatch(data.matchType);
  const possible = data.matchType === ACCESS_REQUEST_MATCH_TYPES.POSSIBLE;
  const neu = data.matchType === ACCESS_REQUEST_MATCH_TYPES.NONE;
  const linked = data.pharmacy ?? data.matchedPharmacy;
  const userCount = linked?.userCount ?? 0;

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-card md:w-[420px] lg:w-[460px]">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-foreground">{data.pharmacyName}</h2>
              <RequestStatusBadge status={data.status} matchType={data.matchType} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Request ID: {data.requestId || data.id}
            </p>
            <p className="text-xs text-muted-foreground">
              Received {formatDistanceToNow(new Date(data.submittedAt), { addSuffix: true })} via {data.sourceLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <Tabs value={detailTab} onValueChange={setDetailTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-auto w-full shrink-0 justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          <PanelTab value="details" icon={Building2} label="Details" />
          <PanelTab value="network" icon={Network} label="Network" />
          <PanelTab value="users" icon={Users} label={`Users (${userCount})`} />
          <PanelTab value="activity" icon={Activity} label="Activity" />
          <PanelTab value="documents" icon={FileText} label="Documents" />
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <TabsContent value="details" className="mt-0 space-y-4">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Registration details</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || !open}
                  onClick={() =>
                    recheck.mutate(id, {
                      onSuccess: () => toast.success('Match check refreshed'),
                      onError: onActionError,
                    })
                  }
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', recheck.isPending && 'animate-spin')} />
                  Recheck
                </Button>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <Info label="Pharmacy Name" value={data.pharmacyName} />
                <Info label="Licence Number" value={data.licenceNumber} />
                <Info label="Owner / Manager" value={data.contactName} />
                <Info label="Work Email" value={data.email} />
                <Info label="Phone" value={formatCanadianPhoneDisplay(data.phone) || '—'} />
                <Info label="Source" value={data.sourceLabel} />
                <Info label="Registered On" value={formatDate(data.submittedAt)} />
                <Info label="Province" value={data.province} />
                <Info label="IP Address Captured" value={data.capturedPublicIp} mono />
                <Info label="Status" value={data.displayStatus} />
              </dl>
            </section>

            <MatchPanel data={data} />

            <section>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="access-request-notes">
                Admin Notes
              </label>
              <Textarea
                id="access-request-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add internal notes…"
                maxLength={2000}
              />
              <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={saveNote}>
                Save note
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="network" className="mt-0 space-y-3">
            <Info label="Captured public IP" value={data.capturedPublicIp} mono />
            {data.ipDiscrepancy ? (
              <p className="text-sm text-amber-700">Submission IP differed from the captured network.</p>
            ) : null}
            {(linked?.networks?.length ?? 0) > 0 ? (
              <ul className="space-y-2 text-sm">
                {linked!.networks.map((network) => (
                  <li key={network.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-mono text-xs">{network.cidr}</p>
                    <p className="text-xs text-muted-foreground">{network.label || network.source}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {open
                  ? 'This captured network is added to the pharmacy allowlist only after approval.'
                  : 'No pharmacy networks on file yet.'}
              </p>
            )}
          </TabsContent>

          <TabsContent value="users" className="mt-0 space-y-3">
            {(linked?.users?.length ?? 0) > 0 ? (
              <ul className="space-y-2">
                {linked!.users.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {getInitials(user.fullName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email} · {user.role}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {open ? 'No users yet. Approval will invite the registration contact.' : 'No users on the linked pharmacy.'}
              </p>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <ol className="space-y-3">
              {data.activity.map((event, index) => (
                <li key={`${event.label}-${index}`} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium">{event.label}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(event.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            <p className="text-sm text-muted-foreground">
              Documents are managed on the pharmacy record after activation.
            </p>
            {data.pharmacy ? (
              <Link
                href={pharmacyManagementHref(data.pharmacy.id)}
                className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
              >
                Open pharmacy documents
              </Link>
            ) : null}
          </TabsContent>
        </div>
      </Tabs>

      <footer className="shrink-0 space-y-2 border-t border-border bg-muted/20 p-3">
        {data.status === ACCESS_REQUEST_STATUSES.APPROVED && data.pharmacy ? (
          <Link href={pharmacyManagementHref(data.pharmacy.id)}>
            <Button className="w-full">Open Pharmacy</Button>
          </Link>
        ) : null}

        {open && neu ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
              Reject Request
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                needsReview.mutate(
                  { id, notes },
                  { onSuccess: () => toast.success('Marked for review'), onError: onActionError },
                )
              }
            >
              Needs Review
            </Button>
            <Button disabled={busy} onClick={() => setConfirm('activate')}>
              <Check className="h-4 w-4" />
              Approve & Activate
            </Button>
          </div>
        ) : null}

        {open && exact ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
              Reject Request
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                needsReview.mutate(
                  { id, notes },
                  { onSuccess: () => toast.success('Marked for review'), onError: onActionError },
                )
              }
            >
              Needs Review
            </Button>
            <Button disabled={busy || !data.matchedPharmacy} onClick={() => setConfirm('link')}>
              Link & Activate SafeScribe
            </Button>
          </div>
        ) : null}

        {open && possible ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
              Reject Request
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm('create-new')}>
              Create as New
            </Button>
            <Button disabled={busy || !data.matchedPharmacy} onClick={() => setConfirm('link')}>
              Link to Existing
            </Button>
          </div>
        ) : null}
      </footer>

      <ConfirmDialog
        open={confirm === 'activate'}
        onOpenChange={(openDialog) => !openDialog && setConfirm(null)}
        title="Activate SafeScribe"
        description={`${data.pharmacyName}\n\nA new pharmacy record will be created, the contact invited, the captured network added, and complimentary Prescribe access enabled (10 assessments per day).`}
        confirmLabel="Activate SafeScribe"
        variant="default"
        loading={approveNew.isPending}
        onConfirm={() => runApproveNew(false)}
      />
      <ConfirmDialog
        open={confirm === 'link'}
        onOpenChange={(openDialog) => !openDialog && setConfirm(null)}
        title="Activate SafeScribe for existing pharmacy"
        description={`${data.matchedPharmacy?.name ?? data.pharmacyName}\nLicence: ${data.matchedPharmacy?.licenceNumber ?? data.licenceNumber}\n\nThis request will be linked to the existing pharmacy. Prescribe access and the captured network will be added if missing. No second pharmacy will be created.`}
        confirmLabel="Link & Activate"
        variant="default"
        loading={linkExisting.isPending}
        onConfirm={runLink}
      />
      <ConfirmDialog
        open={confirm === 'create-new'}
        onOpenChange={(openDialog) => !openDialog && setConfirm(null)}
        title="Create as new pharmacy?"
        description={`A possible match was found for ${data.matchedPharmacy?.name ?? 'an existing pharmacy'}. Creating as new will add a separate pharmacy record. Only continue if you have confirmed this is not a duplicate.`}
        confirmLabel="Create as New"
        variant="default"
        loading={approveNew.isPending}
        onConfirm={() => runApproveNew(true)}
      />

      {rejectOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRejectOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Reject access request?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will not create or modify a pharmacy account.
            </p>
            <label className="mt-4 block text-sm font-medium" htmlFor="reject-reason">
              Reason (optional)
            </label>
            <Select
              id="reject-reason"
              className="mt-1.5"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Select a reason"
              options={ACCESS_REQUEST_REJECT_REASONS.map((item) => ({ value: item.value, label: item.label }))}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={reject.isPending}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={reject.isPending}
                onClick={() =>
                  reject.mutate(
                    { id, reason: rejectReason || undefined, notes },
                    {
                      onSuccess: () => {
                        setRejectOpen(false);
                        toast.success('Request rejected');
                      },
                      onError: onActionError,
                    },
                  )
                }
              >
                Reject Request
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function PanelTab({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-foreground', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

function MatchPanel({ data }: { data: AccessRequestDetail }) {
  if (data.status === ACCESS_REQUEST_STATUSES.APPROVED && data.pharmacy) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" />
          Activated
        </div>
        <p className="mt-1 text-sm text-emerald-900">{data.pharmacy.name}</p>
        <p className="text-xs text-emerald-800">
          Licence {data.pharmacy.licenceNumber || data.licenceNumber}
          {data.reviewedBy ? ` · Approved by ${data.reviewedBy.fullName}` : ''}
        </p>
        <Link
          href={pharmacyManagementHref(data.pharmacy.id)}
          className="mt-2 inline-flex text-sm font-medium text-emerald-900 underline"
        >
          Open Pharmacy
        </Link>
      </div>
    );
  }

  if (data.matchType === ACCESS_REQUEST_MATCH_TYPES.NONE) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-emerald-900">Existing match check</p>
          <MatchBadge matchType={data.matchType} />
        </div>
        <p className="mt-1 text-sm text-emerald-800">No existing match found in PhIX or SafeScribe</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <Check className="h-4 w-4" />
          Ready to create new pharmacy
        </p>
      </div>
    );
  }

  const match = data.matchedPharmacy;
  if (!match) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-900">
          {data.matchType === ACCESS_REQUEST_MATCH_TYPES.POSSIBLE
            ? 'Possible existing pharmacy found'
            : match.phixCustomer
              ? 'Existing PhIX pharmacy found'
              : 'Existing pharmacy found'}
        </p>
        <MatchBadge matchType={data.matchType} />
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{match.name}</p>
      <p className="text-xs text-muted-foreground">
        Licence: {match.licenceNumber || '—'} · {match.phixCustomer ? 'PhIX Customer' : 'SafeScribe'} · {match.status} ·{' '}
        {match.userCount} {match.userCount === 1 ? 'user' : 'users'}
      </p>
      {match.prescribeActive ? (
        <p className="mt-1 text-xs font-medium text-amber-800">SafeScribe already active</p>
      ) : null}
      {data.matchReasons.length ? (
        <p className="mt-1 text-xs text-muted-foreground">{data.matchReasons.join(' · ')}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        New access request from {data.contactName} · Captured network {data.capturedPublicIp}
      </p>
      <Link
        href={pharmacyManagementHref(match.id)}
        className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
      >
        Review existing pharmacy
      </Link>
    </div>
  );
}
