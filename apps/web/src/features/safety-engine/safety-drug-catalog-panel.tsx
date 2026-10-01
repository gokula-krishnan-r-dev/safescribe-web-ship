'use client';

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/shared/pagination';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { useDrugCatalog, useDrugClasses } from './hooks';

const PAGE_SIZE = 15;

export function SafetyDrugCatalogPanel() {
  const [classPage, setClassPage] = useState(1);
  const [drugPage, setDrugPage] = useState(1);
  const [classSearch, setClassSearch] = useState('');
  const [drugSearch, setDrugSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const classes = useDrugClasses({ page: classPage, limit: PAGE_SIZE, search: classSearch || undefined });
  const drugs = useDrugCatalog({
    page: drugPage,
    limit: PAGE_SIZE,
    search: drugSearch || undefined,
    className: classFilter || undefined,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Drug class taxonomy</h3>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classes…"
              className="pl-8 h-9"
              value={classSearch}
              onChange={(e) => { setClassSearch(e.target.value); setClassPage(1); }}
            />
          </div>
        </div>
        {classes.isError ? (
          <ErrorState title="Could not load drug classes" onRetry={() => classes.refetch()} />
        ) : classes.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !classes.data?.items.length ? (
          <EmptyState title="No drug classes" description="Import drug_classes sheet from Excel template." />
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2.5 text-left font-medium">Class</th>
                  <th className="p-2.5 text-left font-medium">Parent</th>
                  <th className="p-2.5 text-left font-medium">Group</th>
                  <th className="p-2.5 text-left font-medium">Risk tags</th>
                </tr>
              </thead>
              <tbody>
                {classes.data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border/60 hover:bg-muted/30 cursor-pointer"
                    onClick={() => { setClassFilter(row.className); setDrugPage(1); }}
                  >
                    <td className="p-2.5 font-medium">{row.className}</td>
                    <td className="p-2.5 text-muted-foreground">{row.parentClass ?? '—'}</td>
                    <td className="p-2.5">{row.therapeuticGroup ?? '—'}</td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.riskTags.length
                          ? row.riskTags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                            ))
                          : '—'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={classPage}
              totalPages={classes.data.totalPages}
              total={classes.data.total}
              limit={PAGE_SIZE}
              onPageChange={setClassPage}
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Drug catalog</h3>
            {classFilter ? (
              <Badge variant="outline" className="cursor-pointer" onClick={() => setClassFilter('')}>
                Class: {classFilter} ×
              </Badge>
            ) : null}
          </div>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drugs…"
              className="pl-8 h-9"
              value={drugSearch}
              onChange={(e) => { setDrugSearch(e.target.value); setDrugPage(1); }}
            />
          </div>
        </div>
        {drugs.isError ? (
          <ErrorState title="Could not load drugs" onRetry={() => drugs.refetch()} />
        ) : drugs.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !drugs.data?.items.length ? (
          <EmptyState title="No drugs in catalog" description="Import drugs sheet from Excel template." />
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2.5 text-left font-medium">Drug</th>
                  <th className="p-2.5 text-left font-medium">Class</th>
                  <th className="p-2.5 text-left font-medium">Ingredient</th>
                  <th className="p-2.5 text-left font-medium">Brands</th>
                  <th className="p-2.5 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {drugs.data.items.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="p-2.5 font-medium">{row.drugName}</td>
                    <td className="p-2.5">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => { setClassFilter(row.className); setDrugPage(1); }}
                      >
                        {row.className}
                      </button>
                    </td>
                    <td className="p-2.5">{row.ingredient ?? '—'}</td>
                    <td className="p-2.5 text-muted-foreground">
                      {row.commonBrands.length ? row.commonBrands.join(', ') : '—'}
                    </td>
                    <td className="p-2.5 text-muted-foreground">{row.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={drugPage}
              totalPages={drugs.data.totalPages}
              total={drugs.data.total}
              limit={PAGE_SIZE}
              onPageChange={setDrugPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
