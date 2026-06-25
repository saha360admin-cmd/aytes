"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import type { Task, Announcement, Shift } from "@/lib/types";

export default function DashboardPage() {
  const { personnel } = useAuth();
  const [shift, setShift] = useState<Shift | null>(null);
  const [patrolStatus, setPatrolStatus] = useState({ completed: 0, total: 0, hasActive: false });
  const [pendingIncidents, setPendingIncidents] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    loadDashboard();
  }, [personnel]);

  async function loadDashboard() {
    if (!personnel) return;
    const deptId = personnel.department_id;
    const pId = personnel.id;

    const [shiftRes, patrolRes, incidentRes, taskRes, annRes] = await Promise.all([
      supabase.from("shifts").select("*").eq("department_id", deptId).limit(1).single(),
      supabase.from("patrols").select("*").eq("personnel_id", pId).eq("status", "active").limit(1).maybeSingle(),
      supabase.from("incidents").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "open"),
      supabase.from("tasks").select("*, assigned:assigned_to(full_name)").eq("department_id", deptId).order("created_at", { ascending: false }).limit(5),
      supabase.from("announcements").select("*, creator:created_by(full_name)").eq("department_id", deptId).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (shiftRes.data) setShift(shiftRes.data);
    if (patrolRes.data) {
      setPatrolStatus({ completed: patrolRes.data.completed_checkpoints, total: patrolRes.data.total_checkpoints, hasActive: true });
    }
    setPendingIncidents(incidentRes.count || 0);
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
    <div className="bg-[#f8f9ff] min-h-screen pb-8">
      <header className="sticky top-0 w-full z-40 bg-[#f8f9ff] shadow-sm h-16 flex justify-between items-center px-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-blue-600 bg-blue-100 flex items-center justify-center text-blue-700">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          </div>
          <h1 className="text-2xl font-semibold text-blue-800">Güvenlik Paneli</h1>
        </div>
        <button className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
      </header>

      <main className="px-6 space-y-6 mt-4">
        <section>
          <h2 className="text-2xl font-bold">Merhaba, <span className="text-blue-800">{name}</span></h2>
          <p className="text-base text-gray-500">{dept} • {role}</p>
        </section>

        {/* Status Cards */}
        <section className="space-y-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-100 rounded-xl text-blue-700"><span className="material-symbols-outlined">schedule</span></div>
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">Aktif</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-500">Aktif Vardiya</h3>
            <p className="text-2xl font-semibold mt-1">{shift ? `${shift.start_time.slice(0, 5)} - ${shift.end_time.slice(0, 5)}` : "—"}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-green-100 rounded-xl text-green-700"><span className="material-symbols-outlined">route</span></div>
              <span className="text-green-700 font-bold text-2xl">{patrolText}</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-500">Devriye Durumu</h3>
            <div className="w-full bg-gray-200 h-2 rounded-full mt-2">
              <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${patrolPercent}%` }} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-100 rounded-xl text-amber-700"><span className="material-symbols-outlined">report_problem</span></div>
              <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-semibold">{pendingIncidents} Bekliyor</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-500">Bekleyen Raporlar</h3>
            <p className="text-2xl font-semibold mt-1">Olay Kayıtları</p>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Hızlı İşlemler</h3>
          <div className="space-y-3">
            <Link href="/devriye" className="bg-blue-800 text-white py-4 px-6 rounded-full flex items-center justify-center gap-3 text-sm font-semibold hover:opacity-90 active:scale-95 transition-all">
              <span className="material-symbols-outlined">play_circle</span>
              {patrolStatus.hasActive ? "Devriyeye Devam Et" : "Devriye Başlat"}
            </Link>
            <Link href="/olay-bildir" className="w-full bg-gray-200 text-gray-600 py-4 px-6 rounded-full flex items-center justify-center gap-3 text-sm font-semibold hover:bg-gray-300 active:scale-95 transition-all">
              <span className="material-symbols-outlined">edit_document</span>
              Olay Bildir
            </Link>
            <button className="w-full bg-red-600 text-white py-4 px-6 rounded-full flex items-center justify-center gap-3 text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md ring-4 ring-red-200">
              <span className="material-symbols-outlined">emergency_share</span>
              Yardım Çağır
            </button>
            <Link href="/vardiyalar" className="w-full bg-gray-200 text-gray-600 py-4 px-6 rounded-full flex items-center justify-center gap-3 text-sm font-semibold hover:bg-gray-300 active:scale-95 transition-all">
              <span className="material-symbols-outlined">calendar_today</span>
              Vardiyalar
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
