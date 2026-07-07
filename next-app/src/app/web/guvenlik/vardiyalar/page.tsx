"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";

// Renk paleti, süre hesaplama ve vardiya çizelgesi mantığı mobildeki
// (mobile)/vardiya-tanimlama ve (mobile)/vardiya-olustur sayfalarıyla
// birebir aynı — aynı shift_types/shift_assignments tablolarını
// paylaştıkları için mobil ve masaüstü aynı kuralları uygulamalı.
const COLORS = [
  { label: "Lacivert", value: "#1A237E" },
  { label: "Mavi", value: "#0058be" },
  { label: "Yeşil", value: "#006c49" },
  { label: "Turuncu", value: "#825100" },
  { label: "Kırmızı", value: "#ba1a1a" },
  { label: "Mor", value: "#6A1B9A" },
  { label: "Gri", value: "#727785" },
];

const TYPE_LABELS = ["Normal", "Uzun Vardiya", "Gece Vardiyası", "İzin", "Tatil", "Özel"];

const TR_SHORT_DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const emptyForm = {
  code: "",
  name: "",
  type_label: "Normal",
  start_time: "",
  end_time: "",
  break_hours: "0",
  is_day_off: false,
  color: "#0058be",
};

function calcDuration(start: string, end: string, breakH: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60 - Number(breakH || 0)) * 10) / 10;
}

function formatTime(t: string | null) {
  if (!t) return "—";
  return t.slice(0, 5);
}

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

interface ShiftType {
  id: string;
  code: string;
  name: string;
  type_label: string;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  break_hours: number | null;
  is_day_off: boolean;
  color: string;
  sort_order: number;
}

interface ScheduleShiftType { id: string; code: string; name: string; color: string; is_day_off: boolean; sort_order: number; duration_hours: number | null; }
interface Location { id: string; name: string; }
interface PersonnelItem { id: string; full_name: string; }

// Fazla mesai hesabı — güvenlik biriminin gerçek bordro kuralı:
// 1/2/3 normal vardiya (8s - 30dk mola), 5/6 uzun vardiya, 7/8 gece/en uzun
// vardiya; T216 (Yıllık İzin) ve T241 (Rapor) çalışmamış ama 7,5s olarak
// sayılır, T245 (Ücretsiz İzin) hiç sayılmaz. Ay eşiği: (ay gün sayısı - 4
// hafta tatili) × 7,5 saat — 30 günlük ayda 195s, 31 günlük ayda 202,5s.
const KNOWN_CODE_HOURS: Record<string, number> = {
  "1": 7.5, "2": 7.5, "3": 7.5,
  "5": 11, "6": 11,
  "7": 15, "8": 15,
  T216: 7.5,
  T241: 7.5,
  T245: 0,
};

// T211 = hafta tatili. Eşik formülü ayda 4 hafta tatili varsayıyor;
// bir personelin o ay 4'ten fazla T211'i varsa fazlası ayrıca ele alınır.
const WEEKLY_REST_CODE = "T211";
const WEEKLY_REST_ALLOWANCE = 4;
const WEEKLY_REST_EXTRA_HOURS = 7.5;

function hoursForShiftCode(code: string, shiftTypes: ScheduleShiftType[]): number {
  if (code in KNOWN_CODE_HOURS) return KNOWN_CODE_HOURS[code];
  const st = shiftTypes.find(s => s.code === code);
  if (!st) return 0;
  if (st.is_day_off) return 0;
  return st.duration_hours ?? 0;
}

function monthlyOvertimeThreshold(daysInMonth: number): number {
  return (daysInMonth - 4) * 7.5;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

const TABS = [
  { key: "program", label: "Vardiya Programı", icon: "calendar_month" },
  { key: "tanimlar", label: "Vardiya Tanımları", icon: "tune" },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function WebGuvenlikVardiyalarPage() {
  const [tab, setTab] = useState<TabKey>("program");

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">Vardiya Yönetimi</h1>
          <p className="text-on-surface-variant">Güvenlik departmanının vardiya programını ve vardiya tiplerini buradan yönetin.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
                tab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "program" ? <ShiftScheduleSection /> : <ShiftTypesSection />}
    </div>
  );
}

// ───────────────────────── Vardiya Programı (schedule grid) ─────────────────────────

function ShiftScheduleSection() {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ScheduleShiftType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocId, setSelectedLocId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [personnelList, setPersonnelList] = useState<PersonnelItem[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const savedCells = useRef<Record<string, string>>({});

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const selectedYear = today.getFullYear();

  const monthDays = useMemo(() => {
    const count = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => new Date(selectedYear, selectedMonth, i + 1));
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    loadLocations();
    loadShiftTypes();
  }, []);

  useEffect(() => {
    if (!selectedLocId || !deptId) return;
    loadPersonnel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocId, selectedMonth, deptId]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function loadShiftTypes() {
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) return;
    setDeptId(dept.id);
    const { data } = await supabase
      .from("shift_types")
      .select("id, code, name, color, is_day_off, sort_order, duration_hours")
      .eq("department_id", dept.id)
      .order("sort_order")
      .order("created_at");
    setShiftTypes((data || []) as ScheduleShiftType[]);
  }

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("id, name").order("name");
    if (data && data.length > 0) {
      setLocations(data);
      setSelectedLocId(data[0].id);
    }
    setLoading(false);
  }

  async function loadPersonnel() {
    if (!deptId) return;
    setLoadingGrid(true);
    setPersonnelList([]);
    setCells({});
    const startStr = toDateStr(monthDays[0]);
    const endStr = toDateStr(monthDays[monthDays.length - 1]);

    const [{ data: pData }, { data: saData }] = await Promise.all([
      supabase.from("personnel").select("id, full_name").eq("location_id", selectedLocId).eq("department_id", deptId).neq("status", "archived").order("full_name"),
      supabase.from("shift_assignments").select("personnel_id, shift_date, shift_code").eq("location_id", selectedLocId).gte("shift_date", startStr).lte("shift_date", endStr),
    ]);

    setPersonnelList((pData || []) as PersonnelItem[]);
    const newCells: Record<string, string> = {};
    (saData || []).forEach(sa => { newCells[`${sa.personnel_id}_${sa.shift_date}`] = sa.shift_code; });
    setCells(newCells);
    savedCells.current = { ...newCells };
    setLoadingGrid(false);
  }

  const shiftCycle = useMemo(() => [...shiftTypes.map(s => s.code), ""], [shiftTypes]);

  function cycleCell(personnelId: string, dateStr: string) {
    const key = `${personnelId}_${dateStr}`;
    const cur = cells[key] ?? "";
    const idx = shiftCycle.indexOf(cur);
    const next = shiftCycle[(idx + 1) % shiftCycle.length];
    setCells(prev => ({ ...prev, [key]: next }));
  }

  function cellBg(code: string | null | undefined): React.CSSProperties {
    if (!code) return {};
    const st = shiftTypes.find(s => s.code === code);
    if (st?.is_day_off) return { backgroundColor: "#ffdad6", color: "#93000a" };
    return { backgroundColor: st?.color || "#004191", color: "#ffffff" };
  }

  // Sadece masaüstü: Excel'den kopyalanan bir blok, tıklanan hücreden
  // başlayarak sağa (günler) ve aşağıya (personel) doğru yapıştırılır.
  // Excel panosu satırları "\n", sütunları "\t" ile ayırır.
  function handlePasteAt(e: React.ClipboardEvent<HTMLButtonElement>, originRow: number, originCol: number) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text.trim()) return;

    const rows = text.replace(/\r/g, "").split("\n");
    while (rows.length && rows[rows.length - 1] === "") rows.pop();

    const validCodes = new Set(shiftTypes.map(s => s.code.toUpperCase()));
    const next = { ...cells };
    let applied = 0;
    let skipped = 0;

    rows.forEach((rowText, ri) => {
      const pIdx = originRow + ri;
      if (pIdx >= personnelList.length) return;
      rowText.split("\t").forEach((raw, ci) => {
        const dIdx = originCol + ci;
        if (dIdx >= monthDays.length) return;
        const val = raw.trim();
        const key = `${personnelList[pIdx].id}_${toDateStr(monthDays[dIdx])}`;
        if (val === "") { next[key] = ""; applied++; return; }
        const upper = val.toUpperCase();
        if (validCodes.has(upper)) { next[key] = upper; applied++; }
        else skipped++;
      });
    });

    setCells(next);
    showToast(
      skipped > 0 ? `${applied} hücre dolduruldu, ${skipped} tanınmayan kod atlandı` : `${applied} hücre Excel'den yapıştırıldı`,
      skipped === 0
    );
  }

  async function saveAll(status: "draft" | "published") {
    if (!selectedLocId) return;
    status === "draft" ? setSaving(true) : setPublishing(true);

    const upserts: { personnel_id: string; location_id: string; shift_date: string; shift_code: string; status: string }[] = [];
    personnelList.forEach(p => {
      monthDays.forEach(day => {
        const dateStr = toDateStr(day);
        const key = `${p.id}_${dateStr}`;
        const code = cells[key];
        if (code && code !== savedCells.current[key]) {
          upserts.push({ personnel_id: p.id, location_id: selectedLocId, shift_date: dateStr, shift_code: code, status });
        }
      });
    });

    const toDelete = personnelList.flatMap(p =>
      monthDays
        .filter(day => {
          const key = `${p.id}_${toDateStr(day)}`;
          return savedCells.current[key] && !cells[key];
        })
        .map(day => ({ personnel_id: p.id, shift_date: toDateStr(day) }))
    );

    let err: { message: string } | null = null;

    if (upserts.length > 0) {
      const res = await supabase.from("shift_assignments").upsert(upserts, { onConflict: "personnel_id,shift_date" });
      if (res.error) err = res.error;
    }

    if (!err && status === "published") {
      const res = await supabase.from("shift_assignments")
        .update({ status: "published" })
        .eq("location_id", selectedLocId)
        .gte("shift_date", toDateStr(monthDays[0]))
        .lte("shift_date", toDateStr(monthDays[monthDays.length - 1]));
      if (res.error) err = res.error;
    }

    if (!err && toDelete.length > 0) {
      const results = await Promise.all(
        toDelete.map(d =>
          supabase.from("shift_assignments").delete()
            .eq("personnel_id", d.personnel_id)
            .eq("shift_date", d.shift_date)
            .eq("location_id", selectedLocId)
        )
      );
      const deleteErr = results.find(r => r.error)?.error;
      if (deleteErr) err = deleteErr;
    }

    if (!err) {
      const newSaved = { ...savedCells.current };
      upserts.forEach(u => { newSaved[`${u.personnel_id}_${u.shift_date}`] = u.shift_code; });
      toDelete.forEach(d => { delete newSaved[`${d.personnel_id}_${d.shift_date}`]; });
      savedCells.current = newSaved;
    }

    status === "draft" ? setSaving(false) : setPublishing(false);
    err ? showToast("Hata: " + err.message, false) : showToast(status === "draft" ? "Taslak kaydedildi" : "Vardiyalar yayınlandı!", true);
  }

  const dayOffCodes = shiftTypes.filter(s => s.is_day_off).map(s => s.code);
  const monthlyThreshold = monthlyOvertimeThreshold(monthDays.length);
  let totalWorkHours = 0;
  let overtimeHours = 0;
  let unpaidLeaveDays = 0;
  let annualLeaveDays = 0;
  let sickReportDays = 0;
  const overtimeByPerson: { id: string; name: string; hours: number }[] = [];
  const deficitByPerson: { id: string; name: string; hours: number }[] = [];
  personnelList.forEach(p => {
    let personHours = 0;
    let weeklyRestCount = 0;
    monthDays.forEach(day => {
      const code = cells[`${p.id}_${toDateStr(day)}`];
      if (!code) return;
      if (code === WEEKLY_REST_CODE) { weeklyRestCount++; return; }
      if (code === "T245") unpaidLeaveDays++;
      else if (code === "T216") annualLeaveDays++;
      else if (code === "T241") sickReportDays++;
      personHours += hoursForShiftCode(code, shiftTypes);
    });
    // Eşik formülü ayda 4 hafta tatili varsayıyor; ay 5 hafta tatili
    // içeriyorsa (bazı aylarda T211 5 kez düşer) 5. gün normal dinlenme
    // günü sayılmaz, 7,5 saat çalışılmış gibi eklenir.
    personHours += Math.max(0, weeklyRestCount - WEEKLY_REST_ALLOWANCE) * WEEKLY_REST_EXTRA_HOURS;
    totalWorkHours += personHours;
    const personOvertime = Math.max(0, personHours - monthlyThreshold);
    overtimeHours += personOvertime;
    if (personOvertime > 0) overtimeByPerson.push({ id: p.id, name: p.full_name, hours: personOvertime });
    const personDeficit = Math.max(0, monthlyThreshold - personHours);
    if (personDeficit > 0) deficitByPerson.push({ id: p.id, name: p.full_name, hours: personDeficit });
  });
  overtimeByPerson.sort((a, b) => b.hours - a.hours);
  deficitByPerson.sort((a, b) => b.hours - a.hours);
  const activeCount = personnelList.filter(p => monthDays.some(day => {
    const c = cells[`${p.id}_${toDateStr(day)}`];
    return c && !dayOffCodes.includes(c);
  })).length;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <span className="material-symbols-outlined animate-spin text-[40px] text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Lokasyon</label>
              <select
                value={selectedLocId}
                onChange={e => setSelectedLocId(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Ay</label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                {TR_MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m} {selectedYear}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => saveAll("draft")}
              disabled={saving || publishing || !selectedLocId}
              className="px-5 py-2.5 rounded-full bg-surface-container-low text-on-surface-variant font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
              Taslağı Kaydet
            </button>
            <button
              onClick={() => saveAll("published")}
              disabled={saving || publishing || !selectedLocId}
              className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {publishing && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
              Vardiyayı Yayınla
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">trending_up</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">Toplam Çalışma</p>
            <h3 className="font-display text-headline-sm text-on-surface">{formatHours(totalWorkHours)} <span className="text-sm font-semibold text-on-surface-variant">saat</span></h3>
            <p className="text-[10px] text-on-surface-variant">Kişi başı hedef {formatHours(monthlyThreshold)}s</p>
            {deficitByPerson.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {deficitByPerson.map(d => (
                  <span key={d.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 whitespace-nowrap">
                    {d.name} -{formatHours(d.hours)}s
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">warning</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">Fazla Mesai</p>
            <h3 className="font-display text-headline-sm text-on-surface">{formatHours(overtimeHours)} <span className="text-sm font-semibold text-on-surface-variant">saat</span></h3>
            <p className="text-[10px] text-on-surface-variant">Kişi başı {formatHours(monthlyThreshold)}s üzeri</p>
            {overtimeByPerson.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {overtimeByPerson.map(o => (
                  <span key={o.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 whitespace-nowrap">
                    {o.name} {formatHours(o.hours)}s
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">check_circle</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface-variant">Aktif Personel</p>
            <h3 className="font-display text-headline-sm text-on-surface">{activeCount} <span className="text-sm font-semibold text-on-surface-variant">kişi</span></h3>
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 whitespace-nowrap">Ücretsiz İzin: {unpaidLeaveDays} gün</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 whitespace-nowrap">Yıllık İzin: {annualLeaveDays} gün</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 whitespace-nowrap">Doktor Raporu: {sickReportDays} gün</span>
            </div>
          </div>
        </div>
      </div>

      {shiftTypes.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {shiftTypes.map(st => (
            <div
              key={st.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-outline-variant/30 bg-surface-container-lowest text-xs font-bold"
              style={{ color: st.is_day_off ? "#93000a" : st.color }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.is_day_off ? "#ffdad6" : st.color }} />
              {st.code}
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden border border-outline-variant/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-surface-container z-10">
              <tr>
                <th className="px-4 py-3 font-semibold text-on-surface-variant whitespace-nowrap min-w-[160px] sticky left-0 bg-surface-container z-20 border-r border-outline-variant/20">
                  Personel
                </th>
                {monthDays.map(day => {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const isToday = toDateStr(day) === toDateStr(today);
                  return (
                    <th key={toDateStr(day)} className={`text-center p-2 min-w-[44px] ${isWeekend ? "bg-surface-container-high/60" : ""}`}>
                      <div className={`flex flex-col items-center py-1 rounded-lg ${isToday ? "bg-primary/15" : ""}`}>
                        <span className="text-[10px] text-on-surface-variant leading-none">{TR_SHORT_DAYS[day.getDay()]}</span>
                        <span className={`text-xs font-bold leading-none mt-0.5 ${isToday ? "text-primary" : "text-on-surface"}`}>{day.getDate()}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {loadingGrid ? (
                <tr>
                  <td colSpan={monthDays.length + 1} className="px-4 py-8 text-center text-on-surface-variant">
                    <span className="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                  </td>
                </tr>
              ) : personnelList.length === 0 ? (
                <tr>
                  <td colSpan={monthDays.length + 1} className="px-4 py-8 text-center text-on-surface-variant">
                    Bu lokasyonda tanımlı personel bulunamadı
                  </td>
                </tr>
              ) : (
                personnelList.map((p, pIdx) => (
                  <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-2 sticky left-0 bg-surface-container-lowest z-10 border-r border-outline-variant/20 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {initials(p.full_name)}
                        </div>
                        <span className="text-xs font-semibold text-on-surface truncate max-w-[100px]">{p.full_name}</span>
                      </div>
                    </td>
                    {monthDays.map((day, dIdx) => {
                      const dateStr = toDateStr(day);
                      const code = cells[`${p.id}_${dateStr}`] ?? "";
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = dateStr === toDateStr(today);
                      return (
                        <td key={dateStr} className={`p-1 ${isWeekend ? "bg-surface-container-high/30" : ""} ${isToday ? "bg-primary/5" : ""}`}>
                          <button
                            onClick={() => cycleCell(p.id, dateStr)}
                            onPaste={e => handlePasteAt(e, pIdx, dIdx)}
                            className="w-full h-8 flex items-center justify-center text-[11px] font-bold transition-all active:scale-90 rounded-md focus:outline-none focus:ring-2 focus:ring-primary relative focus:z-10"
                            style={code ? cellBg(code) : { backgroundColor: "transparent", color: "#9aa0b0" }}
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

      <div className="flex gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
        <span className="material-symbols-outlined text-primary flex-shrink-0 text-[20px]">content_paste</span>
        <p className="text-sm text-primary">
          Hücrelere tıklayarak vardiya tipini döngüsel olarak değiştirebilir, ya da Excel'de hazırladığınız bir bloğu kopyalayıp bir hücreye tıkladıktan sonra <strong>Ctrl+V</strong> ile yapıştırabilirsiniz — yapıştırma tıkladığınız hücreden başlayarak sağa (günler) ve aşağıya (personel, tablodaki sıraya göre) doğru uygulanır. Tanınmayan kodlar atlanır. Taslağı Kaydet ilerlemenizi saklar, Vardiyayı Yayınla o ayki tüm çizelgeyi personele görünür yapar.
        </p>
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full shadow-lg flex items-center gap-2 ${toast.ok ? "bg-on-surface text-surface" : "bg-error text-on-error"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          <span className="text-sm font-semibold">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Vardiya Tanımları (shift type CRUD) ─────────────────────────

function ShiftTypesSection() {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ShiftType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    load();
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) throw new Error("dept not found");
      setDeptId(dept.id);

      const { data, error: qError } = await supabase
        .from("shift_types")
        .select("*")
        .eq("department_id", dept.id)
        .order("sort_order")
        .order("created_at");
      if (qError) throw qError;
      setShiftTypes((data || []) as ShiftType[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  }

  function openEdit(s: ShiftType) {
    setEditingId(s.id);
    setForm({
      code: s.code,
      name: s.name,
      type_label: s.type_label || "Normal",
      start_time: s.start_time?.slice(0, 5) || "",
      end_time: s.end_time?.slice(0, 5) || "",
      break_hours: String(s.break_hours ?? 0),
      is_day_off: s.is_day_off,
      color: s.color || "#0058be",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim() || !deptId) return;
    setSaving(true);
    const duration = form.is_day_off ? null : calcDuration(form.start_time, form.end_time, form.break_hours);
    const payload = {
      department_id: deptId,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type_label: form.type_label,
      start_time: form.is_day_off ? null : form.start_time || null,
      end_time: form.is_day_off ? null : form.end_time || null,
      duration_hours: duration,
      break_hours: form.is_day_off ? null : Number(form.break_hours) || 0,
      is_day_off: form.is_day_off,
      color: form.color,
    };

    const { error: saveError } = editingId
      ? await supabase.from("shift_types").update(payload).eq("id", editingId)
      : await supabase.from("shift_types").insert(payload);

    setSaving(false);
    if (saveError) {
      showToast(saveError.message, false);
    } else {
      setModalOpen(false);
      showToast(editingId ? "Vardiya güncellendi" : "Vardiya eklendi", true);
      load();
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    await supabase.from("shift_types").delete().eq("id", deleteConfirm.id);
    setDeleting(false);
    setDeleteConfirm(null);
    showToast("Vardiya silindi", true);
    load();
  }

  const filtered = shiftTypes.filter(s => {
    if (typeFilter !== "all" && s.type_label !== typeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const activeCount = shiftTypes.filter(s => !s.is_day_off).length;
  const dayOffCount = shiftTypes.filter(s => s.is_day_off).length;
  const withDuration = shiftTypes.filter(s => s.duration_hours);
  const avgDuration = withDuration.length > 0
    ? withDuration.reduce((a, s) => a + (s.duration_hours || 0), 0) / withDuration.length
    : 0;

  const duration = form.is_day_off ? null : calcDuration(form.start_time, form.end_time, form.break_hours);

  const columns: DataTableColumn[] = [
    { key: "code", label: "Kodu", sortable: true },
    { key: "name", label: "Vardiya Adı", sortable: true },
    { key: "type", label: "Tip" },
    { key: "hours", label: "Saat Aralığı" },
    { key: "breakHours", label: "Mola" },
    { key: "duration", label: "Toplam Süre" },
    { key: "actions", label: "İşlemler", exportable: false },
  ];

  const tableData = filtered.map(s => {
    const code: DataTableCell = {
      csv: s.code,
      display: (
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
            style={{ backgroundColor: s.color }}
          >
            {s.code.slice(0, 4)}
          </div>
          <span className="font-bold text-on-surface">{s.code}</span>
        </div>
      ),
    };
    const type: DataTableCell = {
      csv: s.type_label,
      display: (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${s.color}1a`, color: s.color }}>
          {s.type_label}
        </span>
      ),
    };
    return {
      code,
      name: s.name,
      type,
      hours: s.is_day_off ? "Tüm Gün" : `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`,
      breakHours: s.is_day_off ? "—" : s.break_hours ? `${s.break_hours}s` : "Yok",
      duration: s.is_day_off ? "—" : s.duration_hours ? `${s.duration_hours}s` : "—",
      actions: (
        <div className="flex items-center justify-end gap-1">
          <button
            title="Düzenle"
            onClick={() => openEdit(s)}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button
            title="Sil"
            onClick={() => setDeleteConfirm(s)}
            className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      ),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          Yeni Vardiya Ekle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">event_repeat</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface-variant">Aktif Vardiya Tipi</p>
            <h3 className="font-display text-headline-sm text-on-surface">{activeCount}</h3>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">timelapse</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface-variant">Ortalama Süre</p>
            <h3 className="font-display text-headline-sm text-on-surface">{avgDuration > 0 ? `${avgDuration.toFixed(1)}s` : "—"}</h3>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-tertiary/10 flex items-center justify-center text-tertiary flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">event_busy</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface-variant">İzin / Tatil Tipi</p>
            <h3 className="font-display text-headline-sm text-on-surface">{dayOffCount}</h3>
          </div>
        </div>
      </div>

      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Kod veya İsim Ara</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Örn: T211 veya Uzun Gece"
                className="w-full bg-surface-container-low border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Vardiya Tipi</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Tüm Tipler</option>
              {TYPE_LABELS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <p className="text-error font-semibold">Veriler yüklenemedi. Sayfayı yenileyin.</p>
      ) : (
        <>
          <DataTable columns={columns} data={tableData} loading={loading} exportable />
          <p className="text-sm text-on-surface-variant">Toplam {filtered.length} vardiya tipi gösteriliyor</p>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <h2 className="font-display text-headline-sm text-on-surface">{editingId ? "Vardiyayı Düzenle" : "Yeni Vardiya Ekle"}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Vardiya Kodu *</label>
                  <input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="T211, G1, OFF…"
                    maxLength={10}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm font-bold uppercase tracking-widest focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Vardiya Adı *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Gündüz Vardiyası…"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Vardiya Tipi</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_LABELS.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type_label: t }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${form.type_label === t ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between bg-surface-container-low rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">event_busy</span>
                  <div>
                    <p className="text-sm font-bold text-on-surface">Tam Gün İzin / Tatil</p>
                    <p className="text-xs text-on-surface-variant">Saat aralığı gerekmez</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_day_off: !f.is_day_off }))}
                  className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${form.is_day_off ? "bg-primary" : "bg-outline-variant"}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_day_off ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>

              {!form.is_day_off && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-on-surface-variant ml-1">Başlangıç</label>
                      <input
                        type="time"
                        value={form.start_time}
                        onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-on-surface-variant ml-1">Bitiş</label>
                      <input
                        type="time"
                        value={form.end_time}
                        onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-on-surface-variant ml-1">Mola Süresi (saat)</label>
                    <div className="flex gap-2">
                      {["0", "0.5", "1", "1.5", "2"].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, break_hours: v }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${form.break_hours === v ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"}`}
                        >
                          {v === "0" ? "Yok" : `${v}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {duration !== null && duration > 0 && (
                    <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5">
                      <span className="material-symbols-outlined text-primary text-[18px]">timelapse</span>
                      <p className="text-sm font-bold text-primary">Net çalışma: <span>{duration} saat</span></p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Renk</label>
                <div className="flex gap-3 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      title={c.label}
                      className={`w-9 h-9 rounded-full transition-all ${form.color === c.value ? "ring-2 ring-offset-2 ring-on-surface-variant scale-110" : ""}`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>

              {form.code && (
                <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                    style={{ backgroundColor: form.color }}
                  >
                    {form.code.slice(0, 4)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">{form.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant">
                      {form.type_label} · {form.is_day_off ? "Tüm Gün" : duration ? `${duration}s net` : "Saat girilmedi"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
              <button
                onClick={handleSave}
                disabled={saving || !form.code.trim() || !form.name.trim()}
                className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
              >
                {saving ? "Kaydediliyor..." : editingId ? "Değişiklikleri Kaydet" : "Vardiya Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-error text-[24px]">delete</span>
              </div>
              <div>
                <p className="font-bold text-on-surface">Vardiyayı Sil</p>
                <p className="text-sm text-on-surface-variant">"{deleteConfirm.name}" silinecek. Onaylıyor musunuz?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-full bg-surface-container-low text-on-surface-variant font-bold text-sm transition-all"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full bg-error text-on-error font-bold text-sm transition-all disabled:opacity-60"
              >
                {deleting ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full shadow-lg flex items-center gap-2 ${toast.ok ? "bg-on-surface text-surface" : "bg-error text-on-error"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          <span className="text-sm font-semibold">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
