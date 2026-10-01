'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  LocateFixed,
  Lock,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';
import {
  networkMatchesIp,
  useCurrentPublicIp,
  usePharmacyNetworkMutations,
  usePharmacyNetworkOverview,
  type PharmacyNetworkRow,
} from './pharmacy-network-hooks';

interface Props {
  tenantId: string;
  pharmacyName: string;
  /** Compact chrome when shown inside the Network Access workspace. */
  embedded?: boolean;
}

function networkKindLabel(cidr: string) {
  if (cidr.endsWith('/32')) return 'IPv4 address';
  if (cidr.endsWith('/48')) return 'IPv6 site';
  if (cidr.endsWith('/56')) return 'IPv6 site';
  if (cidr.endsWith('/64')) return 'IPv6 network';
  if (cidr.endsWith('/128')) return 'IPv6 host';
  return 'CIDR range';
}

export function PharmacyNetworkAccessPanel({
  tenantId,
  pharmacyName,
  embedded = false,
}: Props) {
  const { data, isLoading } = usePharmacyNetworkOverview(tenantId, true);
  const currentIpQuery = useCurrentPublicIp(true);
  const mutations = usePharmacyNetworkMutations(tenantId);

  const [cidr, setCidr] = useState('');
  const [label, setLabel] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [editRow, setEditRow] = useState<PharmacyNetworkRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [confirmCurrentIp, setConfirmCurrentIp] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const currentIp = currentIpQuery.data?.ipAddress ?? null;
  const recommendedCidr = currentIpQuery.data?.recommendedCidr ?? currentIp ?? null;
  const ipv4Address = currentIpQuery.data?.ipv4Address ?? null;
  const ipFamily = currentIpQuery.data?.family ?? null;
  const currentIpPrivate = Boolean(currentIpQuery.data?.isPrivate);
  const currentIpUnusable =
    currentIpPrivate ||
    Boolean(currentIpQuery.data?.isCloudflare) ||
    currentIpQuery.data?.usable === false;
  const addCidr: string | null = ipv4Address || recommendedCidr || null;
  const matchingNetwork = useMemo(() => {
    if (!data?.networks) return undefined;
    const already = data.networks.find((row) => row.matchesCurrentRequest);
    if (already) return already;
    const needles = [currentIp, recommendedCidr, ipv4Address].filter(
      (value): value is string => Boolean(value),
    );
    return data.networks.find((row) => needles.some((needle) => networkMatchesIp(row, needle)));
  }, [currentIp, data?.networks, ipv4Address, recommendedCidr]);

  const waiting = useMemo(
    () =>
      data?.verifications.find(
        (v) => v.status === 'SENT' || v.status === 'OPENED',
      ) ?? null,
    [data?.verifications],
  );

  const fillCurrentIp = () => {
    if (currentIpQuery.isFetching && !currentIp) {
      toast.message('Detecting your public IP…');
      return;
    }
    if (!currentIp) {
      toast.error('Could not detect your public IP. Enter it manually or send a verification link.');
      return;
    }
    if (currentIpUnusable) {
      toast.error(
        "SafeScribe could not see the pharmacy's public internet IP. Refresh after the network check is restored, or send a verification link.",
      );
      return;
    }
    if (matchingNetwork) {
      toast.message(`${addCidr} is already on this pharmacy`);
      return;
    }
    if (!addCidr) {
      toast.error('Could not detect your public IP. Enter it manually or send a verification link.');
      return;
    }
    setCidr(addCidr);
    if (!label.trim()) {
      setLabel(ipv4Address ? 'Pharmacy public IPv4' : ipFamily === 'ipv6' ? 'Pharmacy IPv6 site' : 'Current public IP');
    }
    toast.success(`Filled with ${addCidr}. Review and click Add.`);
  };

  const handleAdd = async (value?: string, nextLabel?: string) => {
    const cidrValue = (value ?? cidr).trim();
    const labelValue = (nextLabel ?? label).trim();
    if (!cidrValue) {
      toast.error('Enter a public IP address');
      return;
    }
    try {
      const created = await mutations.add.mutateAsync({
        cidr: cidrValue,
        label: labelValue || undefined,
      });
      setCidr('');
      setLabel('');
      setConfirmCurrentIp(false);
      const companionCreated =
        created &&
        typeof created === 'object' &&
        'companionCreated' in created &&
        Boolean((created as { companionCreated?: boolean }).companionCreated);
      toast.success(
        companionCreated
          ? 'Pharmacy IPv4 and this connection’s IPv6 site added'
          : 'Pharmacy network added',
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleAddCurrentIp = async () => {
    if (currentIpUnusable) return;
    const items: { cidr: string; label: string }[] = [];
    if (ipv4Address) {
      items.push({ cidr: ipv4Address, label: 'Pharmacy public IPv4' });
    }
    if (ipFamily === 'ipv6' && recommendedCidr && recommendedCidr !== ipv4Address) {
      items.push({ cidr: recommendedCidr, label: 'Pharmacy IPv6 site' });
    }
    if (!items.length && addCidr) {
      items.push({
        cidr: addCidr,
        label: label.trim() || 'Current public IP',
      });
    }
    const pending = items.filter(
      (item) =>
        !data?.networks.some(
          (row) => row.cidr === item.cidr || networkMatchesIp(row, item.cidr),
        ),
    );
    if (!pending.length) {
      toast.message('This pharmacy network is already allowed');
      setConfirmCurrentIp(false);
      return;
    }
    try {
      for (const item of pending) {
        await mutations.add.mutateAsync({ cidr: item.cidr, label: item.label });
      }
      setConfirmCurrentIp(false);
      toast.success(
        pending.length > 1 ? 'Pharmacy IPv4 and IPv6 networks added' : 'Pharmacy network added',
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const handleSend = async () => {
    if (!sendEmail.trim()) {
      toast.error('Enter an email address');
      return;
    }
    try {
      await mutations.sendLink.mutateAsync(sendEmail.trim());
      setSendOpen(false);
      toast.success(`Verification link sent to ${sendEmail.trim()}`, { announce: true });
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const openSend = () => {
    setSendEmail(data?.pharmacy.email ?? '');
    setSendOpen(true);
  };

  const networkAccessEnabled = data?.networkAccessEnabled !== false;
  const restrictionActive = Boolean(data?.restrictionActive);

  const applyNetworkAccess = async (enabled: boolean) => {
    try {
      await mutations.setEnabled.mutateAsync(enabled);
      toast.success(
        enabled
          ? 'Network access restriction is on'
          : 'Network access restriction is off — pharmacists can sign in from any location',
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setConfirmDisable(false);
    }
  };

  const restrictionBadge = restrictionActive ? (
    <Badge variant="success" className="gap-1.5 px-3 py-1.5 text-sm">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Restricted
    </Badge>
  ) : networkAccessEnabled ? (
    <Badge variant="outline" className="px-3 py-1.5 text-sm">
      On · add an IP to restrict
    </Badge>
  ) : (
    <Badge variant="warning" className="px-3 py-1.5 text-sm">
      Unrestricted
    </Badge>
  );

  const restrictionDescription = networkAccessEnabled
    ? "When this is on, SafeScribe can only be accessed from this pharmacy's registered public IP addresses."
    : 'Network restriction is off. Pharmacists at this pharmacy can sign in from any internet connection. Allowed IPs are kept for when you turn it back on.';

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {pharmacyName}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {restrictionDescription}
            </p>
          </div>
          {restrictionBadge}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHeader
            className="mb-0"
            title="Network access"
            description={restrictionDescription}
            breadcrumbs={[
              { label: 'Pharmacies', href: '/super-admin/management' },
              { label: pharmacyName },
              { label: 'Network access' },
            ]}
          />
          <div className="mt-2">{restrictionBadge}</div>
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl border-border/80 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <Label htmlFor="network-access-enabled" className="text-base font-semibold text-foreground">
                Restrict sign-in to pharmacy networks
              </Label>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {networkAccessEnabled
                  ? 'Only listed IPs can open SafeScribe for this pharmacy. Turn this off to allow access from anywhere.'
                  : 'Access is open from any location. Turn this on to enforce the allowed IP list below.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {networkAccessEnabled ? 'On' : 'Off'}
            </span>
            <Switch
              id="network-access-enabled"
              checked={networkAccessEnabled}
              disabled={!data || mutations.setEnabled.isPending}
              onCheckedChange={(next) => {
                if (!next) {
                  setConfirmDisable(true);
                  return;
                }
                void applyNetworkAccess(true);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border/80 bg-white shadow-sm">
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Allowed pharmacy networks
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Open this page on the pharmacy&apos;s regular internet, then click{' '}
                  <span className="font-medium text-foreground">Add this network</span>. SafeScribe
                  records the address this app actually uses at sign-in. A &ldquo;what is my
                  IP&rdquo; website can show a different address than login (IPv4 vs IPv6), so
                  prefer the button below. If you paste from a lookup site, add both IPv4 and IPv6.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
              onClick={openSend}
            >
              <Send className="h-4 w-4" />
              Send IP verification link to pharmacy
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Use this if the pharmacy cannot provide its public IP. Ask them to open the link while
            connected to the pharmacy&apos;s regular internet connection.
          </p>

          {waiting ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm">
              <p className="font-medium text-teal-900">
                Verification link sent to {waiting.email}
              </p>
              <p className="mt-0.5 text-teal-800/80">
                Waiting for pharmacy… expires {formatDate(waiting.expiresAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-teal-300 bg-white text-teal-900"
                  onClick={() =>
                    mutations.sendLink.mutate(waiting.email, {
                      onSuccess: () => toast.success(`Verification link resent to ${waiting.email}`, { announce: true }),
                      onError: (e) => toast.error(getErrorMessage(e)),
                    })
                  }
                  disabled={mutations.sendLink.isPending}
                >
                  Resend link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-teal-900"
                  onClick={() => mutations.cancelLink.mutate(waiting.id)}
                >
                  Cancel request
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="network-cidr">IP / network range</Label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                  onClick={fillCurrentIp}
                  disabled={currentIpQuery.isFetching && !currentIp}
                >
                  {currentIpQuery.isFetching && !currentIp ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LocateFixed className="h-3.5 w-3.5" />
                  )}
                  Use current IP
                </button>
              </div>
              <Input
                id="network-cidr"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                placeholder="e.g. 203.0.113.10 or 2001:db8:abcd::/48"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="network-label">Label (optional)</Label>
              <Input
                id="network-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Primary pharmacy internet"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                className="w-full gap-1.5 md:w-auto"
                onClick={() => void handleAdd()}
                disabled={mutations.add.isPending}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          {currentIpQuery.isError ? (
            <p className="text-xs text-muted-foreground">
              Current public IP could not be detected. Enter it manually or send a verification link
              to the pharmacy.
            </p>
          ) : currentIp ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {ipv4Address ? (
                    <>
                      Public IPv4:{' '}
                      <span className="font-mono font-semibold">{ipv4Address}</span>
                    </>
                  ) : (
                    <>
                      Current public address:{' '}
                      <span className="font-mono font-semibold break-all">{currentIp}</span>
                      {ipFamily === 'ipv6' ? (
                        <span className="ml-2 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                          IPv6
                        </span>
                      ) : null}
                    </>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentIpUnusable
                    ? "This is a proxy address, not the pharmacy's internet. SafeScribe now restores the real client IP on sign-in."
                    : matchingNetwork
                      ? 'This network is already on the allowlist for this pharmacy.'
                      : ipFamily === 'ipv6' && recommendedCidr
                        ? `This ISP assigns a new IPv6 address often. SafeScribe will register the pharmacy site ${recommendedCidr} so the same internet keeps working day to day.`
                        : "Only add this if you are connected to this pharmacy's regular internet."}
                </p>
                {ipv4Address && ipFamily === 'ipv6' && recommendedCidr ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Also detected IPv6 site{' '}
                    <span className="font-mono">{recommendedCidr}</span> — both will be added so
                    IPv4 and IPv6 access work.
                  </p>
                ) : null}
              </div>
              {currentIpUnusable ? null : matchingNetwork ? (
                <Badge variant="success" className="w-fit shrink-0 gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Already allowed
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    if (addCidr) setCidr(addCidr);
                    if (!label.trim()) {
                      setLabel(
                        ipv4Address
                          ? 'Pharmacy public IPv4'
                          : ipFamily === 'ipv6'
                            ? 'Pharmacy IPv6 site'
                            : 'Current public IP',
                      );
                    }
                    setConfirmCurrentIp(true);
                  }}
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                  Add this network
                </Button>
              )}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">IP / Network range</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last verified</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Loading networks…
                    </td>
                  </tr>
                ) : !data?.networks.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No approved networks yet. Add a public IP or send a verification link.
                    </td>
                  </tr>
                ) : (
                  data.networks.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[13px] font-medium">{row.cidr}</p>
                        <span className="mt-1 inline-flex rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                          {networkKindLabel(row.cidr)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.status === 'PENDING'
                          ? row.label || 'Captured from pharmacy verification link'
                          : (row.label ?? '—')}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            Pending approval
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.status === 'PENDING'
                          ? `Requested: ${formatDate(row.createdAt)}`
                          : row.lastVerifiedAt
                            ? formatDate(row.lastVerifiedAt)
                            : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                mutations.approve.mutate(row.id, {
                                  onSuccess: () => toast.success('Network approved'),
                                  onError: (e) => toast.error(getErrorMessage(e)),
                                })
                              }
                            >
                              Approve & Add
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                mutations.reject.mutate(row.id, {
                                  onSuccess: () => toast.success('Network request rejected'),
                                  onError: (e) => toast.error(getErrorMessage(e)),
                                })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditRow(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(row.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div className="text-sm text-sky-950">
                <p className="font-semibold">How it works</p>
                <p className="mt-1 leading-relaxed text-sky-900/80">
                  SafeScribe checks the request&apos;s public IP on every sign-in and clinical
                  session. Pharmacists and pharmacy admins are allowed only when the IP matches an
                  approved network for this pharmacy.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-sky-800 hover:bg-sky-100 hover:text-sky-900"
              onClick={() => setLearnMoreOpen(true)}
            >
              Learn more
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Only SafeScribe admins can manage pharmacy network settings.
      </p>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Send pharmacy network verification</DialogTitle>
            <DialogDescription>
              Send a secure link to the pharmacy. The link must be opened from a computer connected
              to the pharmacy&apos;s regular internet connection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pharmacy
              </p>
              <p className="mt-1 text-sm font-semibold">{pharmacyName}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="verify-email">Send to</Label>
              <Input
                id="verify-email"
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="pharmacy@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSend} disabled={mutations.sendLink.isPending}>
              Send verification link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit network</DialogTitle>
          </DialogHeader>
          {editRow ? (
            <EditNetworkForm
              row={editRow}
              saving={mutations.update.isPending}
              onCancel={() => setEditRow(null)}
              onSave={async (next) => {
                try {
                  await mutations.update.mutateAsync({ id: editRow.id, ...next });
                  setEditRow(null);
                  toast.success('Network updated');
                } catch (e) {
                  toast.error(getErrorMessage(e));
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={learnMoreOpen} onOpenChange={setLearnMoreOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>How pharmacy network access works</DialogTitle>
            <DialogDescription>
              SafeScribe clinical access is limited to approved pharmacy internet connections.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setLearnMoreOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={(open) => !open && setConfirmDisable(false)}
        title="Allow access from anywhere?"
        description={`${pharmacyName} pharmacists will be able to sign in from any internet connection, including home and mobile. Allowed IPs stay saved so you can turn restriction back on later.`}
        confirmLabel="Turn restriction off"
        loading={mutations.setEnabled.isPending}
        onConfirm={() => {
          void applyNetworkAccess(false);
        }}
      />

      <ConfirmDialog
        open={confirmCurrentIp}
        onOpenChange={(open) => !open && setConfirmCurrentIp(false)}
        title="Add this pharmacy network?"
        description={`Add ${addCidr ?? 'this network'} for ${pharmacyName}? IPv6 is stored as a stable /48 site prefix so daily ISP and device address changes on this same internet keep working. Only confirm if you are on this pharmacy's regular internet — not a home or mobile hotspot unless that is the intended access path.`}
        confirmLabel="Add network"
        variant="default"
        loading={mutations.add.isPending}
        onConfirm={() => {
          void handleAddCurrentIp();
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove this network?"
        description="Users at this pharmacy will no longer be able to access SafeScribe from this IP."
        confirmLabel="Remove"
        loading={mutations.remove.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          mutations.remove.mutate(deleteId, {
            onSuccess: () => {
              setDeleteId(null);
              toast.success('Network removed');
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          });
        }}
      />
    </div>
  );
}

function EditNetworkForm({
  row,
  saving,
  onCancel,
  onSave,
}: {
  row: PharmacyNetworkRow;
  saving: boolean;
  onCancel: () => void;
  onSave: (next: { cidr: string; label: string }) => Promise<void>;
}) {
  const [cidr, setCidr] = useState(row.cidr);
  const [label, setLabel] = useState(row.label ?? '');
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>IP / network range</Label>
        <Input value={cidr} onChange={(e) => setCidr(e.target.value)} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={saving || !cidr.trim()} onClick={() => onSave({ cidr, label })}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}
