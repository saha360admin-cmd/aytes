"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Incident } from "@/lib/types";

interface IncidentWithMeta {
  id: string;
  department_id: string;
  reported_by: string;
  type: string;
  severity: string;
  title: string | null;
  description: string;
  location: string | null;
  status: "open" | "in_progress" | "closed";
  created_at: string;
  reporter?: { full_name: string } | null;
  departments?: { name: string; slug: string } | null;
}

const severityLabel: Record<string, string> = { low: "Düşük", medium: "Orta", high: "Yüksek" };
const severityBorder: Record<string, string> = { low: "border-l-[#43A047]", medium: "border-l-[#FF9800]", high: "border-l-[#EF5350]" };
const severityBadge: Record<string, string> = { low: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", high: "bg-red-100 text-red-700" };
const statusLabel: Record<string, string> = { open: "Açık", in_progress: "İşlemde", closed: "Kapatıldı" };
const statusBadge: Record<string, string> = { open: "bg-red-100 text-red-700", in_progress: "bg-amber-100 text-amber-700", closed: "bg-gray-100 text-gray-500" };
const typeLabel: Record<string, string> = { fire: "Yangın", theft: "Hırsızlık", suspicious: "Şüpheli", maintenance: "Teknik Arıza", other: "Diğer" };

const deptIcons: Record<string, string> = { idari: "admin_panel_settings", guvenlik: "security", teknik: "engineering", temizlik: "cleaning_services" };

type StatusTab = "all" | "open" | "in_progress" | "closed";
type SeverityFilter = "all" | "low" | "medium" | "high";

export default function RaporlarPage() {
  const { personnel } = useAuth();
  const router = useRouter();
  const [incidents, setIncidents] = useState<IncidentWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>("open");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isManager = personnel?.role === "admin" || personnel?.role === "supervisor";

  useEffect(() => {
    if (!personnel) return;
    loadIncidents();
  }, [personnel, statusTab]);

  async function loadIncidents() {
    if (!personnel) return;
    setLoading(true);
    let query = supabase
      .from("incidents")
      .select("*, departments:department_id(name, slug), reporter:reported_by(full_name)")
      .eq("department_id", personnel.department_id)
      .order("created_at", { ascending: false });

    if (statusTab !== "all") {
      if (statusTab === "open") {
        query = query.in("status", ["open", "in_progress"]);
      } else {
        query = query.eq("status", statusTab);
      }
    }

    const { data } = await query;
    setIncidents((data || []) as IncidentWithMeta[]);
    setLoading(false);
  }

  async function updateStatus(id: string, status: Incident["status"]) {
    if (!isManager) return;
    setUpdatingId(id);
    await supabase.from("incidents").update({ status }).eq("id", id);
    setIncidents((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setUpdatingId(null);
  }

  function timeAgo(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return "az önce";
    if (diff < 60) return `${diff} dk önce`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h} sa önce`;
    return `${Math.floor(h / 24)} gün önce`;
  }

  const filtered = incidents.filter((r) => {
    const matchSev = severityFilter === "all" || r.severity === severityFilter;
    const matchSearch = search === "" ||
      (r.title || r.type).toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.reporter?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.location?.toLowerCase().includes(search.toLowerCase());
    return matchSev && matchSearch;
  });

  const openCount = incidents.filter((r) => r.status === "open").length;

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Header */}
      <header className="sticky top-0 z-50 w-full h-16 flex items-center justify-between px-4"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>assignment</span>
          <h1 className="text-lg font-bold text-white">Raporlar</h1>
        </div>
        {openCount > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{openCount} Açık</span>
        )}
      </header>

      {/* Hızlı eylem bandı */}
      <div className="px-4 pb-4 pt-3" style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <Link href="/olay-bildir"
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/20 text-white font-bold text-sm active:scale-95 transition-all border border-white/30">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
          Yeni Olay Raporu Oluştur
        </Link>
      </div>
      <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-4 space-y-4">

        {/* Arama */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rapor, kişi veya konum ara..."
            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none shadow-sm"
          />
        </div>

        {/* Durum Sekmeleri */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm gap-1">
          {(["all", "open", "in_progress", "closed"] as StatusTab[]).map((s) => (
            <button key={s}
              onClick={() => setStatusTab(s)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${statusTab === s ? "text-white shadow-sm" : "text-gray-400"}`}
              style={statusTab === s ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
              {s === "all" ? "Tümü" : s === "open" ? "Açık" : s === "in_progress" ? "İşlemde" : "Kapalı"}
            </button>
          ))}
        </div>

        {/* Önem Filtresi */}
        <div className="flex gap-2">
          {(["all", "high", "medium", "low"] as SeverityFilter[]).map((sv) => (
            <button key={sv}
              onClick={() => setSeverityFilter(sv)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                severityFilter === sv
                  ? sv === "all" ? "bg-[#3949AB] text-white border-[#3949AB]"
                    : sv === "high" ? "bg-red-500 text-white border-red-500"
                    : sv === "medium" ? "bg-amber-500 text-white border-amber-500"
                    : "bg-emerald-500 text-white border-emerald-500"
                  : "bg-white text-gray-500 border-gray-200"
              }`}>
              {sv === "all" ? "Tüm Önem" : severityLabel[sv]}
            </button>
          ))}
        </div>

        {/* Rapor Listesi */}
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <span className="material-symbols-outlined text-gray-300 text-[48px] block mb-3">assignment</span>
            <p className="text-gray-400 font-semibold">Bu filtrede rapor yok</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <div key={r.id}
                  className={`bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden transition-all ${severityBorder[r.severity] || "border-l-gray-300"} ${r.status === "closed" ? "opacity-60" : ""}`}>
                  {/* Kart üstü — tıklanabilir */}
                  <button className="w-full p-4 text-left active:bg-gray-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm truncate">{r.title || typeLabel[r.type] || r.type}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {r.reporter?.full_name || "Bilinmiyor"} • {timeAgo(r.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge[r.status]}`}>
                          {statusLabel[r.status]}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityBadge[r.severity] || "bg-gray-100 text-gray-500"}`}>
                          {severityLabel[r.severity] || r.severity}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 line-clamp-2">{r.description}</p>

                    <div className="flex items-center gap-3 mt-2">
                      {r.location && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <span className="material-symbols-outlined text-[13px]">location_on</span>
                          {r.location}
                        </span>
                      )}
                      {r.departments && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <span className="material-symbols-outlined text-[13px]">{deptIcons[r.departments.slug] || "business"}</span>
                          {r.departments.name}
                        </span>
                      )}
                      <span className="material-symbols-outlined text-[16px] text-gray-300 ml-auto">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                    </div>
                  </button>

                  {/* Genişletilmiş bölüm — yönetici durum güncelleme */}
                  {isExpanded && isManager && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Durum Güncelle</p>
                      <div className="flex gap-2">
                        {(["open", "in_progress", "closed"] as Incident["status"][]).map((st) => (
                          <button key={st}
                            onClick={() => updateStatus(r.id, st)}
                            disabled={r.status === st || updatingId === r.id}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                              r.status === st
                                ? st === "open" ? "bg-red-500 text-white"
                                  : st === "in_progress" ? "bg-amber-500 text-white"
                                  : "bg-gray-400 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}>
                            {updatingId === r.id ? "..." : statusLabel[st]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Özet istatistik */}
        {!loading && incidents.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pb-4">
            {[
              { label: "Açık", count: incidents.filter(r => r.status === "open").length, color: "text-red-600", bg: "bg-red-50 border-red-100" },
              { label: "İşlemde", count: incidents.filter(r => r.status === "in_progress").length, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
              { label: "Kapalı", count: incidents.filter(r => r.status === "closed").length, color: "text-gray-500", bg: "bg-gray-50 border-gray-100" },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl p-3 text-center border ${s.bg}`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs font-semibold text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
