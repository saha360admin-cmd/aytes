"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Incident {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  title: string | null;
  description: string;
  location: string | null;
  status: "open" | "in_progress" | "closed";
  created_at: string;
  reporter: { full_name: string } | null;
}

const TABS = [
  { key: "open",        label: "Açık",        dot: "bg-red-500",    text: "text-red-600"     },
  { key: "in_progress", label: "İnceleniyor", dot: "bg-amber-500",  text: "text-amber-600"   },
  { key: "closed",      label: "Kapalı",      dot: "bg-gray-400",   text: "text-gray-500"    },
] as const;

type TabKey = typeof TABS[number]["key"];

const severityConfig = {
  high:   { label: "Yüksek", bg: "bg-red-100",     text: "text-red-700",     icon: "bg-red-100"     },
  medium: { label: "Orta",   bg: "bg-amber-100",   text: "text-amber-700",   icon: "bg-amber-100"   },
  low:    { label: "Düşük",  bg: "bg-emerald-100", text: "text-emerald-700", icon: "bg-emerald-100" },
};

const statusNext: Record<TabKey, { to: "in_progress" | "closed"; label: string; color: string }> = {
  open:        { to: "in_progress", label: "İncelemeye Al", color: "bg-amber-500 text-white" },
  in_progress: { to: "closed",      label: "Kapat",         color: "bg-gray-600 text-white"  },
  closed:      { to: "closed",      label: "",              color: "" },
};

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

const PAGE_SIZE = 20;

export default function OlaylarPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [tab, setTab] = useState<TabKey>("open");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    setIncidents([]);
    setPage(0);
    setHasMore(false);
    load(0);
  }, [personnel, tab]);

  async function load(pageIndex: number) {
    if (!personnel) return;
    pageIndex === 0 ? setLoading(true) : setLoadingMore(true);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("incidents")
      .select("id, type, severity, title, description, location, status, created_at, reporter:reported_by(full_name)")
      .eq("department_id", personnel.department_id)
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .range(from, to);
    const rows = (data || []) as unknown as Incident[];
    setIncidents(prev => pageIndex === 0 ? rows : [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setPage(pageIndex);
    pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
  }

  function loadMore() { load(page + 1); }

  async function updateStatus(id: string, newStatus: "in_progress" | "closed") {
    setUpdatingId(id);
    const { error } = await supabase.from("incidents").update({ status: newStatus }).eq("id", id);
    if (!error) {
      setIncidents(prev => prev.filter(i => i.id !== id));
      showToast(newStatus === "in_progress" ? "İncelemeye alındı" : "Olay kapatıldı", true);
    } else {
      showToast("İşlem başarısız", false);
    }
    setUpdatingId(null);
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-8">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-white/15 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-white text-[22px]">arrow_back</span>
        </button>
        <div>
          <h1 className="font-bold text-white text-lg leading-tight">Olaylar</h1>
          <p className="text-white/60 text-xs">Olay raporları ve takibi</p>
        </div>
        <button
          onClick={() => router.push("/olay-bildir")}
          className="ml-auto w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center active:scale-95 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">add</span>
        </button>
      </header>

      {/* Tab Bar */}
      <div className="flex bg-white shadow-sm border-b border-gray-100 sticky top-16 z-30">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 text-xs font-bold transition-all relative flex items-center justify-center gap-1.5 ${tab === t.key ? t.text : "text-gray-400"}`}>
            {tab === t.key && <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />}
            {t.label}
            {tab === t.key && <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.dot}`} />}
          </button>
        ))}
      </div>

      <main className="px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
          </div>
        ) : incidents.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3 shadow-sm mt-4">
            <span className="material-symbols-outlined text-gray-200 text-[52px]">
              {tab === "open" ? "gpp_good" : tab === "in_progress" ? "manage_search" : "task_alt"}
            </span>
            <p className="text-sm font-semibold text-gray-400">
              {tab === "open" ? "Açık olay yok" : tab === "in_progress" ? "İncelenen olay yok" : "Kapalı olay yok"}
            </p>
          </div>
        ) : (
          incidents.map(inc => {
            const sev = severityConfig[inc.severity] ?? severityConfig.low;
            const next = statusNext[tab];
            return (
              <div key={inc.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Şiddet renk şeridi */}
                <div className={`h-1 w-full ${inc.severity === "high" ? "bg-red-500" : inc.severity === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                <div className="p-4">
                  {/* Başlık + şiddet */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{inc.title || inc.type}</p>
                      <p className="text-xs text-gray-400 font-semibold mt-0.5">
                        {inc.reporter?.full_name || "Bilinmiyor"} · {timeAgo(inc.created_at)}
                        {inc.location ? ` · ${inc.location}` : ""}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${sev.bg} ${sev.text}`}>
                      {sev.label}
                    </span>
                  </div>

                  {/* Açıklama */}
                  {inc.description && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
                      {inc.description}
                    </p>
                  )}

                  {/* Konum */}
                  {inc.location && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="material-symbols-outlined text-gray-400 text-[14px]">location_on</span>
                      <span className="text-xs text-gray-500 font-semibold">{inc.location}</span>
                    </div>
                  )}

                  {/* Aksiyon butonu */}
                  {tab !== "closed" && next.label && (
                    <button
                      onClick={() => updateStatus(inc.id, next.to)}
                      disabled={updatingId === inc.id}
                      className={`w-full h-10 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 ${next.color}`}>
                      {updatingId === inc.id
                        ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[16px]">{tab === "open" ? "manage_search" : "task_alt"}</span>}
                      {next.label}
                    </button>
                  )}

                  {/* Kapalı rozeti */}
                  {tab === "closed" && (
                    <div className="flex justify-end">
                      <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-500">✓ Kapatıldı</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {!loading && hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3.5 bg-white rounded-2xl shadow-sm text-sm font-bold text-[#3949AB] flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
            {loadingMore
              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[18px]">expand_more</span>}
            {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
          </button>
        )}

        {!loading && !hasMore && incidents.length > 0 && (
          <p className="text-center text-xs text-gray-400 font-semibold py-4">
            Tüm kayıtlar gösterildi · {incidents.length} olay
          </p>
        )}
      </main>
    </div>
  );
}
