'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key:       string;
  label:     string;
  sortable?: boolean;
  render?:   (value: unknown, row: T) => ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns:     Column<T>[];
  data:        T[];
  onRowClick?: (row: T) => void;
  className?:  string;
}

type SortDir = 'asc' | 'desc';

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey] as string | number | boolean | null | undefined;
        const bv = b[sortKey] as string | number | boolean | null | undefined;
        const cmp = (av ?? '') < (bv ?? '') ? -1 : (av ?? '') > (bv ?? '') ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border-subtle', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface">
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium text-text-secondary',
                  col.sortable && [
                    'cursor-pointer select-none transition-colors hover:text-text-primary',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                  ],
                )}
                tabIndex={col.sortable ? 0 : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                onKeyDown={col.sortable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col.key); }
                } : undefined}
              >
                <div className="flex items-center gap-1.5">
                  {col.label}
                  {col.sortable && (
                    sortKey === col.key ? (
                      sortDir === 'asc'
                        ? <ArrowUp   size={12} className="shrink-0 text-accent" />
                        : <ArrowDown size={12} className="shrink-0 text-accent" />
                    ) : (
                      <ChevronsUpDown size={12} className="shrink-0 text-text-tertiary" />
                    )
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-text-tertiary"
              >
                No data
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'border-t border-border-subtle',
                  onRowClick && [
                    'cursor-pointer transition-colors hover:bg-surface-raised',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                  ],
                )}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === 'Enter') onRowClick(row);
                } : undefined}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3 text-text-primary">
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
