"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Location { id: string; name: string; }
interface PersonnelItem { id: string; full_name: string; }
interface ShiftType { id: string; code: string; name: string; color: string; is_day_off: boolean; sort_order: number; }

const TR_SHORT_DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}


function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function shortName(name: string) {
  const parts = name.split(" ");
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default function VardiyaOlusturmaPage() {
  const router = useRouter();
  const { personnel } = useAuth();

  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocId, setSelectedLocId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [personnelList, setPersonnelList] = useState<PersonnelItem[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [locOpen, setLocOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const locRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const weekDays = useMemo(() => {
    const dow = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
  }, [today]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (locRef.current && !locRef.current.contains(e.target as Node)) setLocOpen(false);
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) setMonthOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Vardiya tipleri sayfasından geri dönünce yenile
  useEffect(() => {
    function onVisible() { if (document.visibilityState === "visible" && personnel) loadShiftTypes(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [personnel]);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadLocations();
    loadShiftTypes();
  }, [personnel]);

  async function loadShiftTypes() {
    const { data } = await supabase
      .from("shift_types")
      .select("id, code, name, color, is_day_off, sort_order")
      .eq("department_id", personnel!.department_id)
      .order("sort_order")
      .order("created_at");
    setShiftTypes(data || []);
  }

  useEffect(() => {
    if (!selectedLocId) return;
    loadPersonnel();
  }, [selectedLocId]);

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("id, name").order("name");
    if (data && data.length > 0) {
      setLocations(data);
      setSelectedLocId(data[0].id);
    }
    setLoading(false);
  }

  async function loadPersonnel() {
    setPersonnelList([]);
    setCells({});
    const startStr = toDateStr(weekDays[0]);
    const endStr = toDateStr(weekDays[6]);

    const [{ data: pData }, { data: saData }] = await Promise.all([
      supabase.from("personnel").select("id, full_name").eq("location_id", selectedLocId).neq("status", "archived").order("full_name"),
      supabase.from("shift_assignments").select("personnel_id, shift_date, shift_code").eq("location_id", selectedLocId).gte("shift_date", startStr).lte("shift_date", endStr),
    ]);

    setPersonnelList(pData || []);
    const newCells: Record<string, string> = {};
    (saData || []).forEach(sa => { newCells[`${sa.personnel_id}_${sa.shift_date}`] = sa.shift_code; });
    setCells(newCells);
  }

  // Dinamik döngü: shift_types sırasıyla → boş
  const shiftCycle = useMemo(() => [...shiftTypes.map(s => s.code), ""], [shiftTypes]);

  function cycleCell(personnelId: string, dateStr: string) {
    const key = `${personnelId}_${dateStr}`;
    const cur = cells[key] ?? "";
    const idx = shiftCycle.indexOf(cur);
    const next = shiftCycle[(idx + 1) % shiftCycle.length];
    setCells(prev => ({ ...prev, [key]: next }));
  }

  function cellColor(code: string | null | undefined): string {
    if (!code) return "";
    return shiftTypes.find(s => s.code === code)?.color || "#004191";
  }

  function cellBg(code: string | null | undefined): React.CSSProperties {
    if (!code) return {};
    const color = cellColor(code);
    const st = shiftTypes.find(s => s.code === code);
    if (st?.is_day_off) return { backgroundColor: "#ffdad6", color: "#93000a" };
    return { backgroundColor: color, color: "#ffffff" };
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function saveAll(status: "draft" | "published") {
    if (!selectedLocId || !personnel) return;
    status === "draft" ? setSaving(true) : setPublishing(true);

    const upserts: object[] = [];
    personnelList.forEach(p => {
      weekDays.forEach(day => {
        const dateStr = toDateStr(day);
        const code = cells[`${p.id}_${dateStr}`];
        if (code) {
          upserts.push({ personnel_id: p.id, location_id: selectedLocId, shift_date: dateStr, shift_code: code, status, created_by: personnel.id });
        }
      });
    });

    const deletes: object[] = [];
    personnelList.forEach(p => {
      weekDays.forEach(day => {
        const dateStr = toDateStr(day);
        const code = cells[`${p.id}_${dateStr}`];
        if (!code) deletes.push({ personnel_id: p.id, shift_date: dateStr });
      });
    });

    let err = null;
    if (upserts.length > 0) {
      const res = await supabase.from("shift_assignments").upsert(upserts, { onConflict: "personnel_id,shift_date" });
      if (res.error) err = res.error;
    }
    for (const d of deletes as { personnel_id: string; shift_date: string }[]) {
      await supabase.from("shift_assignments").delete().eq("personnel_id", d.personnel_id).eq("shift_date", d.shift_date).eq("location_id", selectedLocId);
    }

    status === "draft" ? setSaving(false) : setPublishing(false);
    err ? showToast("Hata: " + err.message, false) : showToast(status === "draft" ? "Taslak kaydedildi" : "Vardiyalar yayınlandı!", true);
  }

  const selectedLoc = locations.find(l => l.id === selectedLocId);
  const dayOffCodes = shiftTypes.filter(s => s.is_day_off).map(s => s.code);
  const totalWorkShifts = Object.values(cells).filter(v => v && !dayOffCodes.includes(v)).length;
  const overtimeShifts = Object.values(cells).filter(v => {
    if (!v) return false;
    const st = shiftTypes.find(s => s.code === v);
    return st && !st.is_day_off;
  }).length;
  const activeCount = personnelList.filter(p => weekDays.some(day => {
    const c = cells[`${p.id}_${toDateStr(day)}`];
    return c && !dayOffCodes.includes(c);
  })).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
        <span className="material-symbols-outlined animate-spin text-[40px] text-[#3949AB]">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-[152px]">

      {/* Toast */}
      {toast && (
        <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white whitespace-nowrap ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* ── Header + Başlık bandı ── */}
      <div style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="flex justify-between items-center px-4 h-16">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
            <h1 className="font-bold text-white text-lg">AYTES</h1>
          </div>
          <button
            onClick={() => router.push("/vardiya-tanimlama")}
            className="flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-white/30 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[16px]">tune</span>
            Vardiya Tipleri
          </button>
        </div>
        <div className="px-4 pb-4">
          <h2 className="text-xl font-bold text-white">Vardiya Çizelgesi</h2>
          <p className="text-sm text-white/75 mt-1">Haftalık vardiya planlaması</p>
        </div>
      </div>
      <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-4 flex flex-col gap-5 -mt-2">

        {/* ── Filters Row ── */}
        <div className="flex items-center gap-3">
          {/* Location */}
          <div className="relative flex-1" ref={locRef}>
            <button
              onClick={() => { setLocOpen(o => !o); setMonthOpen(false); }}
              className="flex items-center gap-2 w-full px-4 py-2 bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[#3949AB] text-[18px] flex-shrink-0">location_on</span>
              <span className="text-sm font-semibold text-gray-700 truncate">{selectedLoc?.name ?? "Lokasyon"}</span>
              <span className="material-symbols-outlined text-[#3949AB] ml-auto flex-shrink-0 text-[20px]">expand_more</span>
            </button>
            {locOpen && (
              <div className="absolute left-0 mt-2 w-full max-h-64 overflow-y-auto bg-white rounded-2xl shadow-lg border border-gray-100 z-50">
                <div className="py-2">
                  {locations.map(l => (
                    <button
                      key={l.id}
                      onClick={() => { setSelectedLocId(l.id); setLocOpen(false); }}
                      className={`w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm font-semibold transition-colors ${l.id === selectedLocId ? "text-[#3949AB]" : "text-gray-700"}`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Month */}
          <div className="relative flex-shrink-0" ref={monthRef}>
            <button
              onClick={() => { setMonthOpen(o => !o); setLocOpen(false); }}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-95 transition-all"
            >
              <span className="text-sm font-semibold text-gray-700">{TR_MONTHS[selectedMonth]}</span>
              <span className="material-symbols-outlined text-[#3949AB] text-[20px]">expand_more</span>
            </button>
            {monthOpen && (
              <div className="absolute right-0 mt-2 w-36 max-h-56 overflow-y-auto bg-white rounded-2xl shadow-lg border border-gray-100 z-50">
                <div className="py-2">
                  {TR_MONTHS.map((m, i) => (
                    <button
                      key={m}
                      onClick={() => { setSelectedMonth(i); setMonthOpen(false); }}
                      className={`w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm font-semibold transition-colors ${i === selectedMonth ? "text-[#3949AB]" : "text-gray-700"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Stats Strip ── */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {[
            { label: "Toplam Çalışma", value: totalWorkShifts * 8, unit: "saat", accent: "#3949AB", icon: "trending_up",  iconBg: "bg-indigo-100", iconColor: "text-indigo-600" },
            { label: "Fazla Mesai",    value: overtimeShifts * 4,  unit: "saat", accent: "#FF9800", icon: "warning",      iconBg: "bg-orange-100", iconColor: "text-orange-600" },
            { label: "Aktif Personel", value: activeCount,         unit: "kişi", accent: "#4CAF50", icon: "check_circle", iconBg: "bg-emerald-100", iconColor: "text-emerald-600" },
          ].map(({ label, value, unit, accent, icon, iconBg, iconColor }) => (
            <div key={label} className="min-w-[150px] bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-1 border border-gray-100">
              <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center mb-1`}>
                <span className={`material-symbols-outlined text-[18px] ${iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              </div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold" style={{ color: accent }}>{value}</span>
                <span className="text-xs font-semibold text-gray-400 pb-1">{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Weekly Schedule Table ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800">Haftalık Çizelge</h2>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
                  <tr>
                    <th className="p-3 text-xs font-semibold text-white/80 min-w-[130px] sticky left-0 z-10 border-r border-white/20"
                      style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
                      Personel
                    </th>
                    {weekDays.map(day => (
                      <th key={toDateStr(day)} className="p-3 text-xs font-semibold text-white/80 text-center whitespace-nowrap min-w-[64px]">
                        {day.getDate()} {TR_SHORT_DAYS[day.getDay()]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {personnelList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400 text-sm font-semibold">
                        Bu lokasyonda tanımlı personel bulunamadı
                      </td>
                    </tr>
                  ) : (
                    personnelList.map(p => (
                      <tr key={p.id} className="hover:bg-indigo-50/40 transition-colors">
                        {/* Sticky personnel cell */}
                        <td className="p-3 sticky left-0 bg-white z-10 border-r border-gray-100 hover:bg-indigo-50/40">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {initials(p.full_name)}
                            </div>
                            <span className="text-xs font-semibold text-gray-700 max-w-[80px] truncate leading-tight">
                              {shortName(p.full_name)}
                            </span>
                          </div>
                        </td>

                        {/* Day cells */}
                        {weekDays.map(day => {
                          const dateStr = toDateStr(day);
                          const key = `${p.id}_${dateStr}`;
                          const code = cells[key] ?? "";
                          const bg = cellBg(code);
                          return (
                            <td key={dateStr} className="p-1.5">
                              <button
                                onClick={() => cycleCell(p.id, dateStr)}
                                className="w-full h-9 flex items-center justify-center text-xs font-bold transition-all active:scale-90 rounded-lg"
                                style={code ? bg : { backgroundColor: "#e8eaf0", color: "#727785" }}
                              >
                                {code || "—"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info tip */}
          <div className="mt-3 p-3 bg-indigo-50 rounded-2xl flex gap-3 border border-indigo-100">
            <span className="material-symbols-outlined text-[#3949AB] flex-shrink-0 text-[20px]">info</span>
            <p className="text-xs font-semibold text-indigo-700">
              Hücrelere dokunarak vardiya tiplerini (T211 → G1 → G2 → OFF) hızlıca değiştirebilirsiniz.
            </p>
          </div>
        </section>

      </main>

      {/* ── Bottom Action Bar (sticky, above BottomNav) ── */}
      <footer className="sticky bottom-20 px-4 py-3 bg-white/95 backdrop-blur-sm shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex gap-3 z-40 border-t border-gray-100">
        <button
          onClick={() => saveAll("draft")}
          disabled={saving || publishing}
          className="flex-1 h-12 bg-gray-100 text-gray-600 rounded-2xl text-sm font-semibold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-gray-200"
        >
          {saving && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
          Taslağı Kaydet
        </button>
        <button
          onClick={() => saveAll("published")}
          disabled={saving || publishing}
          className="flex-1 h-12 text-white rounded-2xl text-sm font-semibold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
          style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}
        >
          {publishing && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
          Vardiyayı Yayınla
        </button>
      </footer>

    </div>
  );
}
