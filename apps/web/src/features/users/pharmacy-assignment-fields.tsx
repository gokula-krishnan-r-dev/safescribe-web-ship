'use client';

import { useMemo, useState, type ComponentType } from 'react';
import { Building2, PlusCircle, Search } from 'lucide-react';
import { useTenants } from '@/features/admin-management/hooks';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type PharmacyAssignmentMode = 'new' | 'existing';

interface PharmacyAssignmentFieldsProps {
  mode: 'create' | 'edit';
  assignmentMode: PharmacyAssignmentMode;
  onAssignmentModeChange: (mode: PharmacyAssignmentMode) => void;
  tenantId: string;
  onTenantIdChange: (tenantId: string) => void;
  organizationName: string;
  onOrganizationNameChange: (name: string) => void;
  organizationFax?: string;
  onOrganizationFaxChange?: (fax: string) => void;
  errors?: {
    tenantId?: string;
    organizationName?: string;
    organizationFax?: string;
  };
}

export function PharmacyAssignmentFields({
  mode,
  assignmentMode,
  onAssignmentModeChange,
  tenantId,
  onTenantIdChange,
  organizationName,
  onOrganizationNameChange,
  organizationFax,
  onOrganizationFaxChange,
  errors,
}: PharmacyAssignmentFieldsProps) {
  const isCreate = mode === 'create';
  const { data: tenants, isLoading } = useTenants();
  const [search, setSearch] = useState('');

  const pharmacyOptions = useMemo(() => {
    if (!tenants) return [];
    const query = search.trim().toLowerCase();
    return tenants
      .filter((tenant) => {
        if (!query) return true;
        return (
          tenant.name.toLowerCase().includes(query) ||
          tenant.slug.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tenant) => ({
        value: tenant.id,
        label: `${tenant.name} · ${tenant.status === 'ACTIVE' ? 'Active' : 'Suspended'}${tenant.admin ? ` · ${tenant.admin.fullName}` : ''}`,
      }));
  }, [tenants, search]);

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-sm font-semibold">Pharmacy assignment</Label>
          <p className="text-xs text-muted-foreground">
            {isCreate
              ? 'Set up a new pharmacy or link this admin to an existing one.'
              : 'Change which pharmacy this admin is linked to.'}
          </p>
        </div>
      </div>

      {isCreate && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-background p-1 shadow-sm ring-1 ring-border/60">
          <ModeButton
            active={assignmentMode === 'new'}
            onClick={() => onAssignmentModeChange('new')}
            icon={PlusCircle}
            label="New pharmacy"
            description="Register a new pharmacy"
          />
          <ModeButton
            active={assignmentMode === 'existing'}
            onClick={() => onAssignmentModeChange('existing')}
            icon={Building2}
            label="Existing pharmacy"
            description="Link to a pharmacy already on the platform"
          />
        </div>
      )}

      {isCreate && assignmentMode === 'new' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organizationName">Pharmacy name</Label>
            <Input
              id="organizationName"
              value={organizationName}
              onChange={(e) => onOrganizationNameChange(e.target.value)}
              placeholder="e.g. City Care Pharmacy, Koramangala"
            />
            {errors?.organizationName && (
              <p className="text-xs text-destructive">{errors.organizationName}</p>
            )}
            <p className="text-xs text-muted-foreground">
              After the pharmacy is created, upload a profile image on its Information tab. That logo
              appears on pharmacist prescription PDFs.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="organizationFax">Pharmacy fax</Label>
            <Input
              id="organizationFax"
              type="tel"
              value={organizationFax ?? ''}
              onChange={(e) => onOrganizationFaxChange?.(e.target.value)}
              placeholder="e.g. 780-555 0100"
            />
            <p className="text-xs text-muted-foreground">
              Shown under Kind regards on pharmacist communications to primary care providers.
            </p>
            {errors?.organizationFax && (
              <p className="text-xs text-destructive">{errors.organizationFax}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="pharmacy-search">Search pharmacies</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pharmacy-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by pharmacy name…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenantId">Pharmacy</Label>
            <Select
              id="tenantId"
              value={tenantId}
              onChange={(e) => onTenantIdChange(e.target.value)}
              disabled={isLoading}
              placeholder={isLoading ? 'Loading pharmacies…' : 'Choose a pharmacy'}
              options={pharmacyOptions}
              required
            />
            {!isLoading && pharmacyOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {search ? 'No pharmacies match your search. Try a different name.' : 'No pharmacies on the platform yet.'}
              </p>
            )}
            {errors?.tenantId && (
              <p className="text-xs text-destructive">{errors.tenantId}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-md px-3 py-2.5 text-left transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className={cn('text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
        {description}
      </span>
    </button>
  );
}
