"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface PersonnelAttendance {
  id: string;
  full_name: string;
  location?: string | null;
  entry: string | null;
  exit: string | null;
  entryVerified: boolean;
  exitVerified: boolean;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DevamPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [list, setList] = useState<PersonnelAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (dateStr: string) => {
    if (!personnel) return;
    setLoading(true);

    const startOfDay = new Date(dateStr + "T00:00:00").toISOString();
    const endOfDay = new Date(dateStr + "T23:59:59").toISOString();

    // Departmandaki tüm aktif personel
    const { data: pData } = await supabase
      .from("personnel")
      .select("id, full_name, location_id, locations:locations(name)")
      .eq("department_id", personnel.department_id)
      .eq("role", "personel")
      .eq("status", "active")
      .order("full_name");

    if (!pData || pData.length === 0) { setList([]); setLoading(false); return; }

    interface PersonnelRow { id: string; full_name: string; locations: { name: string } | null }
    const rows = pData as unknown as PersonnelRow[];
    const pIds = rows.map((p) => p.id);

    // O günün giriş/çıkış kayıtları
    const { data: rData } = await supabase
      .from("attendance_records")
      .select("personnel_id, type, recorded_at, verified")
      .in("personnel_id", pIds)
      .gte("recorded_at", startOfDay)
      .lte("recorded_at", endOfDay)
      .order("recorded_at", { ascending: true });

    // Her personel için ilk giriş ve son çıkışı bul
    const recordMap: Record<string, { entry: string | null; exit: string | null; entryVerified: boolean; exitVerified: boolean }> = {};
    (rData || []).forEach((r) => {
      if (!recordMap[r.personnel_id]) {
        recordMap[r.personnel_id] = { entry: null, exit: null, entryVerified: false, exitVerified: false };
      }
      if (r.type === "entry" && !recordMap[r.personnel_id].entry) {
        recordMap[r.personnel_id].entry = r.recorded_at;
        recordMap[r.personnel_id].entryVerified = r.verified;
      }
      if (r.type === "exit") {
        recordMap[r.personnel_id].exit = r.recorded_at;
        recordMap[r.personnel_id].exitVerified = r.verified;
      }
    });

    const result: PersonnelAttendance[] = rows.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      location: p.locations?.name || null,
      ...(recordMap[p.id] || { entry: null, exit: null, entryVerified: false, exitVerified: false }),
    }));

    setList(result);
    setLoading(false);
  }, [personnel]);

  useEffect(() => { if (personnel) load(selectedDate); }, [personnel, selectedDate, load]);

  function formatTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  function calcDuration(entry: string | null, exit: string | null): string {
    if (!entry || !exit) return "";
    const diff = new Date(exit).getTime() - new Date(entry).getTime();
    if (diff < 0) return "Hatalı";
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}s ${mins}dk`;
  }

  const present = list.filter(p => p.entry).length;
  const absent = list.length - present;
  const exited = list.filter(p => p.exit).length;

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-white shadow-sm flex items-center gap-3 px-4 h-16">
        <button onClick={() => router.push("/yonetici")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-blue-800">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-blue-800 text-lg">Devam Takibi</h1>
        </div>
      </header>

      {/* Tarih seçici */}
      <div className="bg-white px-5 py-3 shadow-sm">
        <input type="date" value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          max={toDateStr(new Date())}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>

      {/* Özet kartlar */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3.5 shadow-sm text-center border-t-4 border-t-emerald-400">
          <p className="text-2xl font-bold text-emerald-600">{present}</p>
          <p className="text-[11px] text-gray-400 mt-1 font-semibold">Giriş Yaptı</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm text-center border-t-4 border-t-blue-400">
          <p className="text-2xl font-bold text-blue-600">{exited}</p>
          <p className="text-[11px] text-gray-400 mt-1 font-semibold">Çıkış Yaptı</p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 shadow-sm text-center border-t-4 border-t-red-400">
          <p className="text-2xl font-bold text-red-500">{absent}</p>
          <p className="text-[11px] text-gray-400 mt-1 font-semibold">Kayıt Yok</p>
        </div>
      </div>

      {/* Personel listesi */}
      <div className="px-4 pt-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-blue-800 text-[36px]">progress_activity</span>
          </div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-gray-300 text-[48px]">group</span>
            <p className="text-gray-500 font-semibold">Personel bulunamadı</p>
          </div>
        ) : list.map(p => {
          const hasEntry = !!p.entry;
          const hasExit = !!p.exit;
          const duration = calcDuration(p.entry, p.exit);

          return (
            <div key={p.id} className={`bg-white rounded-2xl shadow-sm border-l-4 p-4
              ${hasEntry ? (hasExit ? "border-l-blue-400" : "border-l-emerald-400") : "border-l-red-300"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                    ${hasEntry ? (hasExit ? "bg-blue-100" : "bg-emerald-100") : "bg-red-50"}`}>
                    <span className={`material-symbols-outlined text-[20px]
                      ${hasEntry ? (hasExit ? "text-blue-600" : "text-emerald-600") : "text-red-400"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                      {hasEntry ? (hasExit ? "check_circle" : "schedule") : "cancel"}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{p.full_name}</p>
                    {p.location && <p className="text-[11px] text-gray-400 mt-0.5">{p.location}</p>}
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0
                  ${hasEntry ? (hasExit ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700") : "bg-red-100 text-red-500"}`}>
                  {hasEntry ? (hasExit ? "Çıktı" : "İçeride") : "Kayıt Yok"}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-500 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>login</span>
                  <span className="text-xs font-semibold text-gray-600">{formatTime(p.entry)}</span>
                  {p.entry && !p.entryVerified && (
                    <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">Manuel</span>
                  )}
                </div>
                <span className="text-gray-300">·</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-red-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>logout</span>
                  <span className="text-xs font-semibold text-gray-600">{formatTime(p.exit)}</span>
                  {p.exit && !p.exitVerified && (
                    <span className="text-[9px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">Manuel</span>
                  )}
                </div>
                {duration && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-blue-600 font-bold">{duration}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
