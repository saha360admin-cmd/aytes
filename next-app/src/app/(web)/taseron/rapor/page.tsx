"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Açık",
  in_progress: "Devam Ediyor",
  resolved: "Çözüldü",
  cancelled: "İptal",
};

const STATUS_BADGE: Record<string, string> = {
  open:        "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved:    "bg-green-100 text-green-700",
  cancelled:   "bg-gray-100 text-gray-500",
};

interface Department { id: string; name: string; }

interface ServiceRequest {
  id: string;
  department_id: string;
  contractor_name: string;
  contractor_ticket_no: string | null;
  description: string;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  department: Department | null;
}

interface DeptSummary {
  id: string;
  name: string;
  open: number;
  in_progress: number;
  total_active: number;
}

export default function TaseronRaporPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ServiceRequest[]>([]);
  const [filtered, setFiltered] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    supabase
      .from("service_requests")
      .select(`
        id, department_id, contractor_name, contractor_ticket_no,
        description, status, opened_at, resolved_at,
        department:departments(id, name)
      `)
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
    if (dateTo) {
      const toEnd = dateTo + "T23:59:59";
      result = result.filter(r => r.opened_at <= toEnd);
    }
    setFiltered(result);
  }, [dateFrom, dateTo, records]);

  // Departman bazında özet
  const deptSummaryMap = new Map<string, DeptSummary>();
  for (const r of filtered) {
    const deptId = r.department_id;
    const deptName = r.department?.name ?? "Bilinmiyor";
    if (!deptSummaryMap.has(deptId)) {
      deptSummaryMap.set(deptId, { id: deptId, name: deptName, open: 0, in_progress: 0, total_active: 0 });
    }
    const entry = deptSummaryMap.get(deptId)!;
    if (r.status === "open") { entry.open++; entry.total_active++; }
    if (r.status === "in_progress") { entry.in_progress++; entry.total_active++; }
  }
  const deptSummary = Array.from(deptSummaryMap.values()).sort((a, b) => b.total_active - a.total_active);

  function downloadCSV() {
    const BOM = "﻿";
    const header = ["Tarih", "Birim", "Taşeron", "Bilet No", "Açıklama", "Durum"];
    const rows = filtered.map(r => [
      formatDate(r.opened_at),
      r.department?.name ?? "",
      r.contractor_name,
      r.contractor_ticket_no ?? "",
      r.description.replace(/"/g, '""'),
      STATUS_LABELS[r.status] ?? r.status,
    ]);

    const csvContent = BOM + [header, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `taseron-rapor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalOpen = filtered.filter(r => r.status === "open").length;
  const totalInProgress = filtered.filter(r => r.status === "in_progress").length;
  const totalResolved = filtered.filter(r => r.status === "resolved").length;
  const totalCancelled = filtered.filter(r => r.status === "cancelled").length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 print:py-4 print:px-0">
      {/* Sayfa başlığı */}
      <div className="flex items-center justify-between mb-6 print:mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/taseron")}
            className="p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-gray-500 print:hidden"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Taşeron Takip Raporu</h1>
            <p className="text-sm text-gray-500 print:text-gray-400">
              {filtered.length} kayıt · Oluşturuldu: {formatDate(new Date().toISOString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            CSV İndir
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            Yazdır
          </button>
        </div>
      </div>

      {/* Tarih filtresi */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex gap-4 items-end print:hidden">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400">Başlangıç</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400">Bitiş</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 underline"
          >
            Temizle
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-indigo-600 text-[40px]">progress_activity</span>
        </div>
      ) : (
        <>
          {/* Özet sayaçlar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Açık", count: totalOpen, bg: "bg-amber-100", text: "text-amber-700", border: "border-l-amber-400" },
              { label: "Devam Ediyor", count: totalInProgress, bg: "bg-blue-100", text: "text-blue-700", border: "border-l-blue-400" },
              { label: "Çözüldü", count: totalResolved, bg: "bg-green-100", text: "text-green-700", border: "border-l-green-400" },
              { label: "İptal", count: totalCancelled, bg: "bg-gray-100", text: "text-gray-500", border: "border-l-gray-300" },
            ].map(s => (
              <div key={s.label} className={`bg-white rounded-xl shadow-sm border-l-4 p-4 ${s.border}`}>
                <p className="text-2xl font-bold text-gray-800">{s.count}</p>
                <p className="text-xs font-semibold text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Departman bazında özet tablo */}
          {deptSummary.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-800">Birim Bazında Aktif Kayıtlar</h2>
                <p className="text-xs text-gray-400 mt-0.5">Açık + Devam Eden kayıtlar</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Birim</th>
                    <th className="px-5 py-3 text-xs font-bold text-amber-600 uppercase tracking-wide text-center">Açık</th>
                    <th className="px-5 py-3 text-xs font-bold text-blue-600 uppercase tracking-wide text-center">Devam Ediyor</th>
                    <th className="px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wide text-center">Toplam Aktif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {deptSummary.map(dept => (
                    <tr key={dept.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-800">{dept.name}</td>
                      <td className="px-5 py-3 text-center">
                        {dept.open > 0
                          ? <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{dept.open}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {dept.in_progress > 0
                          ? <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{dept.in_progress}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-center font-bold text-gray-700">{dept.total_active}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detay tablo */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">Tüm Kayıtlar</h2>
              <p className="text-xs text-gray-400 mt-0.5">{filtered.length} kayıt</p>
            </div>
            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <span className="material-symbols-outlined text-gray-300 text-[40px] block mb-2">inbox</span>
                <p className="text-sm text-gray-400">Bu tarih aralığında kayıt bulunamadı.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Tarih</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Birim</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Taşeron</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Bilet No</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Açıklama</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{formatDate(r.opened_at)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">{r.department?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.contractor_name}</td>
                        <td className="px-4 py-3 font-mono text-gray-500 text-xs">{r.contractor_ticket_no ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs">
                          <span className="line-clamp-2">{r.description}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
