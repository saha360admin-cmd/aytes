"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_SORT: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, cancelled: 3 };

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Açık", className: "bg-amber-100 text-amber-700" },
  in_progress: { label: "Devam Ediyor", className: "bg-blue-100 text-blue-700" },
  resolved: { label: "Çözüldü", className: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "İptal", className: "bg-gray-100 text-gray-500" },
};

const TABS = [
  { key: "active", label: "Aktif" },
  { key: "resolved", label: "Çözüldü" },
  { key: "cancelled", label: "İptal" },
  { key: "all", label: "Hepsi" },
] as const;
type TabKey = typeof TABS[number]["key"];

interface ServiceRequestRow {
  id: string;
  department_id: string;
  contractor_name: string;
  contractor_ticket_no: string | null;
  description: string;
  location_detail: string | null;
  status: "open" | "in_progress" | "resolved" | "cancelled";
  opened_at: string;
  department: { id: string; name: string } | null;
}

export default function WebTaseronPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [records, setRecords] = useState<ServiceRequestRow[]>([]);
  const [tab, setTab] = useState<TabKey>("active");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data, error: qError } = await supabase
        .from("service_requests")
        .select(`id, department_id, contractor_name, contractor_ticket_no, description, location_detail, status, opened_at, department:departments(id, name)`)
        .order("opened_at", { ascending: false });

      if (qError) throw qError;

      const sorted = ((data || []) as unknown as ServiceRequestRow[]).sort(
        (a, b) => (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99)
      );
      setRecords(sorted);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const filtered = records.filter(r => {
    if (tab === "active") return r.status === "open" || r.status === "in_progress";
    if (tab === "resolved") return r.status === "resolved";
    if (tab === "cancelled") return r.status === "cancelled";
    return true;
  });

  const activeCount = records.filter(r => r.status === "open" || r.status === "in_progress").length;

  const columns: DataTableColumn[] = [
    { key: "department", label: "Departman", sortable: true },
    { key: "description", label: "Açıklama" },
    { key: "contractor", label: "Taşeron" },
    { key: "ticket", label: "Bilet No" },
    { key: "statusBadge", label: "Durum" },
    { key: "date", label: "Tarih", sortable: true },
  ];

  const tableData = filtered.map(r => {
    const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.open;
    const statusBadge: DataTableCell = {
      csv: badge.label,
      display: (
        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${badge.className}`}>
          {badge.label}
        </span>
      ),
    };
    return {
      department: r.department?.name ?? "Bilinmiyor",
      description: r.description.length > 70 ? r.description.slice(0, 70) + "…" : r.description,
      contractor: r.contractor_name,
      ticket: r.contractor_ticket_no ? `#${r.contractor_ticket_no}` : "—",
      statusBadge,
      date: formatDate(r.opened_at),
    };
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-display text-headline-lg text-on-background mb-xs">Taşeron Takip</h1>
        <p className="text-on-surface-variant">
          {activeCount > 0 ? `${activeCount} açık/devam eden kayıt` : "Tüm kayıtlar çözümlendi"}
        </p>
      </div>

      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              tab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-error font-semibold">Veriler yüklenemedi. Sayfayı yenileyin.</p>
      ) : (
        <DataTable columns={columns} data={tableData} loading={loading} exportable />
      )}
    </div>
  );
}
