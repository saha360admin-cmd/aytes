"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Activity {
  id: string;
  label: string;
  sub: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

export default function YoneticiPage() {
  const { personnel } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    pendingRequests: 0,
    openIncidents: 0,
    activePatrols: 0,
    todayShifts: 0,
  });
  const [shiftFill, setShiftFill] = useState({ active: 0, total: 0 });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    if (personnel.role === "supervisor") { router.replace("/amir"); return; }
    loadData();
  }, [personnel]);

  async function loadData() {
    if (!personnel) return;
    const deptId = personnel.department_id;

    const [reqRes, incRes, patrolRes, shiftRes, personnelRes, recentIncRes, recentReqRes] =
      await Promise.all([
        supabase
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("department_id", deptId)
          .eq("status", "pending"),
        supabase
          .from("incidents")
          .select("id", { count: "exact", head: true })
          .eq("department_id", deptId)
          .eq("status", "open"),
        supabase
          .from("patrols")
          .select("id", { count: "exact", head: true })
          .eq("department_id", deptId)
          .eq("status", "active"),
        supabase
          .from("shifts")
          .select("id", { count: "exact", head: true })
          .eq("department_id", deptId),
        supabase
          .from("personnel")
          .select("id, status")
          .eq("department_id", deptId),
        supabase
          .from("incidents")
          .select("id, title, description, created_at, reporter:reported_by(full_name)")
          .eq("department_id", deptId)
          .order("created_at", { ascending: false })
          .limit(2),
        supabase
          .from("requests")
          .select("id, type, created_at, requester:personnel_id(full_name)")
          .eq("department_id", deptId)
          .order("created_at", { ascending: false })
          .limit(2),
      ]);

    setStats({
      pendingRequests: reqRes.count || 0,
      openIncidents: incRes.count || 0,
      activePatrols: patrolRes.count || 0,
      todayShifts: shiftRes.count || 0,
    });

    const allPersonnel = personnelRes.data || [];
    const activeCount = allPersonnel.filter((p) => p.status === "active").length;
    setShiftFill({ active: activeCount, total: allPersonnel.length });

    const acts: Activity[] = [];

    (recentIncRes.data || []).forEach((inc: any) => {
      const ago = timeAgo(inc.created_at);
      acts.push({
        id: `inc-${inc.id}`,
        label: inc.title || "Olay Raporu",
        sub: `${inc.reporter?.full_name || "Bilinmiyor"} • ${ago}`,
        icon: "assignment",
        iconBg: "bg-red-100",
        iconColor: "text-red-600",
      });
    });

    (recentReqRes.data || []).forEach((req: any) => {
      const ago = timeAgo(req.created_at);
      acts.push({
        id: `req-${req.id}`,
        label: req.type || "Talep",
        sub: `${req.requester?.full_name || "Bilinmiyor"} • ${ago}`,
        icon: "sync_alt",
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
      });
    });

    acts.sort(() => Math.random() - 0.5);
    setActivities(acts.slice(0, 3));
    setLoading(false);
  }

  function timeAgo(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return "az önce";
    if (diff < 60) return `${diff} dk önce`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h} sa önce`;
    return `${Math.floor(h / 24)} gün önce`;
  }

  const percent =
    shiftFill.total > 0
      ? Math.round((shiftFill.active / shiftFill.total) * 100)
      : 0;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (percent / 100) * circumference;

  const name = personnel?.full_name || "Yönetici";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-primary text-[40px]">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen pb-32">
      {/* Gradyan Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-lg h-16"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
          <h1 className="font-display text-headline-lg-mobile font-bold text-white">AYTES</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/personel" className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white">group</span>
          </Link>
          <button className="p-2 rounded-full hover:bg-white/15 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-white">notifications</span>
          </button>
        </div>
      </header>

      <main className="pt-20 pb-8 px-lg space-y-lg">
        {/* Karşılama */}
        <section className="space-y-xs">
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Hoş Geldin, {name.split(" ")[0]} 👋
          </h2>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-on-surface-variant font-label-md text-label-md">
              Sistem Aktif • {shiftFill.active} Personel Görevde
            </p>
          </div>
        </section>

        {/* İstatistikler */}
        <section className="grid grid-cols-2 gap-md">
          {[
            {
              icon: "pending_actions",
              value: String(stats.pendingRequests).padStart(2, "0"),
              label: "Bekleyen Talepler",
              badge: stats.pendingRequests > 0 ? `+${stats.pendingRequests} Yeni` : null,
              accent: "#FF9800",
              iconBg: "bg-orange-100",
              iconColor: "text-orange-600",
            },
            {
              icon: "assignment_late",
              value: String(stats.openIncidents).padStart(2, "0"),
              label: "Açık Raporlar",
              badge: null,
              accent: "#EF5350",
              iconBg: "bg-red-100",
              iconColor: "text-red-600",
            },
            {
              icon: "map",
              value: String(stats.activePatrols).padStart(2, "0"),
              label: "Aktif Devriyeler",
              badge: null,
              accent: "#00BCD4",
              iconBg: "bg-teal-100",
              iconColor: "text-teal-600",
            },
            {
              icon: "schedule",
              value: String(stats.todayShifts).padStart(2, "0"),
              label: "Toplam Vardiyalar",
              badge: null,
              accent: "#9C27B0",
              iconBg: "bg-purple-100",
              iconColor: "text-purple-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white p-md rounded-xl shadow-sm space-y-xs active:scale-95 transition-transform duration-150 border-l-4"
              style={{ borderLeftColor: s.accent }}
            >
              <div className="flex justify-between items-start">
                <div className={`w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                  <span className={`material-symbols-outlined ${s.iconColor}`} style={{ fontSize: "20px" }}>{s.icon}</span>
                </div>
                {s.badge && (
                  <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{s.badge}</span>
                )}
              </div>
              <div>
                <p className="font-headline-md text-headline-md">{s.value}</p>
                <p className="text-label-sm font-label-sm text-outline">{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Vardiya Durumu */}
        <section className="bg-white p-lg rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-headline-md text-headline-md mb-md">Personel Durumu</h3>
          <div className="flex items-center gap-lg">
            <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  className="text-surface-container stroke-current"
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  strokeWidth="10"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  strokeWidth="10"
                  strokeLinecap="round"
                  stroke="url(#gaugeGradient)"
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: offset,
                    transition: "stroke-dashoffset 0.5s ease",
                  }}
                />
                <defs>
                  <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00BCD4" />
                    <stop offset="100%" stopColor="#3949AB" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-headline-md text-headline-md">%{percent}</span>
              </div>
            </div>
            <div className="flex-1 space-y-sm">
              <div>
                <p className="text-label-md font-label-md text-on-surface">Aktif Personel</p>
                <p className="text-body-md text-on-surface-variant">
                  {shiftFill.active}/{shiftFill.total} Personel
                </p>
              </div>
              <div className="pt-xs border-t border-outline-variant">
                <p className="text-label-sm font-label-sm text-outline">Bekleyen Talepler</p>
                <p className="text-body-md font-semibold text-primary">
                  {stats.pendingRequests} talep bekliyor
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Son Aktiviteler */}
        <section className="space-y-md">
          <div className="flex justify-between items-end">
            <h3 className="font-headline-md text-headline-md">Son Aktiviteler</h3>
            <Link href="/raporlar" className="text-primary font-label-md text-label-md">
              Tümünü Gör
            </Link>
          </div>
          <div className="space-y-sm">
            {activities.length === 0 ? (
              <p className="text-center text-on-surface-variant py-lg">Henüz aktivite yok</p>
            ) : (
              activities.map((a) => (
                <div
                  key={a.id}
                  className="bg-white p-md rounded-xl flex items-center gap-md active:bg-gray-50 transition-all shadow-sm border border-gray-100"
                >
                  <div
                    className={`w-10 h-10 rounded-full ${a.iconBg} ${a.iconColor} flex items-center justify-center flex-shrink-0`}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "20px", fontVariationSettings: "'FILL' 1" }}
                    >
                      {a.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-label-md font-label-md text-on-surface truncate">{a.label}</p>
                    <p className="text-label-sm font-label-sm text-outline">{a.sub}</p>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant flex-shrink-0">
                    chevron_right
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* FAB */}
      <Link
        href="/olay-bildir"
        className="fixed bottom-24 right-lg w-14 h-14 bg-primary text-on-primary rounded-xl shadow-lg flex items-center justify-center active:scale-90 transition-transform z-40"
      >
        <span className="material-symbols-outlined text-[28px]">add</span>
      </Link>
    </div>
  );
}
