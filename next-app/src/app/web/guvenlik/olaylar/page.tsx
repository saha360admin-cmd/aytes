"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isSlaBreached } from "@/lib/sla";

// İş mantığı mobildeki (mobile)/yonetici/olaylar/page.tsx ile birebir
// aynı — incidents/incident_departments tablolarını ve onay/red/atama
// akışını mobil ve masaüstü aynı kurallarla uygulamalı.

interface DeptStatus {
  id: string;
  status: "open" | "in_progress" | "pending_approval" | "closed";
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
  my_dept_status: "open" | "in_progress" | "pending_approval" | "closed";
  my_dept_assigned_to: string | null;
  my_dept_rejection_note: string | null;
}

interface DeptPerson { id: string; full_name: string; }

const TABS = [
  { key: "open", label: "Açık", dot: "bg-red-500", text: "text-red-600" },
  { key: "in_progress", label: "İnceleniyor", dot: "bg-amber-500", text: "text-amber-600" },
  { key: "pending_approval", label: "Onay Bekliyor", dot: "bg-purple-500", text: "text-purple-600" },
  { key: "closed", label: "Kapatıldı", dot: "bg-gray-400", text: "text-gray-500" },
] as const;
type TabKey = typeof TABS[number]["key"];

const severityConfig = {
  high: { label: "Yüksek", bg: "bg-red-100", text: "text-red-700", bar: "bg-red-500" },
  medium: { label: "Orta", bg: "bg-amber-100", text: "text-amber-700", bar: "bg-amber-400" },
  low: { label: "Düşük", bg: "bg-emerald-100", text: "text-emerald-700", bar: "bg-emerald-400" },
};

const statusNext: Record<"open" | "in_progress", { to: "in_progress" | "closed"; label: string; icon: string; className: string }> = {
  open: { to: "in_progress", label: "İncelemeye Al", icon: "manage_search", className: "bg-amber-500 text-white" },
  in_progress: { to: "closed", label: "Kapat", icon: "task_alt", className: "bg-on-surface text-surface" },
};

const deptStatusConfig = {
  open: { label: "Açık", dot: "bg-red-400", text: "text-red-600", bg: "bg-red-50" },
  in_progress: { label: "İnceleniyor", dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
  pending_approval: { label: "Onay Bekliyor", dot: "bg-purple-400", text: "text-purple-700", bg: "bg-purple-50" },
  closed: { label: "Kapatıldı", dot: "bg-gray-400", text: "text-gray-500", bg: "bg-gray-50" },
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

export default function WebGuvenlikOlaylarPage() {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("open");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deptPersonnel, setDeptPersonnel] = useState<DeptPerson[]>([]);
  const [rejectSheet, setRejectSheet] = useState<{ incidentId: string; recordId: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!deptId) return;
    setIncidents([]);
    setPage(0);
    setHasMore(false);
    load(0, deptId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, tab]);

  async function init() {
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }
    setDeptId(dept.id);
    const { data } = await supabase.from("personnel").select("id, full_name").eq("department_id", dept.id).eq("status", "active").order("full_name");
    setDeptPersonnel(data || []);
  }

  async function load(pageIndex: number, currentDeptId: string) {
    pageIndex === 0 ? setLoading(true) : setLoadingMore(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: allRecs } = await supabase
      .from("incident_departments")
      .select("id, status, incident_id, department_id, updated_at, assigned_to, rejection_note")
      .eq("status", tab)
      .order("updated_at", { ascending: false });

    const allRows = allRecs || [];
    const myRows = allRows.filter(r => r.department_id === currentDeptId);
    const allIncidentIds = [...new Set(allRows.map(r => r.incident_id))];
    const pageIds = allIncidentIds.slice(from, to + 1);

    if (pageIds.length === 0) {
      setIncidents(prev => pageIndex === 0 ? [] : prev);
      setHasMore(false);
      pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
      return;
    }

    const { data: incData } = await supabase
      .from("incidents")
      .select(`
        id, type, severity, title, description, location, created_at, photo_urls, video_urls,
        reporter:reported_by(full_name),
        all_depts:incident_departments(id, status, department_id)
      `)
      .in("id", pageIds)
      .order("created_at", { ascending: false });

    const { data: deptData } = await supabase.from("departments").select("id, name, slug");
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
        my_dept_assigned_to: myRec?.assigned_to ?? null,
        my_dept_rejection_note: myRec?.rejection_note ?? null,
      };
    });

    setIncidents(prev => pageIndex === 0 ? merged : [...prev, ...merged]);
    setHasMore(allIncidentIds.length > to + 1);
    setPage(pageIndex);
    pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
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

  async function approveIncident(incidentId: string, recordId: string) {
    setUpdatingId(incidentId);
    const { error } = await supabase
      .from("incident_departments")
      .update({ status: "closed", rejection_note: null, updated_at: new Date().toISOString() })
      .eq("id", recordId);

    if (!error) {
      setIncidents(prev => prev.filter(i => i.id !== incidentId));
      showToast("Olay onaylandı ve kapatıldı", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setUpdatingId(null);
  }

  function openRejectSheet(incidentId: string, recordId: string) {
    setRejectNote("");
    setRejectSheet({ incidentId, recordId });
  }

  async function rejectIncident(incidentId: string, recordId: string, note: string) {
    setUpdatingId(incidentId);
    const { error } = await supabase
      .from("incident_departments")
      .update({ status: "in_progress", rejection_note: note, updated_at: new Date().toISOString() })
      .eq("id", recordId);

    if (!error) {
      setIncidents(prev => prev.filter(i => i.id !== incidentId));
      showToast("Olay reddedildi, teknisyene bildirildi", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setUpdatingId(null);
    setRejectSheet(null);
  }

  async function assignPersonnel(incidentId: string, recordId: string, personnelId: string, currentStatus: "open" | "in_progress" | "pending_approval" | "closed") {
    setAssigningId(incidentId);
    const patch: { assigned_to: string | null; status?: "in_progress" } = { assigned_to: personnelId || null };
    if (personnelId && currentStatus === "open") patch.status = "in_progress";

    const { error } = await supabase.from("incident_departments").update(patch).eq("id", recordId);

    if (!error) {
      if (patch.status && patch.status !== currentStatus) {
        setIncidents(prev => prev.filter(i => i.id !== incidentId));
      } else {
        setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, my_dept_assigned_to: personnelId || null } : i));
      }
      showToast(personnelId ? "Personel atandı" : "Atama kaldırıldı", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setAssigningId(null);
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">Olaylar</h1>
          <p className="text-on-surface-variant">Güvenlik departmanına atanan olayları görüntüleyin, atayın ve sonuçlandırın.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
              tab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tab === t.key ? "bg-on-primary" : t.dot}`} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : incidents.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <span className="material-symbols-outlined text-outline-variant text-[48px]">
            {tab === "open" ? "gpp_good" : tab === "in_progress" ? "manage_search" : tab === "pending_approval" ? "verified" : "task_alt"}
          </span>
          <p className="text-sm font-semibold text-on-surface-variant">
            {tab === "open" ? "Açık olay yok" : tab === "in_progress" ? "İncelenen olay yok" : tab === "pending_approval" ? "Onay bekleyen olay yok" : "Kapatılan olay yok"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map(inc => {
            const sev = severityConfig[inc.severity] ?? severityConfig.low;
            const next = tab === "open" || tab === "in_progress" ? statusNext[tab] : null;
            const slaBreached = tab !== "closed" && isSlaBreached(inc.severity, inc.created_at);
            const closedCount = inc.all_depts.filter(d => d.status === "closed").length;
            const totalDepts = inc.all_depts.length;

            return (
              <div key={inc.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <div className={`h-1 w-full ${sev.bar}`} />
                <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">

                  {/* Sol: içerik */}
                  <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-on-surface text-sm">{inc.title || inc.type}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {inc.reporter?.full_name || "Bilinmiyor"} · {timeAgo(inc.created_at)}
                          {inc.location ? ` · ${inc.location}` : ""}
                        </p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {slaBreached && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-600 text-white animate-pulse flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">warning</span>
                            SLA Aşıldı
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${sev.bg} ${sev.text}`}>{sev.label}</span>
                      </div>
                    </div>

                    {inc.description && (
                      <p className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2.5 leading-relaxed">
                        {inc.description}
                      </p>
                    )}

                    {Array.isArray(inc.photo_urls) && inc.photo_urls.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {inc.photo_urls.map((url, i) => {
                          const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(url)}`;
                          return (
                            <div key={i} className="relative flex-shrink-0">
                              <a href={proxyUrl} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-xl overflow-hidden border border-outline-variant/30 shadow-sm block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={proxyUrl} alt={`foto-${i + 1}`} className="w-full h-full object-cover" />
                              </a>
                              <a href={`${proxyUrl}&download=1`} download className="absolute bottom-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-white text-[13px]">download</span>
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {Array.isArray(inc.video_urls) && inc.video_urls.length > 0 && (
                      <div className="space-y-2">
                        {inc.video_urls.map((url, i) => {
                          const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(url)}`;
                          return (
                            <div key={i} className="rounded-xl overflow-hidden border border-outline-variant/30 shadow-sm bg-black relative">
                              <video src={proxyUrl} controls preload="metadata" className="w-full max-h-52 object-contain" />
                              <a href={`${proxyUrl}&download=1`} download className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-white text-[14px]">download</span>
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {tab === "open" && (
                      <a
                        href={`/web/guvenlik/taseron?incident_id=${inc.id}&department_id=${deptId ?? ""}&description=${encodeURIComponent(inc.description || "")}`}
                        className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                      >
                        <span className="material-symbols-outlined text-[14px]">engineering</span>
                        Taşeron Kaydı Aç
                      </a>
                    )}
                  </div>

                  {/* Sağ: birim durumları + atama + aksiyonlar */}
                  <div className="space-y-3">
                    {inc.all_depts.length > 0 && (
                      <div className="rounded-xl border border-outline-variant/20 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-surface-container-low border-b border-outline-variant/20">
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">Birim Durumları</span>
                          <span className="text-[10px] font-bold text-on-surface-variant">{closedCount}/{totalDepts} tamamlandı</span>
                        </div>
                        <div className="divide-y divide-outline-variant/10">
                          {inc.all_depts.map(d => {
                            const cfg = deptStatusConfig[d.status];
                            const isMe = d.department_id === deptId;
                            return (
                              <div key={d.id} className={`flex items-center gap-2.5 px-3 py-2 ${isMe ? "bg-primary/5" : ""}`}>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                <span className={`text-xs font-semibold flex-1 ${isMe ? "text-primary" : "text-on-surface"}`}>
                                  {d.dept_name}
                                  {isMe && <span className="ml-1 text-[10px] text-primary/60">(Siz)</span>}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-3 py-2 border-t border-outline-variant/20">
                          <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: totalDepts > 0 ? `${(closedCount / totalDepts) * 100}%` : "0%" }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {tab !== "closed" && deptPersonnel.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-outline text-[16px] flex-shrink-0">assignment_ind</span>
                        <select
                          value={inc.my_dept_assigned_to ?? ""}
                          disabled={assigningId === inc.id}
                          onChange={e => assignPersonnel(inc.id, inc.my_dept_record_id, e.target.value, inc.my_dept_status)}
                          className="flex-1 text-xs font-semibold bg-surface-container-low border-none rounded-lg px-2.5 py-2 outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                        >
                          <option value="">— Personel Ata —</option>
                          {deptPersonnel.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {tab === "closed" && inc.my_dept_assigned_to && (
                      <p className="text-[11px] text-on-surface-variant font-semibold">
                        Atanan: {deptPersonnel.find(p => p.id === inc.my_dept_assigned_to)?.full_name ?? "—"}
                      </p>
                    )}

                    {next && tab !== "closed" && (
                      <button
                        onClick={() => updateStatus(inc.id, inc.my_dept_record_id, next.to)}
                        disabled={updatingId === inc.id}
                        className={`w-full h-10 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${next.className}`}
                      >
                        {updatingId === inc.id
                          ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                          : <span className="material-symbols-outlined text-[16px]">{next.icon}</span>}
                        {next.label}
                      </button>
                    )}

                    {tab === "pending_approval" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveIncident(inc.id, inc.my_dept_record_id)}
                          disabled={updatingId === inc.id}
                          className="flex-1 h-10 bg-emerald-500 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          Onayla
                        </button>
                        <button
                          onClick={() => openRejectSheet(inc.id, inc.my_dept_record_id)}
                          disabled={updatingId === inc.id}
                          className="flex-1 h-10 bg-error/10 text-error text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all border border-error/20 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          Reddet
                        </button>
                      </div>
                    )}

                    {tab === "closed" && (
                      <div className="flex justify-end">
                        <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant">✓ Biriminiz kapattı</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && hasMore && (
        <button
          onClick={() => deptId && load(page + 1, deptId)}
          disabled={loadingMore}
          className="w-full py-3.5 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 text-sm font-bold text-primary flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          {loadingMore
            ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            : <span className="material-symbols-outlined text-[18px]">expand_more</span>}
          {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
        </button>
      )}

      {!loading && !hasMore && incidents.length > 0 && (
        <p className="text-center text-xs text-on-surface-variant font-semibold py-2">
          Tüm kayıtlar gösterildi · {incidents.length} olay
        </p>
      )}

      {rejectSheet && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectSheet(null)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="font-display text-headline-sm text-on-surface">Olayı Reddet</h2>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Ret Nedeni *</label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                placeholder="Teknisyene gösterilecek not..."
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-error outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRejectSheet(null)} className="flex-1 py-2.5 rounded-full bg-surface-container-low text-on-surface-variant font-bold text-sm transition-all">
                Vazgeç
              </button>
              <button
                disabled={!rejectNote.trim()}
                onClick={() => rejectIncident(rejectSheet.incidentId, rejectSheet.recordId, rejectNote.trim())}
                className="flex-1 py-2.5 rounded-full bg-error text-on-error font-bold text-sm transition-all disabled:opacity-50"
              >
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full shadow-lg flex items-center gap-2 ${toast.ok ? "bg-on-surface text-surface" : "bg-error text-on-error"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          <span className="text-sm font-semibold">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
