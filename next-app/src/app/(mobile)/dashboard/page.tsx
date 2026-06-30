"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Task, Announcement } from "@/lib/types";

interface ActiveShift {
  shift_code: string;
  name: string;
  start_time: string;
  end_time: string;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { personnel } = useAuth();
  const router = useRouter();
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [patrolStatus, setPatrolStatus] = useState({ completed: 0, total: 0, hasActive: false });
  const [pendingIncidents, setPendingIncidents] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "admin") { router.replace("/yonetici"); return; }
    if (personnel.role === "supervisor") { router.replace("/amir"); return; }
    loadDashboard();
  }, [personnel]);

  async function loadDashboard() {
    if (!personnel) return;
    const deptId = personnel.department_id;
    const pId = personnel.id;
    const today = toDateStr(new Date());

    const [assignmentRes, patrolRes, taskRes, annRes] = await Promise.all([
      supabase
        .from("shift_assignments")
        .select("shift_code")
        .eq("personnel_id", pId)
        .eq("shift_date", today)
        .eq("status", "published")
        .maybeSingle(),
      supabase.from("patrols").select("*").eq("personnel_id", pId).eq("status", "active").limit(1).maybeSingle(),
      supabase.from("tasks").select("*, assigned:assigned_to(full_name)").eq("department_id", deptId).order("created_at", { ascending: false }).limit(5),
      supabase.from("announcements").select("*, creator:created_by(full_name)").eq("department_id", deptId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Lokasyondaki açık olay sayısı — iki adımlı
    if (personnel.location_id) {
      const { data: peers } = await supabase.from("personnel").select("id").eq("location_id", personnel.location_id);
      const ids = (peers || []).map((p: { id: string }) => p.id);
      if (ids.length > 0) {
        const { count } = await supabase.from("incidents").select("id", { count: "exact", head: true }).in("reported_by", ids).eq("status", "open");
        setPendingIncidents(count || 0);
      }
    }

    if (assignmentRes.data?.shift_code) {
      const { data: typeData } = await supabase
        .from("shift_types")
        .select("name, start_time, end_time")
        .eq("department_id", deptId)
        .eq("code", assignmentRes.data.shift_code)
        .maybeSingle();
      if (typeData) {
        setShift({ shift_code: assignmentRes.data.shift_code, ...typeData });
      }
    }

    if (patrolRes.data) {
      setPatrolStatus({ completed: patrolRes.data.completed_checkpoints, total: patrolRes.data.total_checkpoints, hasActive: true });
    }
    setTasks(taskRes.data || []);
    if (annRes.data) setAnnouncement(annRes.data);
    setLoading(false);
  }

  const name = personnel?.full_name || "Görevli";
  const dept = personnel?.departments?.name || "Güvenlik";
  const role = { admin: "Yönetici", supervisor: "Süpervizör", personel: "Personel" }[personnel?.role || "personel"];
  const patrolText = patrolStatus.total > 0 ? `${patrolStatus.completed}/${patrolStatus.total}` : "0/0";
  const patrolPercent = patrolStatus.total > 0 ? (patrolStatus.completed / patrolStatus.total) * 100 : 0;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span></div>;
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">
      {/* Gradyan Header */}
      <header className="sticky top-0 w-full z-40 h-16 flex justify-between items-center px-6"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
          </div>
          <h1 className="text-lg font-bold text-white">Güvenlik Paneli</h1>
        </div>
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
        </button>
      </header>

      {/* Karşılama bandı */}
      <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <h2 className="text-xl font-bold text-white">Merhaba, {name.split(" ")[0]} 👋</h2>
        <p className="text-sm text-white/70 mt-0.5">{dept} • {role}</p>
      </div>
      {/* Dalga ayırıcı */}
      <div className="h-4 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-6 space-y-6">
        {/* Status Cards */}
        <section className="space-y-3 -mt-2">
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-[#3949AB] flex items-center gap-4">
            <div className="p-3 bg-indigo-100 rounded-xl text-indigo-700 flex-shrink-0">
              <span className="material-symbols-outlined">schedule</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bugünkü Vardiya</p>
              {shift ? (
                <>
                  <p className="text-xl font-bold text-gray-800 mt-0.5">{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{shift.name} · {shift.shift_code}</p>
                </>
              ) : (
                <p className="text-base font-semibold text-gray-400 mt-0.5">Bugün vardiya yok</p>
              )}
            </div>
            {shift && <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0">Aktif</span>}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-[#00BCD4]">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-100 rounded-xl text-teal-700"><span className="material-symbols-outlined">route</span></div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Devriye Durumu</p>
                  <p className="text-xl font-bold text-gray-800">{patrolText}</p>
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${patrolPercent}%`, background: "linear-gradient(to right, #00BCD4, #3949AB)" }} />
            </div>
          </div>

          <Link href="/olaylar" className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-[#C62828] flex items-center gap-4 active:scale-[0.98] transition-all">
            <div className="p-3 bg-red-100 rounded-xl text-red-600 flex-shrink-0">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>report_problem</span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bölge Olayları</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">
                {pendingIncidents > 0 ? `${pendingIncidents} açık olay` : "Bekleyen olay yok"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {pendingIncidents > 0 && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">{pendingIncidents}</span>
              )}
              <span className="material-symbols-outlined text-gray-300 text-[20px]">chevron_right</span>
            </div>
          </Link>
        </section>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hızlı İşlemler</h3>
          <div className="space-y-3">
            <Link href="/devriye"
              className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all shadow-md shadow-indigo-200"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
              {patrolStatus.hasActive ? "Devriyeye Devam Et" : "Devriye Başlat"}
            </Link>
            <Link href="/olay-bildir"
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-amber-600">edit_document</span>
              Olay Bildir
            </Link>
            <button
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all shadow-md shadow-rose-200 ring-4 ring-rose-100"
              style={{ background: "linear-gradient(135deg, #C62828, #E53935)" }}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>emergency_share</span>
              Yardım Çağır
            </button>
            <Link href="/vardiyalar"
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-emerald-600">calendar_month</span>
              Vardiyam
            </Link>
          </div>
        </section>

        {/* Tasks */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Bugünkü Görevler</h3>
            <Link href="/gorevler" className="text-blue-800 text-sm font-semibold">Tümünü Gör</Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            {tasks.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Henüz görev yok</p>
            ) : (
              tasks.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="h-px bg-gray-100 mx-6" />}
                  <div className={`p-6 flex items-center justify-between hover:bg-gray-50 transition-colors ${t.status === "completed" ? "opacity-50 bg-gray-50" : ""}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${t.status === "completed" ? "bg-green-100" : "bg-gray-100"}`}>
                        <span className={`material-symbols-outlined ${t.status === "completed" ? "text-green-600" : "text-blue-800"}`}>
                          {t.status === "completed" ? "check_circle" : "security"}
                        </span>
                      </div>
                      <div>
                        <p className={`text-lg font-medium ${t.status === "completed" ? "line-through" : ""}`}>{t.title}</p>
                        <p className="text-xs font-semibold text-gray-400">{t.description || ""}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Announcement */}
        {announcement && (
          <section className="relative overflow-hidden rounded-2xl bg-blue-700 p-8">
            <div className="text-white max-w-sm">
              <h4 className="text-2xl font-semibold mb-2">{announcement.title}</h4>
              <p className="text-base opacity-90">{announcement.content}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
