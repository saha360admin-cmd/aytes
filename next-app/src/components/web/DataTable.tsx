"use client";

import { useState } from "react";

export interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

interface DataTableProps {
  columns: DataTableColumn[];
  data: Record<string, unknown>[];
  onSort?: (key: string, dir: "asc" | "desc") => void;
  exportable?: boolean;
  loading?: boolean;
  rowClassName?: (row: Record<string, unknown>) => string;
}

function toCsv(columns: DataTableColumn[], data: Record<string, unknown>[]) {
  const header = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const rows = data.map(row =>
    columns.map(c => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  return [header, ...rows].join("\n");
}

function downloadCsv(columns: DataTableColumn[], data: Record<string, unknown>[]) {
  const csv = toCsv(columns, data);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataTable({ columns, data, onSort, exportable, loading, rowClassName }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: DataTableColumn) {
    if (!col.sortable) return;
    const nextDir: "asc" | "desc" = sortKey === col.key && sortDir === "asc" ? "desc" : "asc";
    setSortKey(col.key);
    setSortDir(nextDir);
    onSort?.(col.key, nextDir);
  }

  return (
    <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden">
      {exportable && (
        <div className="flex justify-end px-4 py-2 border-b border-outline-variant/20">
          <button
            onClick={() => downloadCsv(columns, data)}
            disabled={loading || data.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            CSV İndir
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-container z-10">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col)}
                  className={`text-left px-4 py-3 font-semibold text-on-surface-variant whitespace-nowrap ${col.sortable ? "cursor-pointer select-none hover:text-on-surface" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      <span className="material-symbols-outlined text-[16px]">
                        {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-t border-outline-variant/10">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-surface-container animate-pulse rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-on-surface-variant">
                  Kayıt bulunamadı
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className={`border-t border-outline-variant/10 hover:bg-surface-container-low transition-colors ${rowClassName ? rowClassName(row) : ""}`}>
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-on-surface whitespace-nowrap">
                      {row[col.key] as React.ReactNode}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
