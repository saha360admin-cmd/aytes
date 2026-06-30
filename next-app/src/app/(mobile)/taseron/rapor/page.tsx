"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Açık", in_progress: "Devam Ediyor", resolved: "Çözüldü", cancelled: "İptal",
};

const STATUS_BADGE: Record<string, string> = {
  open:        "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved:    "bg-emerald-100 text-emerald-700",
  cancelled:   "bg-gray-100 text-gray-500",
};

interface ServiceRequest {
  id: string;
  department_id: string;
  contractor_name: string;
  contractor_ticket_no: string | null;
  description: string;
  location_detail: string | null;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  department: { id: string; name: string } | null;
}

interface DeptSummary { id: string; name: string; open: number; in_progress: number; total_active: number; }

export default function TaseronRaporPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ServiceRequest[]>([]);
  const [filtered, setFiltered] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    supabase
      .from("service_requests")
      .select(`id, department_id, contractor_name, contractor_ticket_no, description, location_detail, status, opened_at, resolved_at, department:departments(id,name)`)
      .order("opened_at", { ascending: false })
      .then(({ data }) => {
        const d = (data || []) as ServiceRequest[];
        setRecords(d);
        setFiltered(d);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let result = [...records];
    if (dateFrom) result = result.filter(r => r.opened_at >= dateFrom);
    if (dateTo)   result = result.filter(r => r.opened_at <= dateTo + "T23:59:59");
    setFiltered(result);
  }, [dateFrom, dateTo, records]);

  const deptSummaryMap = new Map<string, DeptSummary>();
  for (const r of filtered) {
    if (!deptSummaryMap.has(r.department_id)) {
      deptSummaryMap.set(r.department_id, { id: r.department_id, name: r.department?.name ?? "Bilinmiyor", open: 0, in_progress: 0, total_active: 0 });
    }
    const e = deptSummaryMap.get(r.department_id)!;
    if (r.status === "open")        { e.open++;        e.total_active++; }
    if (r.status === "in_progress") { e.in_progress++; e.total_active++; }
  }
  const deptSummary = Array.from(deptSummaryMap.values()).sort((a, b) => b.total_active - a.total_active);

  const totalOpen        = filtered.filter(r => r.status === "open").length;
  const totalInProgress  = filtered.filter(r => r.status === "in_progress").length;
  const totalResolved    = filtered.filter(r => r.status === "resolved").length;
  const totalCancelled   = filtered.filter(r => r.status === "cancelled").length;

  function downloadCSV() {
    const BOM = "﻿";
    const header = ["Tarih", "Birim", "Lokasyon", "Taşeron", "Bilet No", "Açıklama", "Durum"];
    const rows = filtered.map(r => [
      formatDate(r.opened_at),
      r.department?.name ?? "",
      r.location_detail ?? "",
      r.contractor_name,
      r.contractor_ticket_no ?? "",
      r.description.replace(/"/g, '""'),
      STATUS_LABELS[r.status] ?? r.status,
    ]);
    const csv = BOM + [header, ...rows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = `taseron-rapor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.push("/taseron")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-lg leading-tight">Taşeron Raporu</h1>
          <p className="text-white/70 text-xs">{filtered.length} kayıt</p>
        </div>
        <button onClick={downloadCSV}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">download</span>
        </button>
      </header>

      <div className="px-4 pt-4 space-y-4 pb-4">

        {/* Tarih filtresi */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tarih Aralığı</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500">Başlangıç</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500">Bitiş</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs font-bold text-gray-400 underline">
              Filtreyi Temizle
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
          </div>
        ) : (
          <>
            {/* Özet sayaçlar */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Açık",         count: totalOpen,       border: "border-l-amber-400",   text: "text-amber-700"   },
                { label: "Devam Ediyor", count: totalInProgress, border: "border-l-blue-400",    text: "text-blue-700"    },
                { label: "Çözüldü",      count: totalResolved,   border: "border-l-emerald-400", text: "text-emerald-700" },
                { label: "İptal",        count: totalCancelled,  border: "border-l-gray-300",    text: "text-gray-500"    },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-2xl shadow-sm border-l-4 p-4 ${s.border}`}>
                  <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
                  <p className="text-xs font-semibold text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Birim bazında özet */}
            {deptSummary.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3.5 border-b border-gray-50">
                  <h2 className="font-bold text-gray-800 text-sm">Birim Bazında Aktif Kayıtlar</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Açık + Devam Eden</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {deptSummary.map(dept => (
                    <div key={dept.id} className="flex items-center justify-between px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800 flex-1 truncate">{dept.name}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {dept.open > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                            {dept.open} açık
                          </span>
                        )}
                        {dept.in_progress > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                            {dept.in_progress} devam
                          </span>
                        )}
                        <span className="text-sm font-bold text-gray-600 min-w-[24px] text-right">
                          {dept.total_active}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tüm kayıtlar toggle */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => setShowDetail(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50 transition-all">
                <div>
                  <p className="font-bold text-gray-800 text-sm text-left">Tüm Kayıtlar</p>
                  <p className="text-xs text-gray-400 mt-0.5">{filtered.length} kayıt</p>
                </div>
                <span className={`material-symbols-outlined text-gray-400 transition-transform ${showDetail ? "rotate-180" : ""}`}>
                  expand_more
                </span>
              </button>

              {showDetail && (
                <div className="border-t border-gray-50 divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <div className="py-10 text-center">
                      <span className="material-symbols-outlined text-gray-300 text-[36px] block mb-2">inbox</span>
                      <p className="text-sm text-gray-400">Bu aralıkta kayıt yok</p>
                    </div>
                  ) : (
                    filtered.map(r => (
                      <div key={r.id} className="px-4 py-3 space-y-1"
                        onClick={() => router.push(`/taseron/${r.id}`)}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 flex-1 line-clamp-1">{r.description}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 font-semibold">{r.department?.name}</span>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-gray-500">{r.contractor_name}</span>
                          {r.contractor_ticket_no && (
                            <>
                              <span className="text-gray-200">·</span>
                              <span className="text-xs font-mono text-gray-400">#{r.contractor_ticket_no}</span>
                            </>
                          )}
                        </div>
                        {r.location_detail && (
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-gray-300 text-[12px]">location_on</span>
                            <span className="text-xs text-gray-400">{r.location_detail}</span>
                          </div>
                        )}
                        <p className="text-xs text-gray-400">{formatDate(r.opened_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
