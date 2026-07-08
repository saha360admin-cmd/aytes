"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";

// Deneme sayfası — mevcut Raporlama (web/guvenlik/raporlama) sayfasından
// bağımsız, ayrı bir sidebar linki. Beğenilmezse sayfa + link kaldırılabilir,
// mevcut Raporlama'ya dokunmuyor.
//
// "sabit-guvenlik", "proje-muduru" ve "guvenlik-sorumlusu" (Proje Sorumlusu)
// pozisyonundaki personel için mesai hesabı, vardiyalar/vardiya-olustur/
// (mobile) vardiyalar sayfalarındaki aynı istisna mantığıyla — hafta tatili
// kredisi uygulanmaz, T211+ kodları doğrudan fazla mesaiye yazılır. Not:
// paylaşılan src/lib/shiftHours.ts bu istisnayı içermiyor, bu yüzden burada
// bilerek yeniden yazıldı (eski Raporlama sayfası hâlâ o kütüphaneyi
// kullanıyor ve bu istisnadan habersiz).
const KNOWN_CODE_HOURS: Record<string, number> = {
  "1": 7.5, "2": 7.5, "3": 7.5,
  "5": 11, "6": 11,
  "7": 15, "8": 15,
  T216: 7.5,
  T241: 7.5,
  T245: 0,
};
const WEEKLY_REST_CODE = "T211";
const WEEKLY_REST_ALLOWANCE = 4;
const WEEKLY_REST_EXTRA_HOURS = 7.5;
const FIXED_POSITIONS = ["sabit-guvenlik", "proje-muduru", "guvenlik-sorumlusu"];

interface ShiftTypeLike { code: string; is_day_off: boolean; duration_hours: number | null; }

function hoursForShiftCode(code: string, shiftTypes: ShiftTypeLike[]): number {
  if (code in KNOWN_CODE_HOURS) return KNOWN_CODE_HOURS[code];
  const st = shiftTypes.find(s => s.code === code);
  if (!st) return 0;
  if (st.is_day_off) return 0;
  return st.duration_hours ?? 0;
}

function monthlyOvertimeThreshold(daysInPeriod: number): number {
  return (daysInPeriod - 4) * 7.5;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SECTIONS = [
  { key: "ozet", label: "Yönetici Özeti", icon: "dashboard_customize" },
  { key: "performans", label: "Personel Performans Karnesi", icon: "military_tech" },
  { key: "iletisim", label: "İletişim Okuma Oranları", icon: "forum" },
  { key: "lokasyon", label: "Lokasyon Karşılaştırması", icon: "location_on" },
  { key: "devriye-trend", label: "Devriye Trend & Checkpoint", icon: "route" },
  { key: "olay-analiz", label: "Olay Analizi", icon: "report_problem" },
  { key: "taseron-firma", label: "Taşeron Firma Raporu", icon: "handyman" },
  { key: "talep", label: "Talepler Raporu", icon: "assignment" },
] as const;
type SectionKey = typeof SECTIONS[number]["key"];

// Son 6 ay için (bu ay dahil) {label, start, end} aralıkları — trend
// tablolarında ortak kullanılıyor.
function last6Months(): { label: string; start: Date; end: Date }[] {
  const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({ label: `${TR_MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}`, start, end });
  }
  return months;
}

export default function WebGuvenlikRaporlar2Page() {
  const [section, setSection] = useState<SectionKey>("ozet");

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-headline-lg text-on-background">Raporlar 2</h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tertiary/10 text-tertiary">Deneme</span>
        </div>
        <p className="text-on-surface-variant">Güvenlik menülerinin tamamından beslenen yeni rapor önerileri.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
              section === s.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {section === "ozet" && <ExecutiveSummarySection />}
      {section === "performans" && <PerformanceScorecardSection />}
      {section === "iletisim" && <CommsReadRateSection />}
      {section === "lokasyon" && <LocationComparisonSection />}
      {section === "devriye-trend" && <PatrolTrendSection />}
      {section === "olay-analiz" && <IncidentAnalysisSection />}
      {section === "taseron-firma" && <ContractorReportSection />}
      {section === "talep" && <RequestsReportSection />}
    </div>
  );
}

// ───────────────────────── Yönetici Özeti ─────────────────────────

const FIXED_TOTAL_PERSONNEL = 103;

interface SummaryData {
  activePersonnel: number;
  totalDeficit: number;
  patrolTotal: number;
  patrolCompleted: number;
  openIncidents: number;
  openServiceRequests: number;
  avgOvertimeHours: number;
}

function ExecutiveSummarySection() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryData | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const deptId = dept.id;

      const { data: activeRows } = await supabase
        .from("personnel")
        .select("id, location_id, role, position")
        .eq("department_id", deptId)
        .eq("status", "active");
      const active = activeRows || [];
      const activeIds = active.map(p => p.id);

      const now = new Date();
      const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEndIso = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const monthStartStr = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEndStr = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

      const [
        { data: allLocations },
        { data: patrolsThisMonth },
        { data: incDepts },
        { data: serviceReqs },
        { data: assignmentsThisMonth },
        { data: shiftTypesData },
      ] = await Promise.all([
        supabase.from("locations").select("id, name, target_count"),
        supabase.from("patrols").select("id, status").eq("department_id", deptId).gte("created_at", monthStartIso).lt("created_at", monthEndIso),
        supabase.from("incident_departments").select("incident_id, status").eq("department_id", deptId),
        supabase.from("service_requests").select("id, status").eq("department_id", deptId),
        activeIds.length > 0
          ? supabase.from("shift_assignments").select("personnel_id, shift_code").eq("status", "published").in("personnel_id", activeIds).gte("shift_date", monthStartStr).lte("shift_date", monthEndStr)
          : Promise.resolve({ data: [] as { personnel_id: string; shift_code: string }[] }),
        supabase.from("shift_types").select("code, is_day_off, duration_hours").eq("department_id", deptId),
      ]);

      // Eksik Güvenlik: dashboard'daki (web/guvenlik/page.tsx) aynı mantık —
      // yönetici/süpervizörler idari olarak Genel Müdürlük'e bağlı sayılır.
      const allLocs = (allLocations || []) as { id: string; name: string; target_count: number }[];
      const genelMudId = allLocs.find(l => l.name === "Genel Müdürlük")?.id;
      const locCounts: Record<string, number> = {};
      active.forEach(p => {
        let locId = p.location_id as string | null;
        if ((p.role === "admin" || p.role === "supervisor") && genelMudId) locId = genelMudId;
        if (locId) locCounts[locId] = (locCounts[locId] || 0) + 1;
      });
      const totalDeficit = allLocs.reduce((sum, l) => sum + Math.max(0, l.target_count - (locCounts[l.id] || 0)), 0);

      const patrolTotal = (patrolsThisMonth || []).length;
      const patrolCompleted = (patrolsThisMonth || []).filter(p => p.status === "completed").length;

      const openIncidents = (incDepts || []).filter(r => r.status === "open" || r.status === "in_progress").length;
      const openServiceRequests = (serviceReqs || []).filter(r => r.status === "open" || r.status === "in_progress").length;

      // Ortalama fazla mesai — sabit personel istisnası dahil.
      const codesByPerson: Record<string, string[]> = {};
      (assignmentsThisMonth || []).forEach(a => { (codesByPerson[a.personnel_id] ??= []).push(a.shift_code); });
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const threshold = monthlyOvertimeThreshold(daysInMonth);
      const shiftTypes = (shiftTypesData || []) as ShiftTypeLike[];
      let overtimeSum = 0;
      active.forEach(p => {
        const isFixed = FIXED_POSITIONS.includes(p.position ?? "");
        const codes = codesByPerson[p.id] || [];
        let hours = 0, weeklyRest = 0, fixedOT = 0;
        codes.forEach(code => {
          if (code === WEEKLY_REST_CODE) { weeklyRest++; return; }
          if (isFixed && code.startsWith(`${WEEKLY_REST_CODE}+`)) { fixedOT += hoursForShiftCode(code, shiftTypes); return; }
          hours += hoursForShiftCode(code, shiftTypes);
        });
        if (!isFixed) hours += Math.max(0, weeklyRest - WEEKLY_REST_ALLOWANCE) * WEEKLY_REST_EXTRA_HOURS;
        const overtime = isFixed ? fixedOT : Math.max(0, hours - threshold);
        overtimeSum += overtime;
      });
      const avgOvertimeHours = active.length > 0 ? overtimeSum / active.length : 0;

      setData({
        activePersonnel: active.length,
        totalDeficit,
        patrolTotal,
        patrolCompleted,
        openIncidents,
        openServiceRequests,
        avgOvertimeHours,
      });
      setLoading(false);
    })();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const patrolPct = data.patrolTotal > 0 ? Math.round((data.patrolCompleted / data.patrolTotal) * 100) : null;

  const cards = [
    { icon: "groups", label: "Aktif Kadro", value: `${data.activePersonnel}/${FIXED_TOTAL_PERSONNEL}`, color: "text-primary" },
    { icon: "person_off", label: "Eksik Personel", value: String(data.totalDeficit), color: data.totalDeficit > 0 ? "text-error" : "text-emerald-600" },
    { icon: "route", label: "Devriye Tamamlama (bu ay)", value: patrolPct !== null ? `%${patrolPct} (${data.patrolCompleted}/${data.patrolTotal})` : "—", color: "text-secondary" },
    { icon: "report_problem", label: "Açık Olay", value: String(data.openIncidents), color: data.openIncidents > 0 ? "text-error" : "text-emerald-600" },
    { icon: "handyman", label: "Açık Taşeron Kaydı", value: String(data.openServiceRequests), color: data.openServiceRequests > 0 ? "text-amber-600" : "text-emerald-600" },
    { icon: "bolt", label: "Ort. Fazla Mesai (bu ay)", value: `${formatHours(data.avgOvertimeHours)} s`, color: "text-tertiary" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 flex items-start gap-3">
          <div className={`p-2.5 rounded-lg bg-surface-container ${c.color}`}>
            <span className="material-symbols-outlined text-[22px]">{c.icon}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">{c.label}</p>
            <h3 className={`font-display text-headline-sm ${c.color}`}>{c.value}</h3>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Personel Performans Karnesi ─────────────────────────
// Formül, (mobile)/vardiyalar sayfasındaki kişisel performans puanıyla
// birebir aynı — bkz. orada "Performans Puanı" için yazılan uzun yorum.
const PATROL_SCORE_WEIGHT = 40;
const MESAI_SCORE_WEIGHT = 35;
const ILETISIM_SCORE_WEIGHT = 25;
const PATROL_MISS_PENALTY = 5;
const PATROL_MISS_PENALTY_CAP = 30;
const LEAVE_PENALTY_PER_DAY = 2;
const LEAVE_PENALTY_CAP = 20;

interface ScoreRow {
  id: string;
  name: string;
  locationName: string;
  score: number | null;
  patrolScore: number | null;
  mesaiScore: number | null;
  iletisimScore: number | null;
  missedCount: number;
  leaveDays: number;
}

function PerformanceScorecardSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ScoreRow[]>([]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const deptId = dept.id;

      const [{ data: activeRows }, { data: allLocations }, { data: shiftTypesData }] = await Promise.all([
        supabase.from("personnel").select("id, full_name, location_id, position").eq("department_id", deptId).eq("status", "active"),
        supabase.from("locations").select("id, name"),
        supabase.from("shift_types").select("code, is_day_off, duration_hours").eq("department_id", deptId),
      ]);
      const active = activeRows || [];
      const activeIds = active.map(p => p.id);
      const locNameById = new Map((allLocations || []).map(l => [l.id, l.name]));
      const shiftTypes = (shiftTypesData || []) as ShiftTypeLike[];

      if (activeIds.length === 0) { setRows([]); setLoading(false); return; }

      const yearAgo = new Date();
      yearAgo.setDate(yearAgo.getDate() - 365);
      const yearStart = toDateStr(yearAgo);
      const today = new Date();
      const todayStr = toDateStr(today);
      const yearAgoIso = yearAgo.toISOString();
      const nowIso = today.toISOString();

      const [
        { data: yearAssignments },
        { data: patrolRows },
        { data: allComms },
        { data: allReads },
      ] = await Promise.all([
        supabase.from("shift_assignments").select("personnel_id, shift_date, shift_code").eq("status", "published").in("personnel_id", activeIds).gte("shift_date", yearStart).lte("shift_date", todayStr),
        supabase.from("patrol_assignments").select("personnel_id, date, status").in("personnel_id", activeIds).gte("date", yearStart).lte("date", todayStr),
        supabase.from("communications").select("id, target_type, location_id").eq("department_id", deptId).gte("created_at", yearAgoIso).lte("created_at", nowIso),
        supabase.from("communication_reads").select("personnel_id, communication_id").in("personnel_id", activeIds),
      ]);

      // Kişi bazlı gruplama
      const assignmentsByPerson: Record<string, { shift_date: string; shift_code: string }[]> = {};
      (yearAssignments || []).forEach(r => { (assignmentsByPerson[r.personnel_id] ??= []).push(r); });

      const patrolsByPerson: Record<string, { status: string }[]> = {};
      (patrolRows || []).forEach(r => { (patrolsByPerson[r.personnel_id] ??= []).push(r); });

      const readsByPerson: Record<string, Set<string>> = {};
      (allReads || []).forEach(r => { (readsByPerson[r.personnel_id] ??= new Set()).add(r.communication_id); });

      const allTargetIds = (allComms || []).filter(c => c.target_type === "all").map(c => c.id);
      const locTargetIds = new Map<string, string[]>();
      (allComms || []).filter(c => c.target_type === "location" && c.location_id).forEach(c => {
        const arr = locTargetIds.get(c.location_id as string) ?? [];
        arr.push(c.id);
        locTargetIds.set(c.location_id as string, arr);
      });

      const scoreRows: ScoreRow[] = active.map(p => {
        const isFixed = FIXED_POSITIONS.includes(p.position ?? "");

        // Mesai hedefi karşılama — ay bazlı ortalama oran
        const byMonth: Record<string, { hours: number; weeklyRest: number; fixedOT: number }> = {};
        const counts = { unpaid: 0, report: 0 };
        (assignmentsByPerson[p.id] || []).forEach(r => {
          const code = r.shift_code;
          if (code === "T245") counts.unpaid++;
          else if (code === "T241") counts.report++;
          const monthKey = r.shift_date.slice(0, 7);
          const bucket = (byMonth[monthKey] ??= { hours: 0, weeklyRest: 0, fixedOT: 0 });
          if (code === WEEKLY_REST_CODE) { bucket.weeklyRest++; return; }
          if (isFixed && code.startsWith(`${WEEKLY_REST_CODE}+`)) { bucket.fixedOT += hoursForShiftCode(code, shiftTypes); return; }
          bucket.hours += hoursForShiftCode(code, shiftTypes);
        });
        let ratioSum = 0, monthCount = 0;
        Object.entries(byMonth).forEach(([monthKey, b]) => {
          let hrs = b.hours;
          if (!isFixed) hrs += Math.max(0, b.weeklyRest - WEEKLY_REST_ALLOWANCE) * WEEKLY_REST_EXTRA_HOURS;
          const [y, m] = monthKey.split("-").map(Number);
          const daysInM = new Date(y, m, 0).getDate();
          const threshold = monthlyOvertimeThreshold(daysInM);
          if (threshold <= 0) return;
          ratioSum += Math.min(1, (hrs + b.fixedOT) / threshold);
          monthCount++;
        });
        const mesaiScore = monthCount > 0 ? (ratioSum / monthCount) * 100 : null;

        // Devriye
        const patrolData = patrolsByPerson[p.id] || [];
        const completedCount = patrolData.filter(r => r.status === "completed").length;
        const missedCount = patrolData.filter(r => r.status === "missed").length;
        const patrolScore = patrolData.length > 0 ? (completedCount / patrolData.length) * 100 : null;

        // İletişim
        const targetedIds = new Set([...allTargetIds, ...(locTargetIds.get(p.location_id ?? "") ?? [])]);
        const myReads = readsByPerson[p.id] ?? new Set<string>();
        let readMatch = 0;
        targetedIds.forEach(id => { if (myReads.has(id)) readMatch++; });
        const iletisimScore = targetedIds.size > 0 ? (readMatch / targetedIds.size) * 100 : null;

        // Bileşik puan
        const components = [
          { score: patrolScore, weight: PATROL_SCORE_WEIGHT },
          { score: mesaiScore, weight: MESAI_SCORE_WEIGHT },
          { score: iletisimScore, weight: ILETISIM_SCORE_WEIGHT },
        ].filter((c): c is { score: number; weight: number } => c.score !== null);

        let finalScore: number | null = null;
        if (components.length > 0) {
          const totalWeight = components.reduce((s, c) => s + c.weight, 0);
          const base = components.reduce((s, c) => s + c.score * (c.weight / totalWeight), 0);
          const missedPenalty = Math.min(PATROL_MISS_PENALTY_CAP, missedCount * PATROL_MISS_PENALTY);
          const leavePenalty = Math.min(LEAVE_PENALTY_CAP, (counts.unpaid + counts.report) * LEAVE_PENALTY_PER_DAY);
          finalScore = Math.max(0, Math.min(100, base - missedPenalty - leavePenalty));
        }

        return {
          id: p.id,
          name: p.full_name,
          locationName: locNameById.get(p.location_id ?? "") ?? "—",
          score: finalScore,
          patrolScore,
          mesaiScore,
          iletisimScore,
          missedCount,
          leaveDays: counts.unpaid + counts.report,
        };
      });

      scoreRows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      setRows(scoreRows);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const columns: DataTableColumn[] = [
    { key: "name", label: "Personel", sortable: true },
    { key: "location", label: "Lokasyon", sortable: true },
    { key: "score", label: "Performans Puanı", sortable: true },
    { key: "patrol", label: "Devriye" },
    { key: "mesai", label: "Mesai Hedefi" },
    { key: "iletisim", label: "İletişim" },
    { key: "missed", label: "Kaçırılan Devriye", sortable: true },
    { key: "leave", label: "İzin/Rapor (gün)", sortable: true },
  ];

  function pctCell(v: number | null): DataTableCell {
    if (v === null) return { csv: "—", display: <span className="text-on-surface-variant">—</span> };
    return { csv: `%${Math.round(v)}`, display: <span>%{Math.round(v)}</span> };
  }

  const data = rows.map(r => ({
    name: r.name,
    location: r.locationName,
    score: r.score !== null
      ? { csv: String(Math.round(r.score)), display: <span className="font-bold">{Math.round(r.score)}</span> } as DataTableCell
      : { csv: "—", display: <span className="text-on-surface-variant">—</span> } as DataTableCell,
    patrol: pctCell(r.patrolScore),
    mesai: pctCell(r.mesaiScore),
    iletisim: pctCell(r.iletisimScore),
    missed: r.missedCount,
    leave: r.leaveDays,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Son 1 yıl (hareketli 365 gün) — devriye tamamlama (%{PATROL_SCORE_WEIGHT}) + mesai hedefi (%{MESAI_SCORE_WEIGHT}) + iletişim yanıtı (%{ILETISIM_SCORE_WEIGHT})
        ağırlıklı ortalaması, kaçırılan devriye ve ücretsiz izin/rapor günleri düşülerek. Veri olmayan bileşen hesaba katılmaz.
      </p>
      <DataTable columns={columns} data={data} loading={false} exportable />
    </div>
  );
}

// ───────────────────────── İletişim Okuma Oranları ─────────────────────────

interface CommsReadRow {
  id: string;
  name: string;
  locationName: string;
  targeted: number;
  read: number;
  pct: number | null;
}

function CommsReadRateSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CommsReadRow[]>([]);
  const [totalComms, setTotalComms] = useState(0);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const deptId = dept.id;

      const [{ data: activeRows }, { data: allLocations }] = await Promise.all([
        supabase.from("personnel").select("id, full_name, location_id").eq("department_id", deptId).eq("status", "active"),
        supabase.from("locations").select("id, name"),
      ]);
      const active = activeRows || [];
      const activeIds = active.map(p => p.id);
      const locNameById = new Map((allLocations || []).map(l => [l.id, l.name]));

      if (activeIds.length === 0) { setRows([]); setLoading(false); return; }

      const yearAgo = new Date();
      yearAgo.setDate(yearAgo.getDate() - 365);
      const yearAgoIso = yearAgo.toISOString();
      const nowIso = new Date().toISOString();

      const [{ data: allComms }, { data: allReads }] = await Promise.all([
        supabase.from("communications").select("id, target_type, location_id").eq("department_id", deptId).gte("created_at", yearAgoIso).lte("created_at", nowIso),
        supabase.from("communication_reads").select("personnel_id, communication_id").in("personnel_id", activeIds),
      ]);

      const readsByPerson: Record<string, Set<string>> = {};
      (allReads || []).forEach(r => { (readsByPerson[r.personnel_id] ??= new Set()).add(r.communication_id); });

      const allTargetIds = (allComms || []).filter(c => c.target_type === "all").map(c => c.id);
      const locTargetIds = new Map<string, string[]>();
      (allComms || []).filter(c => c.target_type === "location" && c.location_id).forEach(c => {
        const arr = locTargetIds.get(c.location_id as string) ?? [];
        arr.push(c.id);
        locTargetIds.set(c.location_id as string, arr);
      });

      const result: CommsReadRow[] = active.map(p => {
        const targetedIds = new Set([...allTargetIds, ...(locTargetIds.get(p.location_id ?? "") ?? [])]);
        const myReads = readsByPerson[p.id] ?? new Set<string>();
        let readCount = 0;
        targetedIds.forEach(id => { if (myReads.has(id)) readCount++; });
        return {
          id: p.id,
          name: p.full_name,
          locationName: locNameById.get(p.location_id ?? "") ?? "—",
          targeted: targetedIds.size,
          read: readCount,
          pct: targetedIds.size > 0 ? (readCount / targetedIds.size) * 100 : null,
        };
      });

      result.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
      setRows(result);
      setTotalComms((allComms || []).length);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const columns: DataTableColumn[] = [
    { key: "name", label: "Personel", sortable: true },
    { key: "location", label: "Lokasyon", sortable: true },
    { key: "targeted", label: "Kendisine Gelen Mesaj", sortable: true },
    { key: "read", label: "Okunan", sortable: true },
    { key: "pct", label: "Okuma Oranı", sortable: true },
  ];

  const data = rows.map(r => {
    const pctCell: DataTableCell = r.pct === null
      ? { csv: "—", display: <span className="text-on-surface-variant">Hedeflenmemiş</span> }
      : {
          csv: `%${Math.round(r.pct)}`,
          display: (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div className={`h-full rounded-full ${r.pct < 50 ? "bg-error" : r.pct < 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${r.pct}%` }} />
              </div>
              <span className="text-xs font-bold text-on-surface-variant">%{Math.round(r.pct)}</span>
            </div>
          ),
        };
    return { name: r.name, location: r.locationName, targeted: r.targeted, read: r.read, pct: pctCell };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Son 1 yıl içinde departmanda gönderilen {totalComms} duyuru/görev/talimat mesajı — en düşük okuma oranından yükseğe sıralı.
      </p>
      <DataTable columns={columns} data={data} loading={false} exportable />
    </div>
  );
}

// ───────────────────────── Lokasyon Karşılaştırması ─────────────────────────

interface LocationRow {
  id: string;
  name: string;
  target: number;
  actual: number;
  deficit: number;
  patrolPct: number | null;
  avgOvertime: number;
}

function LocationComparisonSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LocationRow[]>([]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const deptId = dept.id;

      const { data: activeRows } = await supabase
        .from("personnel")
        .select("id, location_id, role, position")
        .eq("department_id", deptId)
        .eq("status", "active");
      const active = activeRows || [];
      const activeIds = active.map(p => p.id);

      const now = new Date();
      const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEndIso = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const monthStartStr = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      const monthEndStr = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const threshold = monthlyOvertimeThreshold(daysInMonth);

      const [
        { data: allLocations },
        { data: shiftTypesData },
        { data: assignmentsThisMonth },
        { data: patrolsThisMonth },
        { data: patrolRoutes },
      ] = await Promise.all([
        supabase.from("locations").select("id, name, target_count"),
        supabase.from("shift_types").select("code, is_day_off, duration_hours").eq("department_id", deptId),
        activeIds.length > 0
          ? supabase.from("shift_assignments").select("personnel_id, shift_code").eq("status", "published").in("personnel_id", activeIds).gte("shift_date", monthStartStr).lte("shift_date", monthEndStr)
          : Promise.resolve({ data: [] as { personnel_id: string; shift_code: string }[] }),
        supabase.from("patrols").select("id, status, route_name").eq("department_id", deptId).gte("created_at", monthStartIso).lt("created_at", monthEndIso),
        // patrols'ta location_id yok — route_name üzerinden patrol_routes.name
        // eşleştirilip location_id bulunuyor (Aktif Devriyeler widget'ıyla aynı yöntem).
        supabase.from("patrol_routes").select("name, location_id").eq("department_id", deptId),
      ]);

      const allLocs = (allLocations || []) as { id: string; name: string; target_count: number }[];
      const shiftTypes = (shiftTypesData || []) as ShiftTypeLike[];
      const genelMudId = allLocs.find(l => l.name === "Genel Müdürlük")?.id;

      // Aktif personel sayısı + ortalama fazla mesai için lokasyon bazlı kova
      const locCounts: Record<string, number> = {};
      const overtimeByLoc: Record<string, number[]> = {};
      const codesByPerson: Record<string, string[]> = {};
      (assignmentsThisMonth || []).forEach(a => { (codesByPerson[a.personnel_id] ??= []).push(a.shift_code); });

      active.forEach(p => {
        let locId = p.location_id as string | null;
        if ((p.role === "admin" || p.role === "supervisor") && genelMudId) locId = genelMudId;
        if (!locId) return;
        locCounts[locId] = (locCounts[locId] || 0) + 1;

        const isFixed = FIXED_POSITIONS.includes(p.position ?? "");
        const codes = codesByPerson[p.id] || [];
        let hours = 0, weeklyRest = 0, fixedOT = 0;
        codes.forEach(code => {
          if (code === WEEKLY_REST_CODE) { weeklyRest++; return; }
          if (isFixed && code.startsWith(`${WEEKLY_REST_CODE}+`)) { fixedOT += hoursForShiftCode(code, shiftTypes); return; }
          hours += hoursForShiftCode(code, shiftTypes);
        });
        if (!isFixed) hours += Math.max(0, weeklyRest - WEEKLY_REST_ALLOWANCE) * WEEKLY_REST_EXTRA_HOURS;
        const overtime = isFixed ? fixedOT : Math.max(0, hours - threshold);
        (overtimeByLoc[locId] ??= []).push(overtime);
      });

      // Devriye tamamlama — route_name -> location_id eşlemesi
      const locByRoute = new Map((patrolRoutes || []).map(r => [r.name, r.location_id]));
      const patrolByLoc: Record<string, { total: number; completed: number }> = {};
      (patrolsThisMonth || []).forEach(p => {
        const locId = locByRoute.get(p.route_name ?? "");
        if (!locId) return;
        const cur = (patrolByLoc[locId] ??= { total: 0, completed: 0 });
        cur.total++;
        if (p.status === "completed") cur.completed++;
      });

      const result: LocationRow[] = allLocs.map(l => {
        const actual = locCounts[l.id] || 0;
        const overtimes = overtimeByLoc[l.id] || [];
        const avgOvertime = overtimes.length > 0 ? overtimes.reduce((a, b) => a + b, 0) / overtimes.length : 0;
        const patrolData = patrolByLoc[l.id];
        return {
          id: l.id,
          name: l.name,
          target: l.target_count,
          actual,
          deficit: Math.max(0, l.target_count - actual),
          patrolPct: patrolData && patrolData.total > 0 ? Math.round((patrolData.completed / patrolData.total) * 100) : null,
          avgOvertime,
        };
      }).filter(l => l.target > 0 || l.actual > 0);

      result.sort((a, b) => b.deficit - a.deficit);
      setRows(result);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const columns: DataTableColumn[] = [
    { key: "name", label: "Lokasyon", sortable: true },
    { key: "target", label: "Hedef", sortable: true },
    { key: "actual", label: "Aktif", sortable: true },
    { key: "deficit", label: "Eksik", sortable: true },
    { key: "patrol", label: "Devriye Tamamlama (bu ay)" },
    { key: "overtime", label: "Ort. Fazla Mesai (bu ay)", sortable: true },
  ];

  const data = rows.map(r => ({
    name: r.name,
    target: r.target,
    actual: r.actual,
    deficit: {
      csv: String(r.deficit),
      display: <span className={r.deficit > 0 ? "font-bold text-error" : "text-emerald-600"}>{r.deficit}</span>,
    } as DataTableCell,
    patrol: r.patrolPct !== null
      ? { csv: `%${r.patrolPct}`, display: <span>%{r.patrolPct}</span> } as DataTableCell
      : { csv: "—", display: <span className="text-on-surface-variant">—</span> } as DataTableCell,
    overtime: `${formatHours(r.avgOvertime)} s`,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">Tüm lokasyonlar, eksik personel sayısına göre en kritikten en az kritiğe sıralı.</p>
      <DataTable columns={columns} data={data} loading={false} exportable />
    </div>
  );
}

// ───────────────────────── Devriye Trend & Checkpoint ─────────────────────────

function PatrolTrendSection() {
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<{ label: string; total: number; completed: number; missed: number }[]>([]);
  const [checkpoints, setCheckpoints] = useState<{ name: string; total: number; completed: number; pct: number }[]>([]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const deptId = dept.id;

      const months = last6Months();
      const rangeStart = months[0].start.toISOString();
      const rangeEnd = months[months.length - 1].end.toISOString();

      const { data: patrolRows } = await supabase
        .from("patrols")
        .select("id, status, created_at")
        .eq("department_id", deptId)
        .gte("created_at", rangeStart)
        .lt("created_at", rangeEnd);
      const patrols = patrolRows || [];

      const monthlyStats = months.map(m => {
        const inMonth = patrols.filter(p => {
          const t = new Date(p.created_at).getTime();
          return t >= m.start.getTime() && t < m.end.getTime();
        });
        return {
          label: m.label,
          total: inMonth.length,
          completed: inMonth.filter(p => p.status === "completed").length,
          missed: inMonth.filter(p => p.status !== "completed" && p.status !== "active" && p.status !== "paused").length,
        };
      });
      setMonthly(monthlyStats);

      const patrolIds = patrols.map(p => p.id);
      if (patrolIds.length > 0) {
        const { data: cpRows } = await supabase
          .from("patrol_checkpoints")
          .select("name, status")
          .in("patrol_id", patrolIds);
        const byName: Record<string, { total: number; completed: number }> = {};
        (cpRows || []).forEach(c => {
          const key = c.name || "İsimsiz";
          const cur = (byName[key] ??= { total: 0, completed: 0 });
          cur.total++;
          if (c.status === "completed") cur.completed++;
        });
        const cpResult = Object.entries(byName)
          .map(([name, v]) => ({ name, total: v.total, completed: v.completed, pct: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0 }))
          .sort((a, b) => a.pct - b.pct);
        setCheckpoints(cpResult);
      } else {
        setCheckpoints([]);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const monthColumns: DataTableColumn[] = [
    { key: "label", label: "Ay" },
    { key: "total", label: "Toplam Devriye", sortable: true },
    { key: "completed", label: "Tamamlanan", sortable: true },
    { key: "missed", label: "Tamamlanmayan", sortable: true },
    { key: "rate", label: "Tamamlanma Oranı" },
  ];
  const monthData = monthly.map(m => {
    const rate = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
    return {
      label: m.label,
      total: m.total,
      completed: m.completed,
      missed: m.missed,
      rate: {
        csv: `%${rate}`,
        display: (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full rounded-full bg-secondary" style={{ width: `${rate}%` }} />
            </div>
            <span className="text-xs font-bold text-on-surface-variant">%{rate}</span>
          </div>
        ),
      } as DataTableCell,
    };
  });

  const cpColumns: DataTableColumn[] = [
    { key: "name", label: "Checkpoint", sortable: true },
    { key: "total", label: "Toplam", sortable: true },
    { key: "completed", label: "Tamamlanan", sortable: true },
    { key: "pct", label: "Tamamlanma Oranı", sortable: true },
  ];
  const cpData = checkpoints.map(c => ({ name: c.name, total: c.total, completed: c.completed, pct: `%${c.pct}` }));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Aylık Devriye Trendi (son 6 ay)</h2>
        <DataTable columns={monthColumns} data={monthData} loading={false} exportable />
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Checkpoint Bazlı Tamamlanma (son 6 ay)</h2>
        <p className="text-sm text-on-surface-variant">En düşük tamamlanma oranından yükseğe sıralı — en sık atlanan kontrol noktaları üstte.</p>
        <DataTable columns={cpColumns} data={cpData} loading={false} exportable />
      </section>
    </div>
  );
}

// ───────────────────────── Olay Analizi ─────────────────────────

function IncidentAnalysisSection() {
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<{ label: string; count: number }[]>([]);
  const [byLocation, setByLocation] = useState<{ location: string; count: number }[]>([]);
  const [avgResolutionHours, setAvgResolutionHours] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const deptId = dept.id;

      const months = last6Months();
      const rangeStart = months[0].start.toISOString();
      const rangeEnd = months[months.length - 1].end.toISOString();

      const [{ data: incDepts }, { data: incidents }] = await Promise.all([
        supabase.from("incident_departments").select("incident_id, status, updated_at").eq("department_id", deptId),
        supabase.from("incidents").select("id, location, created_at").gte("created_at", rangeStart).lt("created_at", rangeEnd),
      ]);
      const incidentRows = incidents || [];
      const incidentById = new Map(incidentRows.map(i => [i.id, i]));

      const monthlyStats = months.map(m => ({
        label: m.label,
        count: incidentRows.filter(i => {
          const t = new Date(i.created_at).getTime();
          return t >= m.start.getTime() && t < m.end.getTime();
        }).length,
      }));
      setMonthly(monthlyStats);

      const locCounts = new Map<string, number>();
      incidentRows.forEach(i => {
        const key = i.location || "Belirtilmemiş";
        locCounts.set(key, (locCounts.get(key) || 0) + 1);
      });
      setByLocation([...locCounts.entries()].map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count));

      // Ortalama çözüm süresi: incident_departments.status='closed' olan
      // kayıtların updated_at'ı (kapanış anı) - incidents.created_at (bildirim anı).
      const closedDurationsMs: number[] = [];
      (incDepts || []).forEach(d => {
        if (d.status !== "closed") return;
        const inc = incidentById.get(d.incident_id);
        if (!inc) return;
        const diff = new Date(d.updated_at).getTime() - new Date(inc.created_at).getTime();
        if (diff > 0) closedDurationsMs.push(diff);
      });
      setAvgResolutionHours(
        closedDurationsMs.length > 0
          ? closedDurationsMs.reduce((a, b) => a + b, 0) / closedDurationsMs.length / 3600000
          : null
      );

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const monthColumns: DataTableColumn[] = [{ key: "label", label: "Ay" }, { key: "count", label: "Bildirilen Olay", sortable: true }];
  const locColumns: DataTableColumn[] = [{ key: "location", label: "Lokasyon", sortable: true }, { key: "count", label: "Olay Sayısı", sortable: true }];

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 max-w-xs">
        <p className="text-xs font-semibold text-on-surface-variant">Ortalama Çözüm Süresi (son 6 ay, kapatılanlar)</p>
        <h3 className="font-display text-headline-sm text-on-surface">
          {avgResolutionHours !== null ? `${formatHours(avgResolutionHours)} saat` : "—"}
        </h3>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Aylar Arası Olay Trendi</h2>
        <DataTable columns={monthColumns} data={monthly} loading={false} exportable />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Lokasyon Bazlı Olay Yoğunluğu</h2>
        <DataTable columns={locColumns} data={byLocation} loading={false} exportable />
      </section>
    </div>
  );
}

// ───────────────────────── Taşeron Firma Raporu ─────────────────────────

function ContractorReportSection() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<{ name: string; open: number; resolved: number; avgResolutionHours: number | null }[]>([]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }

      const { data } = await supabase
        .from("service_requests")
        .select("contractor_name, status, opened_at, resolved_at")
        .eq("department_id", dept.id);
      const records = data || [];

      const byFirm: Record<string, { open: number; resolved: number; durationsMs: number[] }> = {};
      records.forEach(r => {
        const key = r.contractor_name || "Bilinmeyen Firma";
        const cur = (byFirm[key] ??= { open: 0, resolved: 0, durationsMs: [] });
        if (r.status === "open" || r.status === "in_progress") cur.open++;
        if (r.status === "resolved") {
          cur.resolved++;
          if (r.resolved_at) {
            const diff = new Date(r.resolved_at).getTime() - new Date(r.opened_at).getTime();
            if (diff > 0) cur.durationsMs.push(diff);
          }
        }
      });

      const result = Object.entries(byFirm).map(([name, v]) => ({
        name,
        open: v.open,
        resolved: v.resolved,
        avgResolutionHours: v.durationsMs.length > 0 ? v.durationsMs.reduce((a, b) => a + b, 0) / v.durationsMs.length / 3600000 : null,
      })).sort((a, b) => (b.open + b.resolved) - (a.open + a.resolved));

      setRows(result);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const columns: DataTableColumn[] = [
    { key: "name", label: "Taşeron Firma", sortable: true },
    { key: "open", label: "Açık Kayıt", sortable: true },
    { key: "resolved", label: "Çözülen Kayıt", sortable: true },
    { key: "avg", label: "Ort. Çözüm Süresi", sortable: true },
  ];
  const data = rows.map(r => ({
    name: r.name,
    open: r.open,
    resolved: r.resolved,
    avg: r.avgResolutionHours !== null ? `${formatHours(r.avgResolutionHours)} saat` : "—",
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">Tüm zamanlar — en çok kayıt açılan firmadan aza doğru sıralı.</p>
      <DataTable columns={columns} data={data} loading={false} exportable />
    </div>
  );
}

// ───────────────────────── Talepler Raporu ─────────────────────────

const REQUEST_TYPE_LABELS: Record<string, string> = {
  unpaid: "Ücretsiz İzin",
  annual: "Yıllık İzin",
  medical: "Doktor Raporu",
  resign: "İstifa",
  giris_destek: "Giriş Desteği",
  other: "Diğer",
};

function RequestsReportSection() {
  const [loading, setLoading] = useState(true);
  const [byType, setByType] = useState<{ type: string; count: number }[]>([]);
  const [statusCounts, setStatusCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [avgResponseHours, setAvgResponseHours] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }

      const { data } = await supabase
        .from("requests")
        .select("type, status, created_at, updated_at")
        .eq("department_id", dept.id);
      const records = data || [];

      const typeCounts = new Map<string, number>();
      records.forEach(r => typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1));
      setByType([...typeCounts.entries()].map(([type, count]) => ({ type: REQUEST_TYPE_LABELS[type] ?? type, count })).sort((a, b) => b.count - a.count));

      setStatusCounts({
        pending: records.filter(r => r.status === "pending").length,
        approved: records.filter(r => r.status === "approved").length,
        rejected: records.filter(r => r.status === "rejected").length,
      });

      const durationsMs: number[] = [];
      records.filter(r => r.status === "approved" || r.status === "rejected").forEach(r => {
        const diff = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
        if (diff > 0) durationsMs.push(diff);
      });
      setAvgResponseHours(durationsMs.length > 0 ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length / 3600000 : null);

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const total = statusCounts.pending + statusCounts.approved + statusCounts.rejected;
  const decided = statusCounts.approved + statusCounts.rejected;
  const approvalRate = decided > 0 ? Math.round((statusCounts.approved / decided) * 100) : null;

  const typeColumns: DataTableColumn[] = [{ key: "type", label: "Talep Tipi", sortable: true }, { key: "count", label: "Adet", sortable: true }];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Toplam Talep</p>
          <h3 className="font-display text-headline-sm text-on-surface">{total}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Bekleyen</p>
          <h3 className="font-display text-headline-sm text-amber-600">{statusCounts.pending}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Onay Oranı (karar verilenler içinde)</p>
          <h3 className="font-display text-headline-sm text-on-surface">{approvalRate !== null ? `%${approvalRate}` : "—"}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Ort. Yanıt Süresi</p>
          <h3 className="font-display text-headline-sm text-on-surface">{avgResponseHours !== null ? `${formatHours(avgResponseHours)} saat` : "—"}</h3>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Talep Tipi Dağılımı</h2>
        <DataTable columns={typeColumns} data={byType} loading={false} exportable />
      </section>
    </div>
  );
}
