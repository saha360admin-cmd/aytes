"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface ShiftAssignment {
  id: string;
  shift_date: string;
  shift_code: string;
  status: string;
}

interface Coworker {
  id: string;
  full_name: string;
  phone: string | null;
}

interface ShiftInfo {
  name: string;
  start_time: string;
  end_time: string;
}

const TR_SHORT_DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getShiftIcon(code: string) {
  const u = code.toUpperCase();
  if (u.includes("GEC") || u.startsWith("N") || u === "GG") return "dark_mode";
  if (u.startsWith("A")) return "nights_stay";
  return "light_mode";
}

export default function VardiyalarPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [shiftInfo, setShiftInfo] = useState<ShiftInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = toDateStr(today);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "admin" || personnel.role === "supervisor") {
      router.replace("/yonetici/vardiyalar");
      return;
    }
    loadAssignments();
  }, [personnel]);

  useEffect(() => {
    if (!personnel || assignments.length === 0) return;
    const sel = toDateStr(selectedDate);
    const sa = assignments.find(a => a.shift_date === sel);
    if (sa) loadDetails(sa.shift_code, sel);
    else { setCoworkers([]); setShiftInfo(null); }
  }, [selectedDate, assignments]);

  async function loadAssignments() {
    if (!personnel) return;
    const start = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
    const end = toDateStr(new Date(today.getFullYear(), today.getMonth() + 2, 0));
    const { data } = await supabase
      .from("shift_assignments")
      .select("id, shift_date, shift_code, status")
      .eq("personnel_id", personnel.id)
      .eq("status", "published")
      .gte("shift_date", start)
      .lte("shift_date", end)
      .order("shift_date");
    setAssignments(data || []);
    setLoading(false);
  }

  async function loadDetails(code: string, dateStr: string) {
    if (!personnel || !personnel.location_id) return;

    const overlapMap: Record<string, string[]> = { "1": ["1", "5", "7"], "2": ["2", "5", "6", "7", "8"], "3": ["3", "6", "8"], "5": ["1", "2", "5"], "6": ["2", "3", "6"], "7": ["1", "2", "7"], "8": ["2", "3", "8"] };
    const codesToQuery = overlapMap[code] ?? [code];

    const [cwRes, shiftRes] = await Promise.all([
      // Aynı lokasyon + aynı tarih + örtüşen vardiya kodlarına sahip diğer personel
      supabase
        .from("shift_assignments")
        .select("personnel_id")
        .eq("location_id", personnel.location_id)
        .eq("shift_date", dateStr)
        .in("shift_code", codesToQuery)
        .eq("status", "published")
        .neq("personnel_id", personnel.id)
        .limit(10),
      // Vardiya tipi bilgisi
      supabase
        .from("shift_types")
        .select("name, start_time, end_time")
        .eq("department_id", personnel.department_id)
        .eq("code", code)
        .maybeSingle(),
    ]);

    if (cwRes.data && cwRes.data.length > 0) {
      const ids = cwRes.data.map((r: { personnel_id: string }) => r.personnel_id);
      const { data: pData } = await supabase
        .from("personnel")
        .select("id, full_name, phone")
        .in("id", ids);
      setCoworkers(pData || []);
    } else {
      setCoworkers([]);
    }

    setShiftInfo(shiftRes.data || null);
  }

  // Current week Mon–Sun
  const weekDays = useMemo(() => {
    const dow = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }, [today]);

  const byDate = useMemo(() => {
    const m: Record<string, ShiftAssignment> = {};
    assignments.forEach(a => (m[a.shift_date] = a));
    return m;
  }, [assignments]);

  const selectedStr = toDateStr(selectedDate);
  const selectedShift = byDate[selectedStr];
  const upcoming = assignments.filter(a => a.shift_date >= todayStr);
  const thisMonth = assignments.filter(a => {
    const d = new Date(a.shift_date + "T00:00:00");
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });

  const overtimeHours = thisMonth.reduce((total, a) => {
    const code = a.shift_code;
    if (code === "5" || code === "6") return total + 3.5;
    if (code === "7" || code === "8") return total + 7.5;
    return total;
  }, 0);

  const unpaidLeaveDays  = thisMonth.filter(a => a.shift_code === "T245").length;
  const annualLeaveDays  = thisMonth.filter(a => a.shift_code === "T216").length;
  const doctorReportDays = thisMonth.filter(a => a.shift_code === "T241").length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="material-symbols-outlined animate-spin text-[40px] text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col">

      {/* ── Top App Bar ── */}
      <header className="w-full sticky top-0 z-40 bg-surface shadow-sm px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="active:scale-95 transition-transform p-2 -ml-2 rounded-full hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <h1 className="text-headline-md font-bold text-primary">Vardiyalar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="active:scale-95 transition-transform p-2 rounded-full hover:bg-surface-container-high">
            <span className="material-symbols-outlined text-primary">calendar_month</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary-container border-2 border-primary-container flex items-center justify-center overflow-hidden">
            <span
              className="material-symbols-outlined text-on-primary text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              person
            </span>
          </div>
        </div>
      </header>

      <main className="w-full flex-1 px-6 pb-32 pt-6 flex flex-col gap-8">

        {/* ── Weekly Calendar ── */}
        <section className="flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <h2 className="text-headline-md font-bold text-on-surface">Bu Hafta</h2>
            <span className="text-label-md text-on-surface-variant">
              {TR_MONTHS[today.getMonth()]} {today.getFullYear()}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar py-2 -mx-2 px-2">
            {weekDays.map(day => {
              const dStr = toDateStr(day);
              const isSelected = dStr === selectedStr;
              const dayShift = byDate[dStr];
              return (
                <button
                  key={dStr}
                  onClick={() => setSelectedDate(new Date(day))}
                  className={`flex flex-col items-center justify-center min-w-[56px] h-20 rounded-xl transition-all ${
                    isSelected
                      ? "bg-primary text-on-primary scale-105 active-day-shadow cursor-default"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high cursor-pointer"
                  }`}
                >
                  <span className="text-label-sm font-semibold">
                    {TR_SHORT_DAYS[day.getDay()]}
                  </span>
                  <span className="text-headline-md font-bold">{day.getDate()}</span>
                  {dayShift ? (
                    <span
                      className={`text-label-sm font-semibold ${
                        isSelected ? "text-on-primary/80" : "text-primary/60"
                      }`}
                    >
                      {dayShift.shift_code.length > 4
                        ? dayShift.shift_code.slice(0, 4)
                        : dayShift.shift_code}
                    </span>
                  ) : (
                    <span className="text-label-sm">&nbsp;</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Shift Details Card ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-headline-md font-bold text-on-surface">Vardiya Detayları</h2>

          {selectedShift ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-lg p-lg border-l-[8px] border-primary-container flex flex-col gap-4 relative overflow-hidden">
              {/* Decorative blob */}
              <div className="absolute -right-12 -top-12 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

              {/* Title row */}
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-primary text-[20px]">
                      {getShiftIcon(selectedShift.shift_code)}
                    </span>
                    <span className="text-body-lg font-bold text-on-surface">
                      {shiftInfo?.name ?? `${selectedShift.shift_code} Vardiyası`}
                    </span>
                  </div>
                  {shiftInfo && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-outline text-[18px]">
                        schedule
                      </span>
                      <span className="text-body-md text-on-surface-variant">
                        {shiftInfo.start_time?.slice(0, 5) ?? "—"} - {shiftInfo.end_time?.slice(0, 5) ?? "—"}
                      </span>
                    </div>
                  )}
                </div>
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-label-sm font-semibold">
                  {selectedStr === todayStr ? "Aktif" : selectedStr < todayStr ? "Geçmiş" : "Yaklaşan"}
                </span>
              </div>

              {/* Details list */}
              <div className="flex flex-col gap-3 pt-4 border-t border-outline-variant">
                {/* Location / Department */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary">location_on</span>
                  </div>
                  <div>
                    <p className="text-label-sm text-outline font-semibold">Konum</p>
                    <p className="text-body-md font-medium">
                      {personnel?.locations?.name ?? personnel?.departments?.name ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Co-workers */}
                {coworkers.length > 0 ? (
                  coworkers.map(cw => (
                    <div key={cw.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                        <span
                          className="material-symbols-outlined text-primary text-[20px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          person
                        </span>
                      </div>
                      <div>
                        <p className="text-label-sm text-outline font-semibold">
                          Birlikte Çalışanlar
                        </p>
                        <p className="text-body-md font-medium">{cw.full_name}</p>
                      </div>
                      <div className="ml-auto flex gap-2 flex-shrink-0">
                        <a
                          href={cw.phone ? `tel:${cw.phone}` : undefined}
                          className="w-10 h-10 rounded-full border border-primary text-primary flex items-center justify-center active:bg-primary/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]">call</span>
                        </a>
                        {cw.phone && (
                          <a
                            href={`https://wa.me/90${cw.phone.replace(/\s/g, "").replace(/^0/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full border border-[#25D366] text-[#25D366] flex items-center justify-center active:bg-[#25D366]/10 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-outline text-[20px]">group</span>
                    </div>
                    <p className="text-body-md text-on-surface-variant">
                      Bu vardiyada ekip bilgisi bulunamadı
                    </p>
                  </div>
                )}
              </div>

              {/* Info note */}
              <div className="bg-tertiary-fixed text-on-tertiary-fixed-variant p-4 rounded-lg flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] flex-shrink-0">info</span>
                <p className="text-label-md font-semibold">
                  Vardiya kodu: <strong>{selectedShift.shift_code}</strong> — Tarih:{" "}
                  {new Date(selectedShift.shift_date + "T00:00:00").toLocaleDateString("tr-TR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-lg p-lg flex flex-col items-center gap-3 py-10">
              <span className="material-symbols-outlined text-outline text-[48px]">event_busy</span>
              <p className="text-body-md text-on-surface-variant text-center">
                {selectedStr === todayStr
                  ? "Bugün için atanmış vardiya yok"
                  : "Bu gün için vardiya bulunmuyor"}
              </p>
            </div>
          )}
        </section>

        {/* ── Monthly Summary ── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-headline-md font-bold text-on-surface">Aylık Özet</h2>

          {/* 3-col grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-container-lowest rounded-xl shadow-md p-2 flex flex-col items-center justify-center gap-2 border-b-4 border-secondary">
              <span className="material-symbols-outlined text-secondary text-[24px]">timer</span>
              <span className="text-headline-md font-bold text-secondary">
                {thisMonth.length * 8}
              </span>
              <span className="text-label-sm text-on-surface-variant text-center">Toplam Saat</span>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-md p-2 flex flex-col items-center justify-center gap-2 border-b-4 border-primary">
              <span className="material-symbols-outlined text-primary text-[24px]">event_repeat</span>
              <span className="text-headline-md font-bold text-primary">{upcoming.length}</span>
              <span className="text-label-sm text-on-surface-variant text-center">
                Gelecek Vardiya
              </span>
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-md p-2 flex flex-col items-center justify-center gap-2 border-b-4 border-tertiary">
              <span className="material-symbols-outlined text-tertiary text-[24px]">more_time</span>
              <span className="text-headline-md font-bold text-tertiary">{overtimeHours}</span>
              <span className="text-label-sm text-on-surface-variant text-center">Fazla Mesai</span>
            </div>
          </div>

          {/* Stat rows */}
          {[
            {
              icon: "event_busy",
              iconBg: "bg-primary",
              iconText: "text-on-primary",
              shadow: "shadow-primary/20",
              label: "Ücretsiz İzin",
              sub: "Bu ay toplam",
              value: unpaidLeaveDays > 0 ? `${unpaidLeaveDays} Gün` : "—",
              valueClass: "text-primary",
            },
            {
              icon: "calendar_today",
              iconBg: "bg-primary",
              iconText: "text-on-primary",
              shadow: "shadow-primary/20",
              label: "Yıllık İzin",
              sub: "Bu ay toplam",
              value: annualLeaveDays > 0 ? `${annualLeaveDays} Gün` : "—",
              valueClass: "text-primary",
            },
            {
              icon: "medical_information",
              iconBg: "bg-error",
              iconText: "text-on-error",
              shadow: "shadow-error/20",
              label: "Doktor Raporu",
              sub: "Bu ay toplam",
              value: doctorReportDays > 0 ? `${doctorReportDays} Gün` : "—",
              valueClass: "text-error",
            },
            {
              icon: "work_history",
              iconBg: "bg-tertiary",
              iconText: "text-on-tertiary",
              shadow: "shadow-tertiary/20",
              label: "Yapılan Mesai",
              sub: "Yıllık toplam",
              value: `${overtimeHours} Saat`,
              valueClass: "text-tertiary",
            },
            {
              icon: "verified",
              iconBg: "bg-secondary",
              iconText: "text-on-secondary",
              shadow: "shadow-secondary/20",
              label: "Performans Puanı",
              sub: "Mevcut dönem",
              value: "—",
              valueClass: "text-secondary",
            },
          ].map(({ icon, iconBg, iconText, shadow, label, sub, value, valueClass }) => (
            <div
              key={label}
              className="bg-surface-container-high rounded-xl p-md flex items-center justify-between mt-2"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shadow-md ${shadow}`}
                >
                  <span className={`material-symbols-outlined ${iconText}`}>{icon}</span>
                </div>
                <div>
                  <p className="text-body-md font-bold">{label}</p>
                  <p className="text-label-sm text-on-surface-variant">{sub}</p>
                </div>
              </div>
              <span className={`text-headline-md font-bold ${valueClass}`}>{value}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
