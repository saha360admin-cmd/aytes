"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface DeptStatus {
  id: string;
  status: "open" | "in_progress" | "closed";
  department_id: string;
  dept_name: string;
}

interface Incident {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  title: string | null;
  description: string;
  location: string | null;
  created_at: string;
  photo_urls: string[] | null;
  video_urls: string[] | null;
  reporter: { full_name: string } | null;
  all_depts: DeptStatus[];
  my_dept_record_id: string;
  my_dept_status: "open" | "in_progress" | "closed";
}

const TABS = [
  { key: "open",        label: "Açık",        dot: "bg-red-500",   text: "text-red-600"   },
  { key: "in_progress", label: "İnceleniyor", dot: "bg-amber-500", text: "text-amber-600" },
  { key: "closed",      label: "Kapatıldı",   dot: "bg-gray-400",  text: "text-gray-500"  },
] as const;

type TabKey = typeof TABS[number]["key"];

const severityConfig = {
  high:   { label: "Yüksek", bg: "bg-red-100",     text: "text-red-700",     bar: "bg-red-500"     },
  medium: { label: "Orta",   bg: "bg-amber-100",   text: "text-amber-700",   bar: "bg-amber-400"   },
  low:    { label: "Düşük",  bg: "bg-emerald-100", text: "text-emerald-700", bar: "bg-emerald-400" },
};

const statusNext: Record<"open" | "in_progress", { to: "in_progress" | "closed"; label: string; icon: string; color: string }> = {
  open:        { to: "in_progress", label: "İncelemeye Al", icon: "manage_search", color: "bg-amber-500 text-white"  },
  in_progress: { to: "closed",      label: "Kapat",         icon: "task_alt",      color: "bg-gray-700 text-white"   },
};

const deptStatusConfig = {
  open:        { label: "Açık",        dot: "bg-red-400",   text: "text-red-600",   bg: "bg-red-50"    },
  in_progress: { label: "İnceleniyor", dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50"  },
  closed:      { label: "Kapatıldı",   dot: "bg-gray-400",  text: "text-gray-500",  bg: "bg-gray-50"   },
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

    // 1. Tüm incident_departments'ı tab statusuna göre çek (birim filtresi yok)
    const { data: allRecs } = await supabase
      .from("incident_departments")
      .select("id, status, incident_id, department_id, updated_at")
      .eq("status", tab)
      .order("updated_at", { ascending: false });


    const allRows = allRecs || [];

    // Kendi birimime ait kayıtları bul
    const myRows = allRows.filter(r => r.department_id === personnel.department_id);

    // Benzersiz incident_id'leri paginasyon ile al
    const allIncidentIds = [...new Set(allRows.map(r => r.incident_id))];
    const pageIds = allIncidentIds.slice(from, to + 1);

    if (pageIds.length === 0) {
      setIncidents(prev => pageIndex === 0 ? [] : prev);
      setHasMore(false);
      pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
      return;
    }

    // 2. Bu incident'ların detaylarını çek
    const { data: incData } = await supabase
      .from("incidents")
      .select(`
        id, type, severity, title, description, location, created_at, photo_urls, video_urls,
        reporter:reported_by(full_name),
        all_depts:incident_departments(id, status, department_id)
      `)
      .in("id", pageIds)
      .order("created_at", { ascending: false });

    // 3. Departman isimlerini çek
    const { data: deptData } = await supabase
      .from("departments")
      .select("id, name, slug");

    const deptMap = Object.fromEntries((deptData || []).map(d => [d.id, d]));

    const merged: Incident[] = (incData || []).map((inc: any) => {
      const myRec = myRows.find(r => r.incident_id === inc.id);
      const depts: DeptStatus[] = (inc.all_depts || []).map((d: any) => ({
        id: d.id,
        status: d.status,
        department_id: d.department_id,
        dept_name: deptMap[d.department_id]?.name || "Bilinmiyor",
      }));
      return {
        ...inc,
        reporter: inc.reporter as { full_name: string } | null,
        all_depts: depts,
        my_dept_record_id: myRec?.id ?? "",
        my_dept_status: myRec?.status ?? "open",
      };
    });

    setIncidents(prev => pageIndex === 0 ? merged : [...prev, ...merged]);
    setHasMore(allIncidentIds.length > to + 1);
    setPage(pageIndex);
    pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
  }

  async function updateStatus(incidentId: string, recordId: string, newStatus: "in_progress" | "closed") {
    setUpdatingId(incidentId);
    const { error } = await supabase
      .from("incident_departments")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", recordId);

    if (!error) {
      setIncidents(prev => prev.filter(i => i.id !== incidentId));
      showToast(newStatus === "in_progress" ? "İncelemeye alındı" : "Olay kapatıldı", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setUpdatingId(null);
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-24">
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
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">Olaylar</h1>
          <p className="text-white/60 text-xs">Biriminize atanan olaylar</p>
        </div>
        <button onClick={() => router.push("/olay-bildir")}
          className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center active:scale-95 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">add</span>
        </button>
      </header>

      {/* Tab Bar */}
      <div className="flex bg-white shadow-sm border-b border-gray-100 sticky top-16 z-30">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
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
              {tab === "open" ? "Açık olay yok" : tab === "in_progress" ? "İncelenen olay yok" : "Kapatılan olay yok"}
            </p>
          </div>
        ) : (
          incidents.map(inc => {
            const sev = severityConfig[inc.severity] ?? severityConfig.low;
            const next = tab !== "closed" ? statusNext[tab as "open" | "in_progress"] : null;
            const closedCount = inc.all_depts.filter(d => d.status === "closed").length;
            const totalDepts = inc.all_depts.length;

            return (
              <div key={inc.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className={`h-1 w-full ${sev.bar}`} />
                <div className="p-4 space-y-3">

                  {/* Başlık */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{inc.title || inc.type}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
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
                    <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5 leading-relaxed">
                      {inc.description}
                    </p>
                  )}

                  {/* Fotoğraflar */}
                  {Array.isArray(inc.photo_urls) && inc.photo_urls.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {inc.photo_urls.map((url, i) => {
                        const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(url)}`;
                        return (
                          <div key={i} className="relative flex-shrink-0">
                            <a href={proxyUrl} target="_blank" rel="noopener noreferrer"
                              className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 shadow-sm block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={proxyUrl} alt={`foto-${i + 1}`} className="w-full h-full object-cover" />
                            </a>
                            <a href={`${proxyUrl}&download=1`} download
                              className="absolute bottom-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-white text-[13px]">download</span>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Videolar */}
                  {Array.isArray(inc.video_urls) && inc.video_urls.length > 0 && (
                    <div className="space-y-2">
                      {inc.video_urls.map((url, i) => {
                        const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(url)}`;
                        return (
                          <div key={i} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black relative">
                            <video
                              src={proxyUrl}
                              controls
                              preload="metadata"
                              className="w-full max-h-52 object-contain"
                            />
                            <a href={`${proxyUrl}&download=1`} download
                              className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-white text-[14px]">download</span>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Birim Durumları */}
                  {inc.all_depts.length > 0 && (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Birim Durumları</span>
                        <span className="text-[10px] font-bold text-gray-400">{closedCount}/{totalDepts} tamamlandı</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {inc.all_depts.map(d => {
                          const cfg = deptStatusConfig[d.status];
                          const isMe = d.department_id === personnel?.department_id;
                          return (
                            <div key={d.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${isMe ? "bg-indigo-50/60" : ""}`}>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                              <span className={`text-xs font-semibold flex-1 ${isMe ? "text-indigo-700" : "text-gray-700"}`}>
                                {d.dept_name}
                                {isMe && <span className="ml-1 text-[10px] text-indigo-400">(Sen)</span>}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Genel ilerleme barı */}
                      <div className="px-3 py-2 border-t border-gray-100">
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all"
                            style={{ width: totalDepts > 0 ? `${(closedCount / totalDepts) * 100}%` : "0%" }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Aksiyon butonu (kendi birimi için) */}
                  {next && tab !== "closed" && (
                    <button
                      onClick={() => updateStatus(inc.id, inc.my_dept_record_id, next.to)}
                      disabled={updatingId === inc.id}
                      className={`w-full h-10 text-sm font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 ${next.color}`}>
                      {updatingId === inc.id
                        ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[16px]">{next.icon}</span>}
                      {next.label}
                    </button>
                  )}

                  {tab === "closed" && (
                    <div className="flex justify-end">
                      <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-500">✓ Biriminiz kapattı</span>
                    </div>
                  )}

                  {tab === "open" && (
                    <button
                      onClick={() => router.push(
                        `/yonetici/taseron/yeni?incident_id=${inc.id}&department_id=${personnel?.department_id ?? ""}&description=${encodeURIComponent(inc.description || "")}`
                      )}
                      className="text-xs text-indigo-600 font-semibold flex items-center gap-1 mt-2 hover:text-indigo-800"
                    >
                      <span className="material-symbols-outlined text-[14px]">engineering</span>
                      Taşeron Kaydı Aç
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {!loading && hasMore && (
          <button onClick={() => load(page + 1)} disabled={loadingMore}
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

      {/* FAB — Yeni Olay Bildir */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
        <div className="flex justify-end pb-[8.5rem] pr-4">
          <button
            onClick={() => router.push("/olay-bildir")}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Olay Bildir
          </button>
        </div>
      </div>
    </div>
  );
}
