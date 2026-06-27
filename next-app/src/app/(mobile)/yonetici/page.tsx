"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Incident, Request } from "@/lib/types";

interface ActivePatrol {
  id: string;
  route_name: string;
  started_at: string;
  completed_checkpoints: number;
  total_checkpoints: number;
  officer: { full_name: string } | null;
}

interface PendingRequest extends Request {
  requester: { full_name: string } | null;
}

interface PersonnelItem {
  id: string;
  full_name: string;
  position: string | null;
}

const typeLabels: Record<string, string> = {
  unpaid: "Ücretsiz İzin",
  annual: "Yıllık İzin",
  medical: "Doktor Raporu",
  resign: "İstifa",
  other: "Diğer",
};

const severityColor: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

export default function YoneticiPage() {
  const { personnel } = useAuth();
  const router = useRouter();

  // Overview stats
  const [stats, setStats] = useState({ pendingRequests: 0, openIncidents: 0, activePatrols: 0, todayShifts: 0 });
  const [shiftFill, setShiftFill] = useState({ active: 0, total: 0 });

  // New feature data
  const [personnelList, setPersonnelList] = useState<PersonnelItem[]>([]);
  const [pendingRequestsList, setPendingRequestsList] = useState<PendingRequest[]>([]);
  const [activePatrolList, setActivePatrolList] = useState<ActivePatrol[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);

  // Vardiya form
  const [shiftName, setShiftName] = useState("Gündüz Vardiyası");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("16:00");
  const [shiftSending, setShiftSending] = useState(false);
  const [shiftToast, setShiftToast] = useState<string | null>(null);

  // Request action state
  const [updatingReq, setUpdatingReq] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadData();
  }, [personnel]);

  async function loadData() {
    if (!personnel) return;
    const deptId = personnel.department_id;

    const [
      reqCount, incCount, patrolCount, shiftCount,
      personnelRes,
      pendingReqRes,
      activePatrolRes,
      incidentRes,
    ] = await Promise.all([
      supabase.from("requests").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "pending"),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "open"),
      supabase.from("patrols").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "active"),
      supabase.from("shifts").select("id", { count: "exact", head: true }).eq("department_id", deptId),
      supabase.from("personnel").select("id, full_name, status, position").eq("department_id", deptId).neq("status", "archived").order("full_name"),
      supabase.from("requests").select("*, requester:personnel_id(full_name)").eq("department_id", deptId).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
      supabase.from("patrols").select("id, route_name, started_at, completed_checkpoints, total_checkpoints, officer:personnel_id(full_name)").eq("department_id", deptId).eq("status", "active").order("started_at", { ascending: false }) as any,
      supabase.from("incidents").select("id, title, type, severity, description, location, status, created_at, reporter:reported_by(full_name)").eq("department_id", deptId).order("created_at", { ascending: false }).limit(5),
    ]);

    setStats({
      pendingRequests: reqCount.count || 0,
      openIncidents: incCount.count || 0,
      activePatrols: patrolCount.count || 0,
      todayShifts: shiftCount.count || 0,
    });

    const allP = personnelRes.data || [];
    setShiftFill({ active: allP.filter((p) => p.status === "active").length, total: allP.length });
    setPersonnelList(allP.filter((p) => p.status === "active") as PersonnelItem[]);
    setPendingRequestsList((pendingReqRes.data || []) as PendingRequest[]);
    setActivePatrolList(((activePatrolRes as any).data || []) as ActivePatrol[]);
    setRecentIncidents((incidentRes.data || []) as unknown as Incident[]);
    setLoading(false);
  }

  async function createShift() {
    if (!personnel || !shiftName || !shiftStart || !shiftEnd) return;
    setShiftSending(true);
    const { error } = await supabase.from("shifts").insert({
      department_id: personnel.department_id,
      name: shiftName,
      start_time: shiftStart,
      end_time: shiftEnd,
    });
    setShiftSending(false);
    if (!error) {
      setShiftToast("Vardiya oluşturuldu!");
      setStats((s) => ({ ...s, todayShifts: s.todayShifts + 1 }));
      setTimeout(() => setShiftToast(null), 3000);
    } else {
      setShiftToast("Hata: " + error.message);
      setTimeout(() => setShiftToast(null), 4000);
    }
  }

  async function handleRequest(id: string, status: "approved" | "rejected") {
    setUpdatingReq(id);
    const { error } = await supabase.from("requests").update({ status }).eq("id", id);
    if (!error) {
      setPendingRequestsList((prev) => prev.filter((r) => r.id !== id));
      setStats((s) => ({ ...s, pendingRequests: s.pendingRequests - 1 }));
    }
    setUpdatingReq(null);
  }

  function timeAgo(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return "az önce";
    if (diff < 60) return `${diff} dk önce`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h} sa önce`;
    return `${Math.floor(h / 24)} gün önce`;
  }

  const percent = shiftFill.total > 0 ? Math.round((shiftFill.active / shiftFill.total) * 100) : 0;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (percent / 100) * circumference;
  const name = personnel?.full_name || "Yönetici";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
        <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32">
      {/* Toast */}
      {shiftToast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${shiftToast.startsWith("Hata") ? "bg-red-600" : "bg-emerald-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{shiftToast.startsWith("Hata") ? "error" : "check_circle"}</span>
          {shiftToast}
        </div>
      )}

      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-16"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
          <h1 className="font-bold text-white text-lg">AYTES</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/personel" className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white text-[22px]">group</span>
          </Link>
          <button className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white text-[22px]">notifications</span>
          </button>
        </div>
      </header>

      {/* Karşılama bandı */}
      <div className="pt-16" style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="px-4 py-4">
          <h2 className="text-xl font-bold text-white">Merhaba, {name.split(" ")[0]} 👋</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <p className="text-sm text-white/75">Yönetici Paneli • {shiftFill.active}/{shiftFill.total} Personel Aktif</p>
          </div>
        </div>
      </div>
      <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-4 space-y-5">

        {/* ── İSTATİSTİKLER ── */}
        <section className="grid grid-cols-2 gap-3 -mt-2">
          {[
            { icon: "pending_actions", value: String(stats.pendingRequests).padStart(2, "0"), label: "Bekleyen Talepler", accent: "#FF9800", iconBg: "bg-orange-100", iconColor: "text-orange-600", badge: stats.pendingRequests > 0 ? `${stats.pendingRequests} Yeni` : null },
            { icon: "assignment_late", value: String(stats.openIncidents).padStart(2, "0"), label: "Açık Raporlar", accent: "#EF5350", iconBg: "bg-red-100", iconColor: "text-red-600", badge: null },
            { icon: "map", value: String(stats.activePatrols).padStart(2, "0"), label: "Aktif Devriyeler", accent: "#00BCD4", iconBg: "bg-teal-100", iconColor: "text-teal-600", badge: null },
            { icon: "schedule", value: String(stats.todayShifts).padStart(2, "0"), label: "Toplam Vardiyalar", accent: "#9C27B0", iconBg: "bg-purple-100", iconColor: "text-purple-600", badge: null },
          ].map((s) => (
            <div key={s.label} className="bg-white p-4 rounded-xl shadow-sm border-l-4 space-y-2" style={{ borderLeftColor: s.accent }}>
              <div className="flex justify-between items-start">
                <div className={`w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                  <span className={`material-symbols-outlined ${s.iconColor} text-[20px]`}>{s.icon}</span>
                </div>
                {s.badge && <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{s.badge}</span>}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                <p className="text-xs text-gray-400 font-semibold">{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── PERSONEL DURUMU ── */}
        <section className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-bold text-gray-800 mb-3">Personel Durumu</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" strokeWidth="10" stroke="#f3f4f6" />
                <circle cx="50" cy="50" r="40" fill="transparent" strokeWidth="10" strokeLinecap="round"
                  stroke="url(#gaugeGrad)"
                  style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: "stroke-dashoffset 0.5s ease" }} />
                <defs>
                  <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00BCD4" /><stop offset="100%" stopColor="#3949AB" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-bold text-gray-800 text-sm">%{percent}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-xs font-semibold text-gray-400">Aktif Personel</p>
                <p className="font-bold text-gray-800">{shiftFill.active} / {shiftFill.total} kişi</p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400">Bekleyen Talepler</p>
                <p className="font-bold text-[#FF9800]">{stats.pendingRequests} talep onay bekliyor</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── VARDİYA OLUŞTUR ── */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-purple-600 text-[20px]">calendar_add_on</span>
            </div>
            <h3 className="font-bold text-gray-800">Vardiya Oluştur</h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400">Vardiya Adı</label>
              <input
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="Örn: Sabah Vardiyası, Gece Vardiyası"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400">Başlangıç</label>
                <input
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400">Bitiş</label>
                <input
                  type="time"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
            <button
              onClick={createShift}
              disabled={shiftSending || !shiftName}
              className="w-full py-3 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6A1B9A, #9C27B0)" }}>
              {shiftSending
                ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>}
              {shiftSending ? "Oluşturuluyor..." : "Vardiyayı Kaydet"}
            </button>
          </div>
        </section>

        {/* ── BEKLEYEN TALEPLER ── */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-600 text-[16px]">pending_actions</span>
              </div>
              <h3 className="font-bold text-gray-800">Bekleyen Talepler</h3>
              {pendingRequestsList.length > 0 && (
                <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingRequestsList.length}</span>
              )}
            </div>
            <Link href="/talepler" className="text-xs font-bold text-[#3949AB]">Tümü →</Link>
          </div>

          {pendingRequestsList.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px] block mb-2">inbox</span>
              <p className="text-sm text-gray-400">Bekleyen talep yok</p>
            </div>
          ) : (
            pendingRequestsList.map((req) => (
              <div key={req.id} className="bg-white rounded-xl shadow-sm border-l-4 border-l-[#FF9800] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{req.requester?.full_name || "Bilinmiyor"}</p>
                    <p className="text-xs text-[#FF9800] font-semibold mt-0.5">{typeLabels[req.type] || req.type}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(req.created_at)}</p>
                  </div>
                  <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0">Bekliyor</span>
                </div>
                {req.details && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 line-clamp-2">{req.details}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRequest(req.id, "approved")}
                    disabled={updatingReq === req.id}
                    className="flex-1 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
                    {updatingReq === req.id
                      ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                      : <span className="material-symbols-outlined text-[16px]">check</span>}
                    Onayla
                  </button>
                  <button
                    onClick={() => handleRequest(req.id, "rejected")}
                    disabled={updatingReq === req.id}
                    className="flex-1 py-2.5 bg-red-100 text-red-600 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all border border-red-200 disabled:opacity-50">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                    Reddet
                  </button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* ── AKTİF DEVRİYELER ── */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-teal-600 text-[16px]">route</span>
              </div>
              <h3 className="font-bold text-gray-800">Aktif Devriyeler</h3>
              {activePatrolList.length > 0 && (
                <span className="bg-teal-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{activePatrolList.length}</span>
              )}
            </div>
          </div>

          {activePatrolList.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px] block mb-2">route</span>
              <p className="text-sm text-gray-400">Aktif devriye yok</p>
            </div>
          ) : (
            activePatrolList.map((patrol) => {
              const prog = patrol.total_checkpoints > 0 ? Math.round((patrol.completed_checkpoints / patrol.total_checkpoints) * 100) : 0;
              return (
                <div key={patrol.id} className="bg-white rounded-xl shadow-sm border-l-4 border-l-[#00BCD4] p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{patrol.officer?.full_name || "Bilinmiyor"}</p>
                      <p className="text-xs text-teal-600 font-semibold mt-0.5">{patrol.route_name || "Devriye"}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(patrol.started_at)}</p>
                    </div>
                    <span className="flex items-center gap-1 bg-teal-100 text-teal-700 text-[10px] font-bold px-2 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                      Aktif
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-gray-400">İlerleme</span>
                      <span className="text-gray-700">{patrol.completed_checkpoints}/{patrol.total_checkpoints} nokta</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${prog}%`, background: "linear-gradient(to right, #00BCD4, #3949AB)" }} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* ── SON OLAYLAR / RAPORLAR ── */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-[16px]">assignment_late</span>
              </div>
              <h3 className="font-bold text-gray-800">Son Olaylar</h3>
            </div>
            <Link href="/raporlar" className="text-xs font-bold text-[#3949AB]">Tümü →</Link>
          </div>

          {recentIncidents.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px] block mb-2">assignment</span>
              <p className="text-sm text-gray-400">Henüz olay raporu yok</p>
            </div>
          ) : (
            recentIncidents.map((inc) => (
              <div key={inc.id} className="bg-white rounded-xl shadow-sm border-l-4 border-l-[#EF5350] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{inc.title || inc.type}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(inc.reporter as any)?.full_name || "Bilinmiyor"} • {timeAgo(inc.created_at)}
                      {inc.location ? ` • ${inc.location}` : ""}
                    </p>
                    {inc.description && (
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{inc.description}</p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${severityColor[inc.severity] || "bg-gray-100 text-gray-600"}`}>
                    {inc.severity === "low" ? "Düşük" : inc.severity === "medium" ? "Orta" : inc.severity === "high" ? "Yüksek" : inc.severity}
                  </span>
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inc.status === "open" ? "bg-red-100 text-red-600" : inc.status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                    {inc.status === "open" ? "Açık" : inc.status === "in_progress" ? "İnceleniyor" : "Kapalı"}
                  </span>
                </div>
              </div>
            ))
          )}
        </section>

      </main>

      {/* FAB - Olay Bildir */}
      <Link
        href="/olay-bildir"
        className="fixed bottom-24 right-4 w-14 h-14 rounded-xl shadow-lg flex items-center justify-center active:scale-90 transition-transform z-40"
        style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
        <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
      </Link>
    </div>
  );
}
