"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { isSlaBreached } from "@/lib/sla";

interface Incident {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  title: string | null;
  description: string;
  location: string | null;
  created_at: string;
  status: string;
  photo_urls: string[] | null;
  video_urls: string[] | null;
  reporter: { full_name: string } | null;
  is_mine: boolean;
  is_assigned_to_me: boolean;
  my_dept_record_id: string;
  my_dept_status: "open" | "in_progress" | "pending_approval" | "closed";
  my_dept_rejection_note: string | null;
}

const TABS = [
  { key: "open",              label: "Açık",          color: "text-red-600",    dot: "bg-red-500"   },
  { key: "in_progress",       label: "İnceleniyor",   color: "text-amber-600",  dot: "bg-amber-500" },
  { key: "pending_approval",  label: "Onay Bekliyor", color: "text-purple-600", dot: "bg-purple-500" },
  { key: "closed",            label: "Kapatıldı",     color: "text-gray-500",   dot: "bg-gray-400"  },
] as const;
type TabKey = typeof TABS[number]["key"];

const typeConfig: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  fire:                { label: "Yangın",          icon: "local_fire_department", bg: "bg-red-100",     color: "text-red-600"     },
  theft:               { label: "Hırsızlık",       icon: "lock_person",           bg: "bg-indigo-100",  color: "text-indigo-700"  },
  fight:               { label: "Kavga / Tehdit",  icon: "sports_mma",            bg: "bg-orange-100",  color: "text-orange-700"  },
  medical:             { label: "Tıbbi Acil",      icon: "medical_services",      bg: "bg-rose-100",    color: "text-rose-700"    },
  unauthorized_entry:  { label: "Yetkisiz Giriş",  icon: "gpp_bad",               bg: "bg-sky-100",     color: "text-sky-700"     },
  suspicious:          { label: "Şüpheli Durum",   icon: "visibility",            bg: "bg-amber-100",   color: "text-amber-700"   },
  maintenance:         { label: "Teknik Arıza",    icon: "build",                 bg: "bg-emerald-100", color: "text-emerald-700" },
  form:                { label: "Form Bildir",     icon: "description",           bg: "bg-blue-100",    color: "text-blue-700"    },
  other:               { label: "Diğer",           icon: "more_horiz",            bg: "bg-purple-100",  color: "text-purple-700"  },
};

const severityConfig = {
  high:   { label: "Yüksek", bg: "bg-red-100",     text: "text-red-700"     },
  medium: { label: "Orta",   bg: "bg-amber-100",   text: "text-amber-700"   },
  low:    { label: "Düşük",  bg: "bg-emerald-100", text: "text-emerald-700" },
};

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const day  = d.getDate();
  const mon  = TR_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, "0");
  const mm   = String(d.getMinutes()).padStart(2, "0");
  const currentYear = new Date().getFullYear();
  return year !== currentYear
    ? `${day} ${mon} ${year}, ${hh}:${mm}`
    : `${day} ${mon}, ${hh}:${mm}`;
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function OlaylarPage() {
  const router = useRouter();
  const { personnel } = useAuth();

  const [tab, setTab] = useState<TabKey>("open");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationName, setLocationName] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const loadLocationName = useCallback(async () => {
    if (!personnel?.location_id) return;
    const { data } = await supabase.from("locations").select("name").eq("id", personnel.location_id).maybeSingle();
    if (data) setLocationName(data.name);
  }, [personnel]);

  const loadIncidents = useCallback(async () => {
    if (!personnel) return;
    setLoading(true);

    // 1. Aynı lokasyondaki personelin bildirdiği, tab durumundaki olaylar
    let locationIds: string[] = [];
    if (personnel.location_id) {
      const { data: peers } = await supabase
        .from("personnel")
        .select("id")
        .eq("location_id", personnel.location_id);
      const peerIds = (peers || []).map((p: { id: string }) => p.id);

      if (peerIds.length > 0) {
        const { data: myIncs } = await supabase
          .from("incidents")
          .select("id")
          .in("reported_by", peerIds);
        const myIncIds = (myIncs || []).map((i: { id: string }) => i.id);

        if (myIncIds.length > 0) {
          const { data: deptRecs } = await supabase
            .from("incident_departments")
            .select("incident_id")
            .in("incident_id", myIncIds)
            .eq("status", tab);
          locationIds = [...new Set((deptRecs || []).map((r: { incident_id: string }) => r.incident_id))];
        }
      }
    }

    // 2. Bana atanmış, tab durumundaki olaylar (lokasyondan bağımsız)
    const { data: assignedRecs } = await supabase
      .from("incident_departments")
      .select("incident_id")
      .eq("assigned_to", personnel.id)
      .eq("status", tab);
    const assignedIds = [...new Set((assignedRecs || []).map((r: { incident_id: string }) => r.incident_id))];

    const filteredIds = [...new Set([...locationIds, ...assignedIds])];
    if (filteredIds.length === 0) { setIncidents([]); setLoading(false); return; }

    // 3. Detayları çek
    const { data } = await supabase
      .from("incidents")
      .select(`
        id, type, severity, title, description, location, created_at, photo_urls, video_urls,
        reporter:reported_by(full_name),
        my_dept:incident_departments(id, status, department_id, assigned_to, rejection_note)
      `)
      .in("id", filteredIds)
      .order("created_at", { ascending: false })
      .limit(50);

    interface IncidentDeptRow { id: string; status: "open" | "in_progress" | "pending_approval" | "closed"; department_id: string; assigned_to: string | null; rejection_note: string | null }
    interface IncidentRow {
      id: string; type: string; severity: "low" | "medium" | "high"; title: string | null; description: string;
      location: string | null; created_at: string; photo_urls: string[] | null; video_urls: string[] | null;
      reporter: { full_name: string } | { full_name: string }[] | null;
      my_dept: IncidentDeptRow[] | null;
    }
    setIncidents(
      ((data || []) as unknown as IncidentRow[]).map((inc) => {
        const myDeptRec = (inc.my_dept || []).find((d) => d.department_id === personnel.department_id);
        const reporterArr = Array.isArray(inc.reporter) ? inc.reporter : null;
        const reporterObj = !Array.isArray(inc.reporter) ? inc.reporter : null;
        return {
          ...inc,
          status: tab,
          reporter: reporterArr ? reporterArr[0] ?? null : reporterObj,
          is_mine: reporterArr?.[0]?.full_name === personnel.full_name || reporterObj?.full_name === personnel.full_name,
          is_assigned_to_me: assignedIds.includes(inc.id),
          my_dept_record_id: myDeptRec?.id ?? "",
          my_dept_status: myDeptRec?.status ?? tab,
          my_dept_rejection_note: myDeptRec?.rejection_note ?? null,
        };
      })
    );
    setLoading(false);
  }, [personnel, tab]);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "admin" || personnel.role === "supervisor") {
      router.replace("/yonetici/olaylar");
      return;
    }
    if (personnel.location_id) loadLocationName();
    loadIncidents();
  }, [personnel, tab, router, loadLocationName, loadIncidents]);

  async function submitForApproval(incidentId: string, recordId: string) {
    setSubmittingId(incidentId);
    const { error } = await supabase
      .from("incident_departments")
      .update({ status: "pending_approval", updated_at: new Date().toISOString() })
      .eq("id", recordId);

    if (!error) {
      setIncidents(prev => prev.filter(i => i.id !== incidentId));
      showToast("Onaya gönderildi", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setSubmittingId(null);
  }

  const openCount = incidents.filter(i => i.status === "open").length;
  const tc = (type: string) => typeConfig[type] ?? typeConfig.other;
  const sc = (sev: string) => severityConfig[sev as keyof typeof severityConfig] ?? severityConfig.low;

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #C62828 0%, #E53935 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-lg leading-tight">Bölge Olayları</h1>
          <p className="text-white/70 text-xs truncate">{locationName || "Lokasyonunuz"}</p>
        </div>
        {tab === "open" && openCount > 0 && (
          <span className="bg-white text-red-700 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
            {openCount} açık
          </span>
        )}
      </header>

      {/* Tabs */}
      <div className="flex bg-white shadow-sm">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 text-xs font-bold transition-all relative ${tab === t.key ? t.color : "text-gray-400"}`}>
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-current rounded-full" />}
          </button>
        ))}
      </div>

      {/* İçerik */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-red-500 text-[40px]">progress_activity</span>
        </div>
      ) : !personnel?.location_id && incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 px-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-500 text-[32px]">location_off</span>
          </div>
          <p className="font-bold text-gray-700">Lokasyon atanmamış</p>
          <p className="text-xs text-gray-400">Yöneticinizden lokasyon ataması yapmasını isteyin.</p>
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 px-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-300 text-[32px]">report_problem</span>
          </div>
          <p className="font-bold text-gray-500">Bu kategoride olay yok</p>
        </div>
      ) : (
        <main className="px-4 pt-4 space-y-3">
          {incidents.map(inc => {
            const type = tc(inc.type);
            const sev = sc(inc.severity);
            return (
              <div key={inc.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden ${inc.is_mine ? "ring-2 ring-red-200" : inc.is_assigned_to_me ? "ring-2 ring-indigo-200" : ""}`}>
                {inc.is_mine && (
                  <div className="bg-red-50 px-4 py-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-red-400 text-[14px]">person</span>
                    <span className="text-[11px] font-bold text-red-500">Benim Bildirimim</span>
                  </div>
                )}
                {inc.is_assigned_to_me && (
                  <div className="bg-indigo-50 px-4 py-1.5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-indigo-400 text-[14px]">assignment_ind</span>
                    <span className="text-[11px] font-bold text-indigo-500">Size Atandı</span>
                  </div>
                )}
                {inc.my_dept_status === "in_progress" && inc.my_dept_rejection_note && (
                  <div className="bg-red-50 px-4 py-2 flex items-start gap-1.5 border-b border-red-100">
                    <span className="material-symbols-outlined text-red-500 text-[14px] mt-0.5">error</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-bold text-red-600 block">Reddedildi</span>
                      <span className="text-[11px] text-red-500">{inc.my_dept_rejection_note}</span>
                    </div>
                  </div>
                )}

                <div className="p-4">
                  {/* Üst satır: tip + önem + zaman */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${type.bg}`}>
                      <span className={`material-symbols-outlined text-[22px] ${type.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {type.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-sm">{inc.title || type.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sev.bg} ${sev.text}`}>
                          {sev.label}
                        </span>
                        {tab !== "closed" && isSlaBreached(inc.severity, inc.created_at) && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                            SLA Aşıldı
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-semibold mt-0.5">
                        {inc.reporter?.full_name ?? "—"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="material-symbols-outlined text-gray-300 text-[13px]">calendar_today</span>
                        <span className="text-xs text-gray-400">{formatDateTime(inc.created_at)}</span>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{timeAgo(inc.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Açıklama */}
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{inc.description}</p>

                  {/* Lokasyon */}
                  {inc.location && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="material-symbols-outlined text-gray-300 text-[14px]">location_on</span>
                      <span className="text-xs text-gray-400 font-medium truncate">{inc.location}</span>
                    </div>
                  )}

                  {/* Fotoğraf/video sayacı */}
                  {((inc.photo_urls?.length ?? 0) > 0 || (inc.video_urls?.length ?? 0) > 0) && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                      {(inc.photo_urls?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 font-semibold">
                          <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                          {inc.photo_urls!.length} fotoğraf
                        </div>
                      )}
                      {(inc.video_urls?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 font-semibold">
                          <span className="material-symbols-outlined text-[14px]">videocam</span>
                          {inc.video_urls!.length} video
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "in_progress" && inc.is_assigned_to_me && inc.my_dept_status === "in_progress" && (
                    <button
                      onClick={() => submitForApproval(inc.id, inc.my_dept_record_id)}
                      disabled={submittingId === inc.id}
                      className="w-full h-10 mt-3 bg-purple-600 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                      {submittingId === inc.id
                        ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[16px]">send</span>}
                      Onaya Gönder
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </main>
      )}

      {/* FAB — Olay Bildir */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
        <div className="flex justify-end pb-[8.5rem] pr-4">
          <button onClick={() => router.push("/olay-bildir")}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #C62828, #E53935)" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Olay Bildir
          </button>
        </div>
      </div>
    </div>
  );
}
