'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Gauge,
  FileText,
  Pencil,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useTenant } from './hooks';
import { PharmacyDetailUsersTab } from './pharmacy-detail-users-tab';
import { PharmacyNetworkAccessPanel } from './pharmacy-network-access-panel';
import { PharmacyEntitlementPanel } from '@/features/entitlements/pharmacy-entitlement-panel';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorState } from '@/components/shared/states';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageSkeleton } from '@/components/ui/skeleton';
import { BrandingImageCard } from '@/features/settings/branding-image-card';

type DetailTab = 'information' | 'users' | 'network' | 'subscription' | 'documents';

interface PharmacyDetailViewProps {
  tenantId: string;
  onBack: () => void;
}

const tabs: { id: DetailTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'information', label: 'Information', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'network', label: 'Network access', icon: ShieldCheck },
  { id: 'subscription', label: 'Allowance', icon: Gauge },
  { id: 'documents', label: 'Documents', icon: FileText },
];

function InfoField({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="border-b border-border py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm font-medium', highlight && 'text-primary')}>{value}</p>
    </div>
  );
}

export function PharmacyDetailView({ tenantId, onBack }: PharmacyDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('information');
  const [showDelete, setShowDelete] = useState(false);
  const [faxNumber, setFaxNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const queryClient = useQueryClient();
  const { data: tenant, isLoading, isError, refetch } = useTenant(tenantId);

  useEffect(() => {
    setFaxNumber(tenant?.faxNumber ?? '');
    setPhone(tenant?.phone ?? '');
    setAddress(tenant?.address ?? '');
  }, [tenant?.faxNumber, tenant?.phone, tenant?.address]);

  const suspendMutation = useMutation({
    mutationFn: () =>
      api.patch(`/tenants/${tenantId}/status`, {
        status: tenant?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Pharmacy status updated successfully');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const contactMutation = useMutation({
    mutationFn: () =>
      api.patch(`/tenants/${tenantId}`, {
        faxNumber: faxNumber.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Pharmacy contact details saved');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (isLoading) return <PageSkeleton />;
  if (isError || !tenant) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2">
      {activeTab !== 'network' && (
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-primary">{tenant.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={tenant.status} />
              <span className="text-sm text-muted-foreground">Pharmacy ID: {tenant.slug}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to pharmacies
        </button>
      </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-foreground bg-primary text-primary-foreground shadow-sm [&_svg]:text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'network' ? (
        <PharmacyNetworkAccessPanel tenantId={tenantId} pharmacyName={tenant.name} />
      ) : (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {activeTab === 'information' && (
          <>
            <div className="grid gap-x-8 sm:grid-cols-2">
              <InfoField label="Pharmacy ID" value={tenant.slug} />
              <InfoField label="Status" value={<StatusBadge status={tenant.status} />} />
              <InfoField label="Pharmacy owner" value={tenant.admin?.fullName ?? '—'} />
              <InfoField label="Owner email" value={tenant.admin?.email ?? '—'} highlight />
              <InfoField label="Total users" value={String(tenant.counts.totalUsers)} />
              <InfoField label="Pharmacists" value={String(tenant.counts.pharmacists)} />
              <InfoField label="Created on" value={formatDate(tenant.createdAt)} />
              <InfoField
                label="Email verified on"
                value={tenant.admin?.emailVerifiedAt ? formatDate(tenant.admin.emailVerifiedAt) : '—'}
              />
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <BrandingImageCard
                kind="logo"
                title="Pharmacy profile image"
                description="Upload the pharmacy logo once. It is placed on every pharmacist prescription PDF in consultation Step 6."
                filePath={`/branding/tenants/${tenantId}/logo/file`}
                uploadPath={`/branding/tenants/${tenantId}/logo`}
                hasImage={tenant.hasLogo}
                embedded
                onChanged={() => {
                  queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
                  queryClient.invalidateQueries({ queryKey: ['tenants'] });
                }}
              />
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <h3 className="text-sm font-semibold text-foreground">Document contact details</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Phone and address appear in the Patient Care Summary Questions? section
                as a structured block: Call us at, Tel, then pharmacy name and address.
                Fax and pharmacy name appear under Kind regards on pharmacist communications
                to primary care providers, including PDF and fax copies.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pharmacy-fax">Pharmacy fax</Label>
                  <Input
                    id="pharmacy-fax"
                    type="tel"
                    value={faxNumber}
                    onChange={(e) => setFaxNumber(e.target.value)}
                    placeholder="e.g. 780-555 0100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pharmacy-phone">Pharmacy phone</Label>
                  <Input
                    id="pharmacy-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 780-555 0199"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pharmacy-address">Pharmacy address</Label>
                  <Textarea
                    id="pharmacy-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 123 Main Street, Edmonton, AB T5J 0K1"
                    rows={2}
                    maxLength={240}
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                type="button"
                onClick={() => contactMutation.mutate()}
                disabled={contactMutation.isPending}
              >
                {contactMutation.isPending ? 'Saving…' : 'Save contact details'}
              </Button>
            </div>

            {tenant.admin && (
              <div className="mt-6 border-t border-border pt-6">
                <Link
                  href={`/super-admin/pharmacist-admins/${tenant.admin.id}`}
                  className={buttonVariants()}
                >
                  <UserCog className="h-4 w-4" />
                  Manage owner
                </Link>
              </div>
            )}
          </>
        )}

        {activeTab === 'users' && (
          <PharmacyDetailUsersTab
            tenantId={tenantId}
            pharmacyName={tenant.name}
            users={tenant.users}
          />
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-4">
            <Link
              href={`/super-admin/usage?tenant=${tenantId}`}
              className="inline-flex text-sm font-semibold text-primary hover:underline"
            >
              Open pharmacy usage →
            </Link>
            <PharmacyEntitlementPanel tenantId={tenantId} />
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="py-12 text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="font-medium">Documents</p>
            <p className="mt-1 text-sm">Coming soon — we're working on this.</p>
          </div>
        )}
      </div>
      )}

      {activeTab === 'information' && (
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link
            href={`/super-admin/pharmacist-admins/${tenant.admin?.id}/edit`}
            className={buttonVariants()}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <Button variant="destructive" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
          {tenant.admin && (
            <Button
              variant="warning"
              onClick={() => suspendMutation.mutate()}
              disabled={suspendMutation.isPending}
            >
              {tenant.status === 'ACTIVE' ? 'Suspend pharmacy' : 'Reactivate pharmacy'}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Remove pharmacy?"
        description="Pharmacy removal isn't available in the app yet. Please contact platform support if you need a pharmacy removed."
        confirmLabel="Got it"
        onConfirm={() => setShowDelete(false)}
      />
    </div>
  );
}
