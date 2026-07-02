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

interface DeptShortage {
  id: string;
  slug: string;
  name: string;
  icon: string;
  shortages: LocationShortage[];
}

interface AttendancePersonnel {
  id: string;
  full_name: string;
  phone: string | null;
  entry: string | null;
  verified: boolean;
}

interface LocationAttendance {
  id: string;
  name: string;
  total: number;
  present: number;
  personnel: AttendancePersonnel[];
}

interface DeptAttendance {
  id: string;
  slug: string;
  name: string;
  icon: string;
  total: number;
  present: number;
  locations: LocationAttendance[];
}

interface CommSummary {
  id: string;
  type: string;
  priority: string;
  title: string;
  content: string;
  created_at: string;
}

const COMM_TYPE_CFG: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  duyuru:  { label: "Duyuru",  icon: "campaign",   bg: "bg-blue-100",   text: "text-blue-700",   border: "border-l-blue-500" },
  gorev:   { label: "Görev",   icon: "assignment", bg: "bg-amber-100",  text: "text-amber-700",  border: "border-l-amber-500" },
  talimat: { label: "Talimat", icon: "rule",       bg: "bg-purple-100", text: "text-purple-700", border: "border-l-purple-500" },
};

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
  const [otherDeptShortages, setOtherDeptShortages] = useState<DeptShortage[]>([]);
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [otherDeptAttendance, setOtherDeptAttendance] = useState<DeptAttendance[]>([]);
  const [expandedAttendanceId, setExpandedAttendanceId] = useState<string | null>(null);
  const [expandedAttendanceLocKey, setExpandedAttendanceLocKey] = useState<string | null>(null);
  const [latestComms, setLatestComms] = useState<Record<string, CommSummary>>({});

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
      commsRes,
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
      supabase.from("communications").select("id, type, priority, title, content, created_at").eq("department_id", deptId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", { ascending: false }).limit(20),
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

    const latestByType: Record<string, CommSummary> = {};
    for (const c of (commsRes.data || []) as CommSummary[]) {
      if (!latestByType[c.type]) latestByType[c.type] = c;
    }
    setLatestComms(latestByType);

    const locs = (locationsRes.data || []) as { id: string; name: string; target_count: number }[];
    const genelMudId = locs.find(l => l.name === "Genel Müdürlük")?.id;

    // İdari İşler yöneticisi için: diğer departmanların (Güvenlik, Teknik, Temizlik) lokasyon eksikleri
    if (personnel.departments?.slug === "idari") {
      const { data: otherDepts } = await supabase
        .from("departments")
        .select("id, slug, name, icon")
        .in("slug", ["guvenlik", "teknik", "temizlik"]);

      if (otherDepts && otherDepts.length > 0) {
        const deptIds = otherDepts.map((d) => d.id);
        const { data: otherPersonnel } = await supabase
          .from("personnel")
          .select("id, department_id, location_id, role")
          .in("department_id", deptIds)
          .neq("status", "archived");

        const countsByDept: Record<string, Record<string, number>> = {};
        for (const p of (otherPersonnel || []) as { id: string; department_id: string; location_id: string | null; role: string }[]) {
          let locId = p.location_id;
          if ((p.role === "admin" || p.role === "supervisor") && genelMudId) locId = genelMudId;
          if (!locId) continue;
          countsByDept[p.department_id] ??= {};
          countsByDept[p.department_id][locId] = (countsByDept[p.department_id][locId] || 0) + 1;
        }

        const order = ["guvenlik", "teknik", "temizlik"];
        const result = order
          .map((slug) => otherDepts.find((d) => d.slug === slug))
          .filter((d): d is NonNullable<typeof d> => !!d)
          .map((d) => {
            const counts = countsByDept[d.id] || {};
            const deptShortages = locs
              .map((l) => ({ id: l.id, name: l.name, target: l.target_count, actual: counts[l.id] || 0, deficit: l.target_count - (counts[l.id] || 0) }))
              .filter((l) => l.deficit > 0)
              .sort((a, b) => b.deficit - a.deficit);
            return { id: d.id, slug: d.slug, name: d.name, icon: d.icon, shortages: deptShortages };
          });
        setOtherDeptShortages(result);

        // Bugün giriş yapmış personel (departman + lokasyon bazlı)
        const { data: fieldPersonnel } = await supabase
          .from("personnel")
          .select("id, department_id, location_id, full_name, phone")
          .in("department_id", deptIds)
          .eq("role", "personel")
          .eq("status", "active")
          .order("full_name");

        const fpList = (fieldPersonnel || []) as { id: string; department_id: string; location_id: string | null; full_name: string; phone: string | null }[];
        const fpIds = fpList.map((p) => p.id);

        const todayStr = new Date().toISOString().slice(0, 10);
        const startOfDay = new Date(todayStr + "T00:00:00").toISOString();
        const endOfDay = new Date(todayStr + "T23:59:59").toISOString();

        const entryMap: Record<string, { entry: string; verified: boolean }> = {};
        if (fpIds.length > 0) {
          const { data: records } = await supabase
            .from("attendance_records")
            .select("personnel_id, type, recorded_at, verified")
            .in("personnel_id", fpIds)
            .eq("type", "entry")
            .gte("recorded_at", startOfDay)
            .lte("recorded_at", endOfDay)
            .order("recorded_at", { ascending: true });

          for (const r of (records || []) as { personnel_id: string; recorded_at: string; verified: boolean }[]) {
            if (!entryMap[r.personnel_id]) entryMap[r.personnel_id] = { entry: r.recorded_at, verified: r.verified };
          }
        }

        const attendanceResult: DeptAttendance[] = order
          .map((slug) => otherDepts.find((d) => d.slug === slug))
          .filter((d): d is NonNullable<typeof d> => !!d)
          .map((d) => {
            const deptPersonnel = fpList.filter((p) => p.department_id === d.id);

            const byLoc: Record<string, AttendancePersonnel[]> = {};
            for (const p of deptPersonnel) {
              const key = p.location_id || "none";
              byLoc[key] ??= [];
              byLoc[key].push({
                id: p.id,
                full_name: p.full_name,
                phone: p.phone,
                entry: entryMap[p.id]?.entry || null,
                verified: entryMap[p.id]?.verified || false,
              });
            }

            const locationEntries: LocationAttendance[] = Object.entries(byLoc)
              .map(([locId, ppl]) => ({
                id: locId,
                name: locId === "none" ? "Lokasyonsuz" : (locs.find((l) => l.id === locId)?.name || "Diğer"),
                total: ppl.length,
                present: ppl.filter((p) => p.entry).length,
                personnel: ppl.sort((a, b) => (a.entry ? 0 : 1) - (b.entry ? 0 : 1)),
              }))
              .sort((a, b) => b.total - a.total);

            return {
              id: d.id,
              slug: d.slug,
              name: d.name,
              icon: d.icon,
              total: deptPersonnel.length,
              present: deptPersonnel.filter((p) => entryMap[p.id]?.entry).length,
              locations: locationEntries,
            };
          });
        setOtherDeptAttendance(attendanceResult);
      }
    }

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
  const activePersonnelCount = personnelList.length;
  const name = personnel?.full_name || "Yönetici";
  const isTemizlik = personnel?.departments?.slug === "temizlik";
  const isIdari = personnel?.departments?.slug === "idari";
  const patrolSectionTitle = isTemizlik ? "Aktif Kat Kontrolleri" : "Aktif Devriyeler";
  const patrolPlanHref = isTemizlik ? "/yonetici/kat-planlama" : "/yonetici/devriye-planlama";
  const patrolIcon = isTemizlik ? "cleaning_services" : "route";

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
            <p className="text-sm text-white/75">Yönetici Paneli • {activePersonnelCount}/{TOTAL_PERSONNEL} Personel Aktif</p>
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
            { icon: "map", value: String(stats.activePatrols).padStart(2, "0"), label: patrolSectionTitle, accent: "#00BCD4", iconBg: "bg-teal-100", iconColor: "text-teal-600", badge: null },
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

        {/* ── DUYURU ÖZETİ ── */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h3 className="font-bold text-gray-800">Duyuru Özeti</h3>
            <Link href="/yonetici/iletisim" className="text-xs font-bold text-[#3949AB]">Tümü →</Link>
          </div>
          {Object.keys(latestComms).length === 0 ? (
            <div className="px-4 pb-4">
              <p className="text-sm text-gray-400 font-semibold text-center py-4">Henüz duyuru, görev veya talimat yok</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(["duyuru", "gorev", "talimat"] as const).map((type) => {
                const c = latestComms[type];
                const cfg = COMM_TYPE_CFG[type];
                if (!c) return null;
                return (
                  <Link key={type} href="/yonetici/iletisim" className="flex items-start gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <span className={`material-symbols-outlined ${cfg.text} text-[16px]`} style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        {c.priority === "urgent" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Acil</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-800 truncate mt-1">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(c.created_at)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── DEPARTMAN EKSİK PERSONELLERİ (İdari İşler yöneticisi) ── */}
        {isIdari && otherDeptShortages.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-[16px]">groups</span>
              </div>
              <h3 className="font-bold text-gray-800">Departman Eksik Personelleri</h3>
            </div>

            <div className="space-y-3">
              {otherDeptShortages.map((dept) => {
                const totalDef = dept.shortages.reduce((s, l) => s + l.deficit, 0);
                const isOpen = expandedDeptId === dept.id;

                if (dept.shortages.length === 0) {
                  return (
                    <div key={dept.id} className="bg-white rounded-xl shadow-sm border-l-4 border-l-emerald-400 px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-emerald-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{dept.icon}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">{dept.name}</p>
                        <p className="text-xs text-emerald-600 font-semibold">Personel eksiği yok</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={dept.id} className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-l-red-500">
                    <button
                      onClick={() => setExpandedDeptId(isOpen ? null : dept.id)}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                          <span className="material-symbols-outlined text-red-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{dept.icon}</span>
                        </div>
                        <div className="text-left">
                          <h4 className="font-bold text-gray-800 text-sm">{dept.name}</h4>
                          <p className="text-xs text-gray-400">{dept.shortages.length} lokasyonda personel eksik</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">{totalDef} eksik</span>
                        <span className={`material-symbols-outlined text-gray-400 text-[20px] transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-gray-50 border-t border-gray-100">
                        {dept.shortages.map((loc) => (
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
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── DEPARTMAN AKTİF PERSONELLERİ (İdari İşler yöneticisi) ── */}
        {isIdari && otherDeptAttendance.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-[16px]">how_to_reg</span>
              </div>
              <h3 className="font-bold text-gray-800">Departman Aktif Personelleri</h3>
            </div>

            <div className="space-y-3">
              {otherDeptAttendance.map((dept) => {
                const isOpen = expandedAttendanceId === dept.id;
                const allPresent = dept.total > 0 && dept.present === dept.total;
                const accentClass = dept.total === 0 ? "border-l-gray-300" : allPresent ? "border-l-emerald-500" : "border-l-amber-500";
                const badgeClass = dept.total === 0 ? "bg-gray-100 text-gray-500" : allPresent ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";

                return (
                  <div key={dept.id} className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-4 ${accentClass}`}>
                    <button
                      onClick={() => setExpandedAttendanceId(isOpen ? null : dept.id)}
                      className="w-full flex items-center justify-between px-4 py-3"
                      disabled={dept.total === 0}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <span className="material-symbols-outlined text-emerald-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{dept.icon}</span>
                        </div>
                        <div className="text-left">
                          <h4 className="font-bold text-gray-800 text-sm">{dept.name}</h4>
                          <p className="text-xs text-gray-400">{dept.total === 0 ? "Personel yok" : `${dept.present}/${dept.total} giriş yaptı`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeClass}`}>
                          {dept.total === 0 ? "—" : `%${Math.round((dept.present / dept.total) * 100)}`}
                        </span>
                        {dept.total > 0 && (
                          <span className={`material-symbols-outlined text-gray-400 text-[20px] transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-gray-50 border-t border-gray-100">
                        {dept.locations.map((loc) => {
                          const locKey = `${dept.id}:${loc.id}`;
                          const isLocOpen = expandedAttendanceLocKey === locKey;
                          const locAllPresent = loc.total > 0 && loc.present === loc.total;
                          return (
                            <div key={loc.id}>
                              <button
                                onClick={() => setExpandedAttendanceLocKey(isLocOpen ? null : locKey)}
                                className="w-full flex items-center justify-between px-4 py-2.5"
                              >
                                <div className="flex-1 min-w-0 pr-3 text-left">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{loc.name}</p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden max-w-[120px]">
                                      <div className={`h-full rounded-full transition-all ${locAllPresent ? "bg-emerald-400" : "bg-amber-400"}`}
                                        style={{ width: `${Math.round((loc.present / loc.total) * 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{loc.present}/{loc.total}</span>
                                  </div>
                                </div>
                                <span className={`material-symbols-outlined text-gray-400 text-[18px] transition-transform flex-shrink-0 ${isLocOpen ? "rotate-180" : ""}`}>expand_more</span>
                              </button>
                              {isLocOpen && (
                                <div className="bg-gray-50/60 divide-y divide-gray-100">
                                  {loc.personnel.map((p) => {
                                    const waPhone = p.phone ? p.phone.replace(/\s/g, "").replace(/^0/, "") : null;
                                    return (
                                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 pl-6">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${p.entry ? "bg-emerald-100" : "bg-red-50"}`}>
                                            <span className={`material-symbols-outlined text-[14px] ${p.entry ? "text-emerald-600" : "text-red-400"}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                                              {p.entry ? "check_circle" : "cancel"}
                                            </span>
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">{p.full_name}</p>
                                            <p className="text-[10px] text-gray-400">
                                              {p.entry ? new Date(p.entry).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "Kayıt Yok"}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          <a
                                            href={p.phone ? `tel:${p.phone}` : undefined}
                                            onClick={(e) => { if (!p.phone) e.preventDefault(); }}
                                            className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${p.phone ? "border-primary text-primary active:bg-primary/10" : "border-gray-200 text-gray-300"}`}
                                          >
                                            <span className="material-symbols-outlined text-[14px]">call</span>
                                          </a>
                                          <a
                                            href={waPhone ? `https://wa.me/90${waPhone}` : undefined}
                                            onClick={(e) => { if (!waPhone) e.preventDefault(); }}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${waPhone ? "border-[#25D366] text-[#25D366] active:bg-[#25D366]/10" : "border-gray-200 text-gray-300"}`}
                                          >
                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                            </svg>
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
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
                <span className="material-symbols-outlined text-teal-600 text-[16px]">{patrolIcon}</span>
              </div>
              <h3 className="font-bold text-gray-800">{patrolSectionTitle}</h3>
              {activePatrolList.length > 0 && (
                <span className="bg-teal-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{activePatrolList.length}</span>
              )}
            </div>
            <Link href={patrolPlanHref} className="text-xs font-bold text-[#3949AB]">Planla →</Link>
          </div>

          {activePatrolList.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px] block mb-2">{patrolIcon}</span>
              <p className="text-sm text-gray-400">{isTemizlik ? "Aktif kat kontrolü yok" : "Aktif devriye yok"}</p>
            </div>
          ) : (
            activePatrolList.map((patrol) => {
              const prog = patrol.total_checkpoints > 0 ? Math.round((patrol.completed_checkpoints / patrol.total_checkpoints) * 100) : 0;
              return (
                <div key={patrol.id} className="bg-white rounded-xl shadow-sm border-l-4 border-l-[#00BCD4] p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{patrol.officer?.full_name || "Bilinmiyor"}</p>
                      <p className="text-xs text-teal-600 font-semibold mt-0.5">{patrol.route_name || (isTemizlik ? "Kat Kontrolü" : "Devriye")}</p>
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
