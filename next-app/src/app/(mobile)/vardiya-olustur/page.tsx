"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getDepartmentHeaderTheme } from "@/lib/departmentTheme";

interface Location { id: string; name: string; }
interface PersonnelItem { id: string; full_name: string; isGuest?: boolean; }
interface ShiftType { id: string; code: string; name: string; color: string; is_day_off: boolean; sort_order: number; duration_hours: number | null; start_time: string | null; end_time: string | null; }

// İki vardiya kodunun aynı takvim gününde saat olarak çakışıp çakışmadığını
// hesaplar (gece yarısını aşan vardiyalar dahil). Saati tanımsız olan
// (izin/rapor gibi is_day_off) kodlar çakışma sayılmaz.
function getShiftWindow(code: string, dateStr: string, shiftTypes: ShiftType[]): { start: Date; end: Date } | null {
  const st = shiftTypes.find(s => s.code === code);
  if (!st?.start_time || !st?.end_time) return null;
  const [sh, sm] = st.start_time.slice(0, 5).split(":").map(Number);
  const [eh, em] = st.end_time.slice(0, 5).split(":").map(Number);
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, sh, sm);
  let end = new Date(y, m - 1, d, eh, em);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function shiftsOverlap(codeA: string, codeB: string, dateStr: string, shiftTypes: ShiftType[]): boolean {
  const a = getShiftWindow(codeA, dateStr, shiftTypes);
  const b = getShiftWindow(codeB, dateStr, shiftTypes);
  if (!a || !b) return false;
  return a.start < b.end && b.start < a.end;
}

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

function hoursForShiftCode(code: string, shiftTypes: ShiftType[]): number {
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
  const headerTheme = getDepartmentHeaderTheme(personnel?.departments?.slug);

  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocId, setSelectedLocId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [weekIndex, setWeekIndex] = useState(0);
  const [personnelList, setPersonnelList] = useState<PersonnelItem[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [awayCells, setAwayCells] = useState<Record<string, boolean>>({});
  const [locOpen, setLocOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const locRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);
  const savedCells = useRef<Record<string, string>>({});

  // Geçici Görevlendirme: bir personel kısa süreliğine (ör. 1-2 gün) başka
  // bir lokasyona destek amaçlı atanabiliyor. Yeni bir tablo/kolon
  // gerektirmiyor — shift_assignments.location_id zaten her atamada var,
  // kişinin ev lokasyonundan (personnel.location_id) farklıysa bu doğal
  // olarak "geçici görevlendirme" anlamına geliyor.
  const [allPersonnel, setAllPersonnel] = useState<{ id: string; full_name: string; location_id: string | null }[]>([]);
  const [showTempAssign, setShowTempAssign] = useState(false);
  const [tempAssignSearch, setTempAssignSearch] = useState("");
  const [tempAssignForm, setTempAssignForm] = useState({ personnelId: "", startDate: "", endDate: "", shiftCode: "" });

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const selectedYear = today.getFullYear();

  const monthDays = useMemo(() => {
    const count = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => new Date(selectedYear, selectedMonth, i + 1));
  }, [selectedMonth, selectedYear]);

  // Ayı Pzt başlangıçlı haftalara böl
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    let week: Date[] = [];
    monthDays.forEach(day => {
      const dow = day.getDay(); // 0=Paz
      const isMonday = dow === 1;
      if (isMonday && week.length > 0) { result.push(week); week = []; }
      week.push(day);
    });
    if (week.length > 0) result.push(week);
    return result;
  }, [monthDays]);

  const currentWeek = weeks[weekIndex] ?? weeks[0] ?? [];

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
    const [{ data }, { data: allP }] = await Promise.all([
      supabase.from("shift_types")
        .select("id, code, name, color, is_day_off, sort_order, duration_hours, start_time, end_time")
        .eq("department_id", personnel!.department_id)
        .order("sort_order")
        .order("created_at"),
      supabase.from("personnel").select("id, full_name, location_id").eq("department_id", personnel!.department_id).neq("status", "archived").order("full_name"),
    ]);
    setShiftTypes(data || []);
    setAllPersonnel(allP || []);
  }

  useEffect(() => {
    if (!selectedLocId) return;
    loadPersonnel();
  }, [selectedLocId, selectedMonth]);

  useEffect(() => { setWeekIndex(0); }, [selectedMonth]);

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
    setAwayCells({});
    const startStr = toDateStr(monthDays[0]);
    const endStr = toDateStr(monthDays[monthDays.length - 1]);

    const [{ data: pData }, { data: saData }] = await Promise.all([
      supabase.from("personnel").select("id, full_name").eq("location_id", selectedLocId).eq("department_id", personnel!.department_id).neq("status", "archived").order("full_name"),
      // Bu lokasyona ait TÜM atamalar — hem kadrolu personelin hem de
      // buraya geçici görevlendirilmiş misafirlerin kayıtları burada.
      supabase.from("shift_assignments").select("personnel_id, shift_date, shift_code").eq("location_id", selectedLocId).gte("shift_date", startStr).lte("shift_date", endStr),
    ]);

    const homeRoster = (pData || []) as PersonnelItem[];
    const homeIds = new Set(homeRoster.map(p => p.id));

    const newCells: Record<string, string> = {};
    (saData || []).forEach(sa => { newCells[`${sa.personnel_id}_${sa.shift_date}`] = sa.shift_code; });

    // Bu lokasyonda ataması olan ama kadrolu olmayan kişiler = misafir
    // (geçici görevlendirilmiş) personel — grid'e ayrıca eklenir.
    const guestIds = [...new Set((saData || []).map(sa => sa.personnel_id))].filter(id => !homeIds.has(id));
    const guestRows: PersonnelItem[] = guestIds
      .map(id => allPersonnel.find(p => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map(p => ({ id: p.id, full_name: p.full_name, isGuest: true }));

    // Kadrolu personelin bu ay içinde BAŞKA bir lokasyona geçici olarak
    // görevlendirilip görevlendirilmediği — "Başka Lokasyonda" işareti için.
    const newAwayCells: Record<string, boolean> = {};
    if (homeRoster.length > 0) {
      const { data: awayData } = await supabase
        .from("shift_assignments")
        .select("personnel_id, shift_date, location_id")
        .in("personnel_id", homeRoster.map(p => p.id))
        .neq("location_id", selectedLocId)
        .gte("shift_date", startStr)
        .lte("shift_date", endStr);
      (awayData || []).forEach(a => { newAwayCells[`${a.personnel_id}_${a.shift_date}`] = true; });
    }

    setPersonnelList([...homeRoster, ...guestRows]);
    setCells(newCells);
    setAwayCells(newAwayCells);
    savedCells.current = { ...newCells };
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

    // Sadece değişen veya yeni eklenen hücreler
    let upserts: { personnel_id: string; location_id: string; shift_date: string; shift_code: string; status: string; created_by: string }[] = [];
    personnelList.forEach(p => {
      monthDays.forEach(day => {
        const dateStr = toDateStr(day);
        const key = `${p.id}_${dateStr}`;
        const code = cells[key];
        if (code && code !== savedCells.current[key]) {
          upserts.push({ personnel_id: p.id, location_id: selectedLocId, shift_date: dateStr, shift_code: code, status, created_by: personnel.id });
        }
      });
    });

    // Başka lokasyonlardaki mevcut atamalarla saat çakışması kontrolü —
    // hücre nasıl girilmiş olursa olsun (tıklama, geçici görevlendirme)
    // kaydetme anında tek yerden denetlenir; çakışan hücreler
    // kaydedilmeden atlanır ve grid'de boşa döner.
    const conflictKeys: string[] = [];
    const conflictNames: string[] = [];
    if (upserts.length > 0) {
      const personnelIds = Array.from(new Set(upserts.map(u => u.personnel_id)));
      const { data: otherLocRows } = await supabase
        .from("shift_assignments")
        .select("personnel_id, shift_date, shift_code, location_id")
        .in("personnel_id", personnelIds)
        .neq("location_id", selectedLocId)
        .gte("shift_date", toDateStr(monthDays[0]))
        .lte("shift_date", toDateStr(monthDays[monthDays.length - 1]));

      upserts = upserts.filter(u => {
        const hit = (otherLocRows ?? []).find(r =>
          r.personnel_id === u.personnel_id &&
          r.shift_date === u.shift_date &&
          shiftsOverlap(u.shift_code, r.shift_code, u.shift_date, shiftTypes)
        );
        if (!hit) return true;
        conflictKeys.push(`${u.personnel_id}_${u.shift_date}`);
        const person = personnelList.find(p => p.id === u.personnel_id);
        conflictNames.push(`${person?.full_name ?? "?"} (${u.shift_date})`);
        return false;
      });

      if (conflictKeys.length > 0) {
        setCells(prev => {
          const next = { ...prev };
          conflictKeys.forEach(k => delete next[k]);
          return next;
        });
      }
    }

    // Sadece DB'de olan ama kullanıcının temizlediği hücreler — savedCells.current
    // üzerinden hesaplanır (personnelList üzerinden değil) çünkü geçici
    // görevlendirmesi kaldırılan kişi silme anında listeden çıkarılmış olabilir.
    const toDelete = Object.keys(savedCells.current)
      .filter(key => savedCells.current[key] && !cells[key])
      .map(key => {
        const sep = key.indexOf("_");
        return { personnel_id: key.slice(0, sep), shift_date: key.slice(sep + 1) };
      });

    let err = null;

    if (upserts.length > 0) {
      const res = await supabase.from("shift_assignments").upsert(upserts, { onConflict: "personnel_id,shift_date,location_id" });
      if (res.error) err = res.error;
    }

    // Yayınlamada tüm ay satırlarını tek sorguda published yap
    if (!err && status === "published") {
      const res = await supabase.from("shift_assignments")
        .update({ status: "published" })
        .eq("location_id", selectedLocId)
        .gte("shift_date", toDateStr(monthDays[0]))
        .lte("shift_date", toDateStr(monthDays[monthDays.length - 1]));
      if (res.error) err = res.error;
    }

    // Silmeleri paralel gönder
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
      // Başarılıysa savedCells'i güncelle
      const newSaved = { ...savedCells.current };
      upserts.forEach(u => { newSaved[`${u.personnel_id}_${u.shift_date}`] = u.shift_code; });
      toDelete.forEach(d => { delete newSaved[`${d.personnel_id}_${d.shift_date}`]; });
      savedCells.current = newSaved;
    }

    status === "draft" ? setSaving(false) : setPublishing(false);
    if (err) {
      showToast("Hata: " + err.message, false);
    } else {
      const base = status === "draft" ? "Taslak kaydedildi" : "Vardiyalar yayınlandı!";
      const suffix = conflictNames.length > 0
        ? ` — saat çakışması nedeniyle kaydedilmeyenler: ${conflictNames.join(", ")}`
        : "";
      showToast(base + suffix, conflictNames.length === 0);
    }
  }

  function openTempAssign() {
    setTempAssignSearch("");
    setTempAssignForm({ personnelId: "", startDate: toDateStr(today), endDate: "", shiftCode: shiftTypes[0]?.code ?? "" });
    setShowTempAssign(true);
  }

  // Geçici görevlendirmeyi kaydetmiyor — sadece grid'e (cells/personnelList)
  // ekliyor, tıpkı hücreye tıklamak gibi. Kalıcı hale gelmesi için admin
  // yine "Taslağı Kaydet" / "Vardiyayı Yayınla" butonuna basmalı; bu sayede
  // ayrı bir kayıt yolu açmadan mevcut mekanizma yeniden kullanılıyor.
  async function handleTempAssignSubmit() {
    const { personnelId, startDate, endDate, shiftCode } = tempAssignForm;
    if (!personnelId || !startDate || !endDate || !shiftCode) {
      showToast("Tüm alanları doldurun", false);
      return;
    }
    if (endDate < startDate) {
      showToast("Bitiş tarihi başlangıçtan önce olamaz", false);
      return;
    }
    const person = allPersonnel.find(p => p.id === personnelId);
    if (!person) return;

    // Kişinin seçilen tarih aralığında (başka lokasyonlarda dahil) mevcut
    // atamalarını çek — aynı gün saat çakışan bir vardiyası varsa o günü atla.
    const { data: existing } = await supabase
      .from("shift_assignments")
      .select("shift_date, shift_code, location_id")
      .eq("personnel_id", personnelId)
      .gte("shift_date", startDate)
      .lte("shift_date", endDate);

    if (!personnelList.some(p => p.id === personnelId)) {
      setPersonnelList(prev => [...prev, { id: person.id, full_name: person.full_name, isGuest: true }]);
    }

    const newCells: Record<string, string> = {};
    let d = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    let addedCount = 0;
    const conflictDates: string[] = [];
    while (d <= end) {
      const dateStr = toDateStr(d);
      const cellKey = `${personnelId}_${dateStr}`;
      const draftCode = cells[cellKey];
      const otherLocRows = (existing ?? []).filter(r => r.shift_date === dateStr && r.location_id !== selectedLocId);
      const conflicts = draftCode
        ? shiftsOverlap(shiftCode, draftCode, dateStr, shiftTypes)
        : otherLocRows.some(r => shiftsOverlap(shiftCode, r.shift_code, dateStr, shiftTypes));
      if (conflicts) {
        conflictDates.push(dateStr);
      } else {
        newCells[cellKey] = shiftCode;
        addedCount++;
      }
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }
    setCells(prev => ({ ...prev, ...newCells }));
    setShowTempAssign(false);
    if (conflictDates.length > 0) {
      showToast(`${person.full_name}: ${addedCount} gün eklendi, ${conflictDates.length} gün saat çakışması nedeniyle atlandı — kaydetmeyi unutmayın`, addedCount > 0);
    } else {
      showToast(`${person.full_name} ${addedCount} gün için eklendi — kaydetmeyi unutmayın`, true);
    }
  }

  const tempAssignResults = tempAssignSearch.trim()
    ? allPersonnel.filter(p => p.full_name.toLowerCase().includes(tempAssignSearch.trim().toLowerCase())).slice(0, 8)
    : allPersonnel.slice(0, 8);

  // Geçici görevlendirmeyi tek tıkla iptal eder — kişinin bu ayki tüm
  // hücrelerini yerel taslaktan temizler ve listeden çıkarır. Kalıcı olması
  // için admin yine kaydetmeli; kayıt anında DB'deki eski kayıtlar da
  // silinir (toDelete artık savedCells.current üzerinden hesaplandığı için
  // kişi personnelList'ten çıkmış olsa bile silme doğru çalışır).
  function clearGuestCells(personnelId: string, fullName: string) {
    if (!window.confirm(`${fullName} için bu ay girilen tüm geçici görevlendirme vardiyaları temizlensin mi?`)) return;
    setCells(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${personnelId}_`)) delete next[k]; });
      return next;
    });
    setPersonnelList(prev => prev.filter(p => p.id !== personnelId));
    showToast(`${fullName} için geçici görevlendirme temizlendi — kaydetmeyi unutmayın`, true);
  }

  const selectedLoc = locations.find(l => l.id === selectedLocId);
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
    // içeriyorsa 5. gün normal dinlenme günü sayılmaz, 7,5 saat
    // çalışılmış gibi eklenir.
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
      <div style={{ background: headerTheme.gradient }}>
        <div className="flex justify-between items-center px-4 h-16">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>{headerTheme.icon}</span>
            <h1 className="font-bold text-white text-lg">{headerTheme.title}</h1>
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

        <button
          onClick={openTempAssign}
          disabled={!selectedLocId}
          className="w-full flex items-center justify-center gap-2 bg-white text-[#825100] text-sm font-bold px-4 py-3 rounded-2xl shadow-sm border border-orange-100 active:scale-95 transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Geçici Görevlendirme Ekle
        </button>

        {/* ── Toplam Çalışma (tam genişlik, sayfayı kaplar) ── */}
        <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[18px] text-indigo-600" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Toplam Çalışma</span>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold" style={{ color: "#3949AB" }}>{formatHours(totalWorkHours)}</span>
                <span className="text-xs font-semibold text-gray-400 pb-1">saat</span>
              </div>
            </div>
          </div>
          {deficitByPerson.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {deficitByPerson.map(d => (
                <span key={d.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 whitespace-nowrap">
                  {d.name} -{formatHours(d.hours)}s
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Stats Strip ── */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          <div className="min-w-[180px] bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-1 border border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[18px] text-orange-600" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fazla Mesai</span>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold" style={{ color: "#FF9800" }}>{formatHours(overtimeHours)}</span>
              <span className="text-xs font-semibold text-gray-400 pb-1">saat</span>
            </div>
            {overtimeByPerson.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {overtimeByPerson.map(o => (
                  <span key={o.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 whitespace-nowrap">
                    {o.name} {formatHours(o.hours)}s
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-[210px] bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-1 border border-gray-100">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center mb-1">
              <span className="material-symbols-outlined text-[18px] text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktif Personel</span>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold" style={{ color: "#4CAF50" }}>{activeCount}</span>
              <span className="text-xs font-semibold text-gray-400 pb-1">kişi</span>
            </div>
            <div className="flex flex-col gap-1 mt-1 items-start">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 whitespace-nowrap">Ücretsiz İzin: {unpaidLeaveDays} gün</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">Yıllık İzin: {annualLeaveDays} gün</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 whitespace-nowrap">Doktor Raporu: {sickReportDays} gün</span>
            </div>
          </div>
        </div>

        {/* ── Monthly Schedule Table (haftalık sayfalama) ── */}
        <section>

          {/* Hafta navigasyonu */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setWeekIndex(i => Math.max(0, i - 1))}
              disabled={weekIndex === 0}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 disabled:opacity-30 active:scale-90 transition-all">
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>

            <div className="text-center">
              <p className="text-sm font-bold text-gray-800">
                {currentWeek[0]?.getDate()} – {currentWeek[currentWeek.length - 1]?.getDate()} {TR_MONTHS[selectedMonth]}
              </p>
              <p className="text-xs text-gray-400">{weekIndex + 1}. Hafta · {weeks.length} haftadan</p>
            </div>

            <button
              onClick={() => setWeekIndex(i => Math.min(weeks.length - 1, i + 1))}
              disabled={weekIndex === weeks.length - 1}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-200 text-gray-600 disabled:opacity-30 active:scale-90 transition-all">
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>

          {/* Hafta ilerleme noktaları */}
          <div className="flex justify-center gap-1.5 mb-3">
            {weeks.map((_, i) => (
              <button key={i} onClick={() => setWeekIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === weekIndex ? "w-6 bg-indigo-600" : "w-1.5 bg-gray-300"}`} />
            ))}
          </div>

          {/* Renk açıklaması */}
          {shiftTypes.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {shiftTypes.map(st => (
                <div key={st.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-white text-xs font-bold"
                  style={{ color: st.is_day_off ? "#93000a" : st.color }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.is_day_off ? "#ffdad6" : st.color }} />
                  {st.code}
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
                <tr>
                  <th className="p-3 text-xs font-semibold text-white/80 min-w-[120px] sticky left-0 z-10 border-r border-white/20"
                    style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
                    Personel
                  </th>
                  {currentWeek.map(day => {
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const isToday = toDateStr(day) === toDateStr(today);
                    return (
                      <th key={toDateStr(day)}
                        className={`text-center min-w-[52px] p-0 ${isWeekend ? "bg-white/10" : ""}`}>
                        <div className={`flex flex-col items-center py-2 mx-1 rounded-lg ${isToday ? "bg-white/25" : ""}`}>
                          <span className="text-[10px] text-white/60 leading-none">{TR_SHORT_DAYS[day.getDay()]}</span>
                          <span className={`text-sm font-bold leading-none mt-0.5 ${isToday ? "text-white" : "text-white/90"}`}>{day.getDate()}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {personnelList.length === 0 ? (
                  <tr>
                    <td colSpan={currentWeek.length + 1} className="p-8 text-center text-gray-400 text-sm font-semibold">
                      Bu lokasyonda tanımlı personel bulunamadı
                    </td>
                  </tr>
                ) : (
                  personnelList.map(p => (
                    <tr key={p.id} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="p-3 sticky left-0 bg-white z-10 border-r border-gray-100">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {initials(p.full_name)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-gray-700 truncate leading-tight block max-w-[72px]">
                              {shortName(p.full_name)}
                            </span>
                            {p.isGuest && (
                              <span className="inline-flex items-center gap-0.5 mt-0.5">
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-[#825100]">Geçici</span>
                                <button
                                  type="button"
                                  title="Geçici görevlendirmeyi kaldır"
                                  onClick={() => clearGuestCells(p.id, p.full_name)}
                                  className="text-gray-400 hover:text-red-600 flex-shrink-0"
                                >
                                  <span className="material-symbols-outlined text-[13px]">close</span>
                                </button>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {currentWeek.map(day => {
                        const dateStr = toDateStr(day);
                        const cellKey = `${p.id}_${dateStr}`;
                        const code = cells[cellKey] ?? "";
                        const bg = cellBg(code);
                        const isAway = !code && awayCells[cellKey];
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        const isToday = dateStr === toDateStr(today);
                        return (
                          <td key={dateStr} className={`p-1.5 ${isWeekend ? "bg-gray-50/60" : ""} ${isToday ? "bg-indigo-50/60" : ""}`}>
                            <button
                              onClick={() => cycleCell(p.id, dateStr)}
                              className="w-full h-9 flex items-center justify-center text-xs font-bold transition-all active:scale-90 rounded-lg"
                              style={code ? bg : isAway ? { backgroundColor: "#fff3e0", color: "#825100" } : { backgroundColor: "#eef0f6", color: "#9aa0b0" }}
                            >
                              {code || (isAway ? <span className="material-symbols-outlined text-[14px]">flight_takeoff</span> : "—")}
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

          {/* Info tip */}
          <div className="mt-3 p-3 bg-indigo-50 rounded-2xl flex gap-3 border border-indigo-100">
            <span className="material-symbols-outlined text-[#3949AB] flex-shrink-0 text-[20px]">info</span>
            <p className="text-xs font-semibold text-indigo-700">
              Hücrelere dokunarak vardiya tipini döngüsel olarak değiştirin. Ok tuşları ile haftalar arası geçiş yapın. Kaydet tüm ayı kaydeder.
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

      {/* ── Geçici Görevlendirme Bottom Sheet ── */}
      {showTempAssign && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTempAssign(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-bold text-gray-800 text-base">Geçici Görevlendirme</h2>
                <p className="text-xs text-gray-400">{selectedLoc?.name}&apos;a destek personeli ekle</p>
              </div>
              <button onClick={() => setShowTempAssign(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Personel</label>
                <input
                  value={tempAssignForm.personnelId ? allPersonnel.find(p => p.id === tempAssignForm.personnelId)?.full_name ?? "" : tempAssignSearch}
                  onChange={e => { setTempAssignSearch(e.target.value); setTempAssignForm(f => ({ ...f, personnelId: "" })); }}
                  placeholder="İsimle ara…"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                />
                {!tempAssignForm.personnelId && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                    {tempAssignResults.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3">Personel bulunamadı</p>
                    ) : tempAssignResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setTempAssignForm(f => ({ ...f, personnelId: p.id })); setTempAssignSearch(""); }}
                        className="w-full text-left px-3 py-2.5 text-sm font-semibold text-gray-700 active:bg-gray-50 transition-colors flex items-center justify-between gap-2"
                      >
                        {p.full_name}
                        {p.location_id === selectedLocId && <span className="text-[10px] text-gray-400 flex-shrink-0">zaten kadrolu</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Başlangıç</label>
                  <input
                    type="date"
                    value={tempAssignForm.startDate}
                    onChange={e => setTempAssignForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bitiş</label>
                  <input
                    type="date"
                    value={tempAssignForm.endDate}
                    min={tempAssignForm.startDate}
                    onChange={e => setTempAssignForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vardiya Kodu</label>
                <div className="flex flex-wrap gap-2">
                  {shiftTypes.filter(s => !s.is_day_off).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTempAssignForm(f => ({ ...f, shiftCode: s.code }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${tempAssignForm.shiftCode === s.code ? "text-white" : "bg-gray-100 text-gray-600"}`}
                      style={tempAssignForm.shiftCode === s.code ? { backgroundColor: s.color } : undefined}
                    >
                      {s.code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-100 rounded-xl">
                <span className="material-symbols-outlined text-[#825100] text-[18px] flex-shrink-0 mt-0.5">info</span>
                <p className="text-xs text-[#825100]">
                  Bu kişi çizelgeye eklenecek ama <strong>kaydedilmeyecek</strong> — gözden geçirip Taslağı Kaydet veya Vardiyayı Yayınla ile onaylamanız gerekir.
                </p>
              </div>

              <button
                onClick={handleTempAssignSubmit}
                disabled={!tempAssignForm.personnelId || !tempAssignForm.startDate || !tempAssignForm.endDate || !tempAssignForm.shiftCode}
                className="w-full py-3.5 rounded-full text-sm font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
              >
                Çizelgeye Ekle
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
