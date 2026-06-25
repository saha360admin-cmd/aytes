"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Incident } from "@/lib/types";

const deptIcons: Record<string, string> = { idari: "admin_panel_settings", guvenlik: "security", teknik: "engineering", temizlik: "cleaning_services" };

export default function RaporlarPage() {
  const { personnel } = useAuth();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    loadIncidents();
  }, [personnel, tab]);

  async function loadIncidents() {
    if (!personnel) return;
    setLoading(true);
    let query = supabase
      .from("incidents")
      .select("*, departments(name, slug), reporter:reported_by(full_name)")
      .order("created_at", { ascending: false });

    if (personnel.role !== "admin") {
      query = query.eq("department_id", personnel.department_id);
    }

    if (tab === "open") {
      query = query.in("status", ["open", "in_progress"]);
    } else {
      query = query.eq("status", "closed");
    }

    const { data } = await query;
    setIncidents(data || []);
    setLoading(false);
  }

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-8">
      <header className="w-full sticky top-0 z-50 bg-white shadow-sm flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-800 text-[28px]">security</span>
          <h1 className="text-2xl font-bold text-blue-800">AYTES</h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
        </div>
      </header>

      <main className="px-6 pt-6">
        <section className="mb-8">
          <div className="relative overflow-hidden bg-blue-700 rounded-2xl p-6 text-white shadow-lg flex flex-col gap-4">
            <div className="absolute -right-4 -top-4 opacity-10">
              <span className="material-symbols-outlined text-[120px]">edit_note</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1">Yeni Rapor</h2>
              <p className="text-white/80 max-w-[220px]">Bugünkü olayları veya rutin kontrolleri hızlıca bildirin.</p>
            </div>
            <Link href="/olay-bildir" className="bg-white text-blue-700 py-4 px-6 rounded-full text-sm font-semibold flex items-center justify-center gap-2 self-start active:scale-95 transition-transform">
              <span className="material-symbols-outlined">add_circle</span>
              Rapor Oluştur
            </Link>
          </div>
        </section>

        <section className="mb-6 sticky top-[72px] z-40 bg-[#f8f9ff]/80 backdrop-blur-md py-2">
          <div className="flex bg-gray-200 p-1 rounded-full">
            <button onClick={() => setTab("open")}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${tab === "open" ? "bg-blue-700 text-white" : "text-gray-500"}`}>
              Açık Raporlar
            </button>
            <button onClick={() => setTab("closed")}
              className={`flex-1 py-2 rounded-full text-sm font-semibold transition-colors ${tab === "closed" ? "bg-blue-700 text-white" : "text-gray-500"}`}>
              Kapalı Raporlar
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {loading ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined animate-spin text-blue-800 text-[32px]">progress_activity</span>
            </div>
          ) : incidents.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Bu kategoride rapor yok</p>
          ) : (
            incidents.map(r => (
              <div key={r.id} className={`bg-white p-4 rounded-2xl shadow-sm flex flex-col gap-4 border border-gray-100 active:scale-[0.98] transition-transform ${r.status === "closed" ? "opacity-70" : ""}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold">{r.title || r.type}</h3>
                    <p className="text-xs font-semibold text-gray-400">{new Date(r.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${r.status === "open" ? "bg-red-100 text-red-700" : r.status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                    {r.status === "open" ? "Açık" : r.status === "in_progress" ? "İşlemde" : "Kapatıldı"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">{r.description}</p>
                <div className="flex flex-wrap gap-2">
                  {r.departments && (
                    <div className="bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-blue-800">{deptIcons[r.departments.slug] || "business"}</span>
                      <span className="text-xs font-semibold text-gray-500">{r.departments.name}</span>
                    </div>
                  )}
                  <div className="bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-blue-800">priority_high</span>
                    <span className="text-xs font-semibold text-gray-500">{r.severity === "high" ? "Yüksek" : r.severity === "medium" ? "Orta" : "Düşük"}</span>
                  </div>
                </div>
                {r.location && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    {r.location}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
