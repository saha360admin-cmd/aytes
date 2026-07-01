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

interface LocationShortage {
  id: string;
  name: string;
  target: number;
  actual: number;
  deficit: number;
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

  const [openServiceRequests, setOpenServiceRequests] = useState(0);
  const [locationShortages, setLocationShortages] = useState<LocationShortage[]>([]);

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
      serviceReqCount,
      locationsRes,
      personnelLocsRes,
    ] = await Promise.all([
      supabase.from("requests").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "pending"),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "open").eq("department_id", deptId),
      supabase.from("patrols").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "active"),
      supabase.from("shifts").select("id", { count: "exact", head: true }).eq("department_id", deptId),
      supabase.from("personnel").select("id, full_name, status, position, role").eq("department_id", deptId).neq("status", "archived").order("full_name"),
      supabase.from("requests").select("*, requester:personnel_id(full_name)").eq("department_id", deptId).eq("status", "pending").order("created_at", { ascending: false }).limit(10),
      supabase.from("patrols").select("id, route_name, started_at, completed_checkpoints, total_checkpoints, officer:personnel_id(full_name)").eq("department_id", deptId).eq("status", "active").order("started_at", { ascending: false }) as any,
      supabase.from("incidents").select("id, title, type, severity, description, location, status, created_at, reporter:reported_by(full_name)").eq("status", "open").eq("department_id", deptId).order("created_at", { ascending: false }).limit(5),
      supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("department_id", deptId).in("status", ["open", "in_progress"]),
      supabase.from("locations").select("id, name, target_count").gt("target_count", 0),
      supabase.from("personnel").select("id, location_id, role").eq("department_id", deptId).neq("status", "archived"),
    ]);

    setStats({
      pendingRequests: reqCount.count || 0,
      openIncidents: incCount.count || 0,
      activePatrols: patrolCount.count || 0,
      todayShifts: shiftCount.count || 0,
    });

    const allP = personnelRes.data || [];
    setShiftFill({ active: 0, total: allP.length });
    setPersonnelList(allP.filter((p) => p.status === "active") as PersonnelItem[]);
    setPendingRequestsList((pendingReqRes.data || []) as PendingRequest[]);
    setActivePatrolList(((activePatrolRes as any).data || []) as ActivePatrol[]);
    setRecentIncidents((incidentRes.data || []) as unknown as Incident[]);
    setOpenServiceRequests(serviceReqCount.count || 0);

    // Lokasyon eksik güvenlik hesaplama
    const locs = (locationsRes.data || []) as { id: string; name: string; target_count: number }[];
    const genelMudId = locs.find(l => l.name === "Genel Müdürlük")?.id;
    const locCounts: Record<string, number> = {};
    for (const p of (personnelLocsRes.data || []) as { id: string; location_id: string | null; role: string }[]) {
      let locId = p.location_id;
      if ((p.role === "admin" || p.role === "supervisor") && genelMudId) locId = genelMudId;
      if (locId) locCounts[locId] = (locCounts[locId] || 0) + 1;
    }
    const shortages = locs
      .map(l => ({ id: l.id, name: l.name, target: l.target_count, actual: locCounts[l.id] || 0, deficit: l.target_count - (locCounts[l.id] || 0) }))
      .filter(l => l.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);
    setLocationShortages(shortages);

    setLoading(false);
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

  const TOTAL_PERSONNEL = Math.max(shiftFill.total, 1);
  const totalDeficit = locationShortages.reduce((s, l) => s + l.deficit, 0);
  const percent = Math.round(((TOTAL_PERSONNEL - totalDeficit) / TOTAL_PERSONNEL) * 100);
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
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 max-w-[430px] mx-auto z-50 flex justify-between items-center px-4 h-16"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
          <h1 className="font-bold text-white text-lg">AYTES</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/personel" className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white text-[22px]">group</span>
          </Link>
          <Link href="/yonetici/iletisim" className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white text-[22px]">forum</span>
          </Link>
          <Link href="/yonetici/beaconlar" className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white text-[22px]">bluetooth</span>
          </Link>
        </div>
      </header>

      {/* Karşılama bandı */}
      <div className="pt-16" style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="px-4 py-4">
          <h2 className="text-xl font-bold text-white">Merhaba, {name.split(" ")[0]} 👋</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <p className="text-sm text-white/75">Yönetici Paneli • {TOTAL_PERSONNEL - totalDeficit}/{TOTAL_PERSONNEL} Personel Aktif</p>
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
                <p className="font-bold text-gray-800">{TOTAL_PERSONNEL - totalDeficit} / {TOTAL_PERSONNEL} kişi</p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400">Bekleyen Talepler</p>
                <p className="font-bold text-[#FF9800]">{stats.pendingRequests} talep onay bekliyor</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── EKSİK GÜVENLİK ── */}
        {locationShortages.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-l-red-500">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-red-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_alert</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Eksik Güvenlik</h3>
                  <p className="text-xs text-gray-400">{locationShortages.length} lokasyonda personel eksik</p>
                </div>
              </div>
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {locationShortages.reduce((s, l) => s + l.deficit, 0)} eksik
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {locationShortages.map(loc => (
                <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-semibold text-gray-800 truncate">{loc.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full transition-all"
                          style={{ width: `${Math.round((loc.actual / loc.target) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{loc.actual}/{loc.target}</span>
                    </div>
                  </div>
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                    -{loc.deficit}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}



        {/* ── BEKLEYEN TALEPLER ÖZET ── */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-600 text-[16px]">pending_actions</span>
              </div>
              <h3 className="font-bold text-gray-800">Bekleyen Talepler</h3>
              {stats.pendingRequests > 0 && (
                <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{stats.pendingRequests}</span>
              )}
            </div>
            <Link href="/yonetici/talepler" className="text-xs font-bold text-[#3949AB]">Tümü →</Link>
          </div>

          {pendingRequestsList.length === 0 ? (
            <div className="bg-white rounded-xl p-5 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[32px] block mb-1">inbox</span>
              <p className="text-sm text-gray-400 font-semibold">Bekleyen talep yok</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Tip dağılımı */}
              <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
                {(["annual","unpaid","medical","other"] as const).map(t => {
                  const count = pendingRequestsList.filter(r => r.type === t).length;
                  return (
                    <div key={t} className="flex flex-col items-center py-3 gap-0.5">
                      <span className="text-lg font-bold text-gray-800">{count}</span>
                      <span className="text-[9px] font-semibold text-gray-400 text-center leading-tight px-1">
                        {t === "annual" ? "Yıllık" : t === "unpaid" ? "Ücretsiz" : t === "medical" ? "Doktor" : "Diğer"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Son 2 talep önizleme */}
              <div className="divide-y divide-gray-50">
                {pendingRequestsList.slice(0, 2).map(req => (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-orange-600 text-[16px]">person</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{req.requester?.full_name || "Bilinmiyor"}</p>
                      <p className="text-xs text-orange-500 font-semibold">{typeLabels[req.type] || req.type} · {timeAgo(req.created_at)}</p>
                    </div>
                    <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">Bekliyor</span>
                  </div>
                ))}
              </div>
              {pendingRequestsList.length > 2 && (
                <Link href="/yonetici/talepler" className="flex items-center justify-center gap-1 py-3 text-xs font-bold text-[#3949AB] border-t border-gray-100">
                  +{pendingRequestsList.length - 2} talep daha · Tümünü Gör
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              )}
            </div>
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
            <Link href="/yonetici/devriye-planlama" className="text-xs font-bold text-[#3949AB]">Planla →</Link>
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

        {/* ── SON OLAYLAR ÖZET ── */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-[16px]">assignment_late</span>
              </div>
              <h3 className="font-bold text-gray-800">Son Olaylar</h3>
              {stats.openIncidents > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{stats.openIncidents}</span>
              )}
            </div>
            <Link href="/yonetici/olaylar" className="text-xs font-bold text-[#3949AB]">Tümü →</Link>
          </div>

          {recentIncidents.length === 0 ? (
            <div className="bg-white rounded-xl p-5 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[32px] block mb-1">assignment</span>
              <p className="text-sm text-gray-400 font-semibold">Henüz olay raporu yok</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Şiddet dağılımı */}
              <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                {([["high","Yüksek","text-red-600","bg-red-50"],["medium","Orta","text-amber-600","bg-amber-50"],["low","Düşük","text-emerald-600","bg-emerald-50"]] as const).map(([sev, label, tc, bg]) => {
                  const count = recentIncidents.filter(i => i.severity === sev).length;
                  return (
                    <div key={sev} className={`flex flex-col items-center py-3 gap-0.5 ${bg}`}>
                      <span className={`text-lg font-bold ${tc}`}>{count}</span>
                      <span className={`text-[10px] font-semibold ${tc}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Son 2 olay önizleme */}
              <div className="divide-y divide-gray-50">
                {recentIncidents.slice(0, 2).map(inc => (
                  <div key={inc.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${inc.severity === "high" ? "bg-red-100" : inc.severity === "medium" ? "bg-amber-100" : "bg-emerald-100"}`}>
                      <span className={`material-symbols-outlined text-[16px] ${inc.severity === "high" ? "text-red-600" : inc.severity === "medium" ? "text-amber-600" : "text-emerald-600"}`}>warning</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{inc.title || inc.type}</p>
                      <p className="text-xs text-gray-400 font-semibold">{(inc.reporter as any)?.full_name || "Bilinmiyor"} · {timeAgo(inc.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${inc.status === "open" ? "bg-red-100 text-red-600" : inc.status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                      {inc.status === "open" ? "Açık" : inc.status === "in_progress" ? "İnceleniyor" : "Kapalı"}
                    </span>
                  </div>
                ))}
              </div>
              <Link href="/yonetici/olaylar" className="flex items-center justify-center gap-1 py-3 text-xs font-bold text-[#3949AB] border-t border-gray-100">
                Tüm Olayları Gör
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          )}
        </section>

        {/* ── TAŞERON TAKİP ── */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-[16px]">engineering</span>
              </div>
              <h3 className="font-bold text-gray-800">Taşeron Takip</h3>
              {openServiceRequests > 0 && (
                <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{openServiceRequests}</span>
              )}
            </div>
            <button
              onClick={() => router.push("/taseron")}
              className="text-xs font-bold text-[#3949AB]"
            >
              Tümü →
            </button>
          </div>

          <div
            onClick={() => router.push("/taseron")}
            className="bg-white rounded-xl shadow-sm border-l-4 border-l-indigo-400 p-4 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer"
          >
            <div>
              <p className="text-2xl font-bold text-gray-800">{String(openServiceRequests).padStart(2, "0")}</p>
              <p className="text-xs text-gray-400 font-semibold mt-0.5">Açık / Devam Eden Kayıt</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-[22px]">engineering</span>
              </div>
              <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-0.5">
                Takibe Git
                <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
              </span>
            </div>
          </div>
        </section>

        {/* ── DEVAM TAKİBİ ── */}
        <section>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-[16px]">login</span>
              </div>
              <h3 className="font-bold text-gray-800">Devam Takibi</h3>
            </div>
            <Link href="/yonetici/devam" className="text-xs font-bold text-[#3949AB]">Tümü →</Link>
          </div>
          <Link href="/yonetici/devam"
            className="bg-white rounded-xl shadow-sm border-l-4 border-l-emerald-400 p-4 flex items-center justify-between active:scale-[0.98] transition-all">
            <div>
              <p className="text-sm font-bold text-gray-800">Bugünkü Giriş / Çıkış Kayıtları</p>
              <p className="text-xs text-gray-400 mt-0.5">Beacon doğrulamalı personel devam listesi</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-emerald-600 text-[22px]">fact_check</span>
            </div>
          </Link>
        </section>

      </main>

    </div>
  );
}
