'use client';

import Link from 'next/link';
import { Building2, Plus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AdminSection } from './admin-management-page';

const sections: { id: AdminSection; label: string; icon: typeof Building2 }[] = [
  { id: 'pharmacies', label: 'Manage Pharmacies', icon: Building2 },
  { id: 'users', label: 'Manage Users', icon: Users },
];

interface ManagementSectionBarProps {
  section: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

export function ManagementSectionBar({ section, onSectionChange }: ManagementSectionBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex flex-wrap gap-2">
        {sections.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-foreground bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      <Link href="/super-admin/pharmacist-admins/create">
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add pharmacy
        </Button>
      </Link>
    </div>
  );
}
