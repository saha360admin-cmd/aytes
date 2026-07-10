"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isSlaBreached } from "@/lib/sla";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";
import {
  computePersonPeriodStats,
  formatHours,
  type ShiftTypeLike,
  type PersonPeriodStats,
} from "@/lib/shiftHours";

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

const SECTIONS = [
  { key: "one-cikanlar", label: "Öne Çıkanlar", icon: "emoji_events" },
  { key: "devam", label: "Devam Raporu", icon: "nfc" },
  { key: "izin-rapor", label: "İzin & Rapor", icon: "event_note" },
  { key: "devriye", label: "Devriye Raporu", icon: "route" },
  { key: "olay", label: "Olay Bildir Raporu", icon: "report_problem" },
] as const;
type SectionKey = typeof SECTIONS[number]["key"];

export default function WebGuvenlikRaporlamaPage() {
  const [section, setSection] = useState<SectionKey>("one-cikanlar");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const selectedYear = new Date().getFullYear();

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">Raporlama</h1>
          <p className="text-on-surface-variant">Güvenlik departmanı için performans ve devam özetleri.</p>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(Number(e.target.value))}
          className="bg-surface-container-lowest border border-outline-variant/30 rounded-full px-4 py-2.5 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary outline-none"
        >
          {TR_MONTHS.map((m, i) => (
            <option key={m} value={i}>{m} {selectedYear}</option>
          ))}
        </select>
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

      {section === "one-cikanlar" && <HighlightsSection month={selectedMonth} year={selectedYear} />}
      {section === "devam" && <AttendanceReportSection month={selectedMonth} year={selectedYear} />}
      {section === "izin-rapor" && <LeaveReportSection month={selectedMonth} year={selectedYear} />}
      {section === "devriye" && <PatrolReportSection month={selectedMonth} year={selectedYear} />}
      {section === "olay" && <IncidentReportSection month={selectedMonth} year={selectedYear} />}
    </div>
  );
}

// ───────────────────────── Ortak: dönem içindeki personel istatistikleri ─────────────────────────

interface PersonInfo { id: string; full_name: string; }

async function loadPeriodPersonStats(month: number, year: number): Promise<{ stats: PersonPeriodStats[]; nameById: Record<string, string> }> {
  const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
  if (!dept) return { stats: [], nameById: {} };

  const { data: personnel } = await supabase
    .from("personnel")
    .select("id, full_name")
    .eq("department_id", dept.id)
    .eq("status", "active");
  const people = (personnel || []) as PersonInfo[];
  if (people.length === 0) return { stats: [], nameById: {} };

  const nameById: Record<string, string> = {};
  people.forEach(p => { nameById[p.id] = p.full_name; });

  const start = toDateStr(new Date(year, month, 1));
  const end = toDateStr(new Date(year, month + 1, 0));

  const [{ data: assignments }, { data: shiftTypesData }] = await Promise.all([
    supabase.from("shift_assignments")
      .select("personnel_id, shift_code")
      .in("personnel_id", people.map(p => p.id))
      .eq("status", "published")
      .gte("shift_date", start)
      .lte("shift_date", end),
    supabase.from("shift_types").select("code, is_day_off, duration_hours").eq("department_id", dept.id),
  ]);

  const shiftTypes = (shiftTypesData || []) as ShiftTypeLike[];
  const codesByPerson: Record<string, string[]> = {};
  (assignments || []).forEach(a => {
    (codesByPerson[a.personnel_id] ??= []).push(a.shift_code);
  });

  const nDays = daysInMonth(year, month);
  const stats = people.map(p => computePersonPeriodStats(p.id, codesByPerson[p.id] || [], shiftTypes, nDays));

  return { stats, nameById };
}

const MEDAL_STYLES = [
  { bg: "bg-amber-400/20", text: "text-amber-600", icon: "workspace_premium" },
  { bg: "bg-gray-400/20", text: "text-gray-500", icon: "workspace_premium" },
  { bg: "bg-orange-700/10", text: "text-orange-700", icon: "workspace_premium" },
];

function Podium({ title, subtitle, icon, entries, unit, accentClass }: {
  title: string;
  subtitle: string;
  icon: string;
  entries: { name: string; value: number }[];
  unit: string;
  accentClass: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-outline-variant/10">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-[20px] ${accentClass}`}>{icon}</span>
        <p className="font-bold text-on-surface text-sm">{title}</p>
      </div>
      <p className="text-xs text-on-surface-variant mb-3">{subtitle}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-on-surface-variant italic">Bu dönem için veri yok</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => {
            const medal = MEDAL_STYLES[i] ?? MEDAL_STYLES[2];
            return (
              <div key={e.name + i} className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${medal.bg}`}>
                  <span className={`material-symbols-outlined text-[16px] ${medal.text}`}>{medal.icon}</span>
                </div>
                <span className="text-sm font-semibold text-on-surface flex-1 truncate">{e.name}</span>
                <span className="text-sm font-bold text-on-surface-variant flex-shrink-0">{formatHours(e.value)} {unit}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HighlightsSection({ month, year }: { month: number; year: number }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PersonPeriodStats[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    loadPeriodPersonStats(month, year).then(r => {
      setStats(r.stats);
      setNameById(r.nameById);
      setLoading(false);
    });
  }, [month, year]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  function top(metric: (s: PersonPeriodStats) => number, dir: "desc" | "asc", onlyPositive: boolean) {
    const filtered = onlyPositive ? stats.filter(s => metric(s) > 0) : stats;
    const sorted = [...filtered].sort((a, b) => dir === "desc" ? metric(b) - metric(a) : metric(a) - metric(b));
    return sorted.slice(0, 3).map(s => ({ name: nameById[s.personnelId] ?? "Bilinmiyor", value: metric(s) }));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-4">
          <Podium title="En Çok Mesai Yapan" subtitle="Fazla mesai saati en yüksek 3 kişi" icon="bolt" accentClass="text-amber-600"
            entries={top(s => s.overtimeHours, "desc", true)} unit="s" />
          <Podium title="En Az Mesai Yapan" subtitle="Dengeli çalışanlar 🏅" icon="spa" accentClass="text-emerald-600"
            entries={top(s => s.overtimeHours, "asc", false)} unit="s" />
        </div>
        <div className="space-y-4">
          <Podium title="En Çok Rapor Alan" subtitle="Doktor raporu gün sayısı en yüksek 3 kişi" icon="medical_information" accentClass="text-rose-600"
            entries={top(s => s.sickReportDays, "desc", true)} unit="gün" />
          <Podium title="En Az Rapor Alan" subtitle="Sağlam kadro 💪" icon="verified" accentClass="text-blue-600"
            entries={top(s => s.sickReportDays, "asc", false)} unit="gün" />
        </div>
        <div className="space-y-4">
          <Podium title="En Çok Ücretsiz İzin Alan" subtitle="Ücretsiz izin gün sayısı en yüksek 3 kişi" icon="event_busy" accentClass="text-purple-600"
            entries={top(s => s.unpaidLeaveDays, "desc", true)} unit="gün" />
          <Podium title="En Az Ücretsiz İzin Alan" subtitle="Kesintisiz mesai 🎯" icon="military_tech" accentClass="text-indigo-600"
            entries={top(s => s.unpaidLeaveDays, "asc", false)} unit="gün" />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── İzin & Rapor ─────────────────────────

function LeaveReportSection({ month, year }: { month: number; year: number }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PersonPeriodStats[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    loadPeriodPersonStats(month, year).then(r => {
      setStats(r.stats);
      setNameById(r.nameById);
      setLoading(false);
    });
  }, [month, year]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const columns: DataTableColumn[] = [
    { key: "name", label: "Personel", sortable: true },
    { key: "days", label: "Gün Sayısı", sortable: true },
  ];

  function tableFor(metric: (s: PersonPeriodStats) => number) {
    return stats
      .filter(s => metric(s) > 0)
      .sort((a, b) => metric(b) - metric(a))
      .map(s => ({ name: nameById[s.personnelId] ?? "Bilinmiyor", days: metric(s) }));
  }

  const annual = tableFor(s => s.annualLeaveDays);
  const unpaid = tableFor(s => s.unpaidLeaveDays);
  const sick = tableFor(s => s.sickReportDays);

  const groups = [
    { title: "Yıllık İzin", icon: "beach_access", color: "text-blue-600", data: annual, total: annual.reduce((a, r) => a + r.days, 0) },
    { title: "Ücretsiz İzin", icon: "event_busy", color: "text-purple-600", data: unpaid, total: unpaid.reduce((a, r) => a + r.days, 0) },
    { title: "Doktor Raporu", icon: "medical_information", color: "text-rose-600", data: sick, total: sick.reduce((a, r) => a + r.days, 0) },
  ];

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <section key={g.title} className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-[22px] ${g.color}`}>{g.icon}</span>
              <h2 className="font-display text-headline-sm text-on-surface">{g.title}</h2>
            </div>
            <p className="text-sm text-on-surface-variant">Toplam {g.total} gün · {g.data.length} kişi</p>
          </div>
          <DataTable columns={columns} data={g.data} loading={false} exportable />
        </section>
      ))}
    </div>
  );
}

// ───────────────────────── Devriye Raporu ─────────────────────────

interface PatrolRow {
  id: string;
  personnel_id: string;
  route_name: string | null;
  status: string;
  total_checkpoints: number;
  completed_checkpoints: number;
  duration_seconds: number | null;
}

function PatrolReportSection({ month, year }: { month: number; year: number }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<PatrolRow[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      const { data } = await supabase
        .from("patrols")
        .select("id, personnel_id, route_name, status, total_checkpoints, completed_checkpoints, duration_seconds, started_at")
        .eq("department_id", dept.id)
        .gte("started_at", start)
        .lt("started_at", end);
      const rows = (data || []) as PatrolRow[];
      setRecords(rows);

      const ids = [...new Set(rows.map(r => r.personnel_id).filter(Boolean))];
      if (ids.length > 0) {
        const { data: people } = await supabase.from("personnel").select("id, full_name").in("id", ids);
        const map: Record<string, string> = {};
        for (const p of people || []) map[p.id] = p.full_name;
        setNameById(map);
      }
      setLoading(false);
    })();
  }, [month, year]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const total = records.length;
  const completed = records.filter(r => r.status === "completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgDurationMin = (() => {
    const withDuration = records.filter(r => r.duration_seconds);
    if (withDuration.length === 0) return 0;
    return Math.round(withDuration.reduce((a, r) => a + (r.duration_seconds || 0), 0) / withDuration.length / 60);
  })();

  const byRoute = new Map<string, { total: number; completed: number }>();
  records.forEach(r => {
    const key = r.route_name || "Bilinmeyen Rota";
    const cur = byRoute.get(key) ?? { total: 0, completed: 0 };
    cur.total++;
    if (r.status === "completed") cur.completed++;
    byRoute.set(key, cur);
  });

  const completedByPerson = new Map<string, number>();
  records.filter(r => r.status === "completed").forEach(r => {
    completedByPerson.set(r.personnel_id, (completedByPerson.get(r.personnel_id) ?? 0) + 1);
  });
  const personLeaderboard = [...completedByPerson.entries()]
    .map(([id, count]) => ({ name: nameById[id] ?? "Bilinmiyor", count }))
    .sort((a, b) => b.count - a.count);

  const routeColumns: DataTableColumn[] = [
    { key: "route", label: "Rota", sortable: true },
    { key: "total", label: "Toplam Devriye", sortable: true },
    { key: "completed", label: "Tamamlanan", sortable: true },
    { key: "rate", label: "Tamamlanma Oranı" },
  ];
  const routeData = [...byRoute.entries()].map(([route, v]) => {
    const rate = v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0;
    const rateCell: DataTableCell = {
      csv: `%${rate}`,
      display: (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
            <div className="h-full bg-secondary rounded-full" style={{ width: `${rate}%` }} />
          </div>
          <span className="text-xs font-bold text-on-surface-variant">%{rate}</span>
        </div>
      ),
    };
    return { route, total: v.total, completed: v.completed, rate: rateCell };
  });

  const personColumns: DataTableColumn[] = [
    { key: "name", label: "Personel", sortable: true },
    { key: "count", label: "Tamamlanan Devriye", sortable: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Toplam Devriye</p>
          <h3 className="font-display text-headline-sm text-on-surface">{total}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Tamamlanma Oranı</p>
          <h3 className="font-display text-headline-sm text-on-surface">%{completionRate} <span className="text-sm font-semibold text-on-surface-variant">({completed}/{total})</span></h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Ortalama Süre</p>
          <h3 className="font-display text-headline-sm text-on-surface">{avgDurationMin} <span className="text-sm font-semibold text-on-surface-variant">dk</span></h3>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Rota Bazlı Kırılım</h2>
        <DataTable columns={routeColumns} data={routeData} loading={false} exportable />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Personel Bazlı Tamamlanan Devriye</h2>
        <DataTable columns={personColumns} data={personLeaderboard} loading={false} exportable />
      </section>
    </div>
  );
}

// ───────────────────────── Olay Bildir Raporu ─────────────────────────

const TYPE_LABELS: Record<string, string> = {
  fire: "Yangın / Tahliye",
  theft: "Hırsızlık / Kayıp Eşya",
  fight: "Kavga / Tehdit",
  medical: "Tıbbi Acil",
  unauthorized_entry: "Yetkisiz Giriş",
  suspicious: "Şüpheli Durum",
  maintenance: "Teknik Arıza",
  form: "Form Bildir",
  other: "Diğer",
};

const SEVERITY_LABELS: Record<string, string> = { high: "Yüksek", medium: "Orta", low: "Düşük" };

interface IncidentRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  created_at: string;
  reported_by: string;
}

function IncidentReportSection({ month, year }: { month: number; year: number }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<IncidentRow[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setLoading(false); return; }

      const { data: personnel } = await supabase.from("personnel").select("id, full_name").eq("department_id", dept.id);
      const people = personnel || [];
      const nameMap: Record<string, string> = {};
      people.forEach(p => { nameMap[p.id] = p.full_name; });
      setNameById(nameMap);

      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      const { data } = await supabase
        .from("incidents")
        .select("id, type, severity, status, created_at, reported_by")
        .in("reported_by", people.map(p => p.id))
        .gte("created_at", start)
        .lt("created_at", end);
      setRecords((data || []) as IncidentRow[]);
      setLoading(false);
    })();
  }, [month, year]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  const total = records.length;
  const breachedCount = records.filter(r => r.status !== "closed" && isSlaBreached(r.severity, r.created_at)).length;

  const byType = new Map<string, number>();
  records.forEach(r => byType.set(r.type, (byType.get(r.type) ?? 0) + 1));

  const bySeverity = new Map<string, number>();
  records.forEach(r => bySeverity.set(r.severity, (bySeverity.get(r.severity) ?? 0) + 1));

  const byReporter = new Map<string, number>();
  records.forEach(r => byReporter.set(r.reported_by, (byReporter.get(r.reported_by) ?? 0) + 1));
  const reporterLeaderboard = [...byReporter.entries()]
    .map(([id, count]) => ({ name: nameById[id] ?? "Bilinmiyor", count }))
    .sort((a, b) => b.count - a.count);

  const typeColumns: DataTableColumn[] = [
    { key: "type", label: "Olay Tipi", sortable: true },
    { key: "count", label: "Adet", sortable: true },
  ];
  const typeData = [...byType.entries()]
    .map(([type, count]) => ({ type: TYPE_LABELS[type] ?? type, count }))
    .sort((a, b) => b.count - a.count);

  const severityColumns: DataTableColumn[] = [
    { key: "severity", label: "Önem Derecesi", sortable: true },
    { key: "count", label: "Adet", sortable: true },
  ];
  const severityData = [...bySeverity.entries()]
    .map(([sev, count]) => ({ severity: SEVERITY_LABELS[sev] ?? sev, count }))
    .sort((a, b) => b.count - a.count);

  const reporterColumns: DataTableColumn[] = [
    { key: "name", label: "Personel", sortable: true },
    { key: "count", label: "Bildirilen Olay", sortable: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Bildirilen Olay</p>
          <h3 className="font-display text-headline-sm text-on-surface">{total}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Şu An SLA Aşan (kapanmamış)</p>
          <h3 className="font-display text-headline-sm text-on-surface">{breachedCount}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h2 className="font-display text-headline-sm text-on-surface">Olay Tipi Dağılımı</h2>
          <DataTable columns={typeColumns} data={typeData} loading={false} exportable />
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-headline-sm text-on-surface">Önem Derecesi Dağılımı</h2>
          <DataTable columns={severityColumns} data={severityData} loading={false} exportable />
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">En Çok Olay Bildiren Personel</h2>
        <DataTable columns={reporterColumns} data={reporterLeaderboard} loading={false} exportable />
      </section>
    </div>
  );
}

// ───────────────────────── Devam Raporu (NFC etiket doğrulamalı giriş/çıkış) ─────────────────────────

interface AttendanceRow {
  personnel_id: string;
  type: "entry" | "exit";
  recorded_at: string;
  verified: boolean;
  location_id: string | null;
}

interface DayShift {
  entry: string | null;
  exit: string | null;
  entryVerified: boolean;
  exitVerified: boolean;
}

interface PersonAttendanceSummary {
  id: string;
  name: string;
  daysPresent: number;
  totalHours: number;
  verifiedCount: number;
  manualCount: number;
  missingExit: number;
}

function AttendanceReportSection({ month, year }: { month: number; year: number }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [locationById, setLocationById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) { setRecords([]); setLoading(false); return; }

      const [{ data: personnel }, { data: locations }] = await Promise.all([
        supabase.from("personnel").select("id, full_name").eq("department_id", dept.id),
        supabase.from("locations").select("id, name"),
      ]);
      const people = personnel || [];
      const nameMap: Record<string, string> = {};
      people.forEach(p => { nameMap[p.id] = p.full_name; });
      setNameById(nameMap);
      const locMap: Record<string, string> = {};
      (locations || []).forEach(l => { locMap[l.id] = l.name; });
      setLocationById(locMap);
      if (people.length === 0) { setRecords([]); setLoading(false); return; }

      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 1).toISOString();
      const { data } = await supabase
        .from("attendance_records")
        .select("personnel_id, type, recorded_at, verified, location_id")
        .in("personnel_id", people.map(p => p.id))
        .gte("recorded_at", start)
        .lt("recorded_at", end)
        .order("recorded_at", { ascending: true });
      setRecords((data || []) as AttendanceRow[]);
      setLoading(false);
    })();
  }, [month, year]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
      </div>
    );
  }

  // Kişi + gün bazında ilk girişi ve son çıkışı eşleştir (mobil Devam Takibi sayfasıyla aynı mantık).
  const byPerson = new Map<string, Map<string, DayShift>>();
  records.forEach(r => {
    const dateKey = toDateStr(new Date(r.recorded_at));
    if (!byPerson.has(r.personnel_id)) byPerson.set(r.personnel_id, new Map());
    const days = byPerson.get(r.personnel_id)!;
    if (!days.has(dateKey)) days.set(dateKey, { entry: null, exit: null, entryVerified: false, exitVerified: false });
    const day = days.get(dateKey)!;
    if (r.type === "entry" && !day.entry) { day.entry = r.recorded_at; day.entryVerified = r.verified; }
    if (r.type === "exit") { day.exit = r.recorded_at; day.exitVerified = r.verified; }
  });

  const summaries: PersonAttendanceSummary[] = [...byPerson.entries()].map(([personId, days]) => {
    let totalHours = 0, verifiedCount = 0, manualCount = 0, missingExit = 0;
    days.forEach(day => {
      if (day.entry) { if (day.entryVerified) verifiedCount++; else manualCount++; }
      if (day.exit) { if (day.exitVerified) verifiedCount++; else manualCount++; }
      if (day.entry && day.exit) {
        const diff = new Date(day.exit).getTime() - new Date(day.entry).getTime();
        if (diff > 0) totalHours += diff / 3600000;
      } else if (day.entry && !day.exit) {
        missingExit++;
      }
    });
    return {
      id: personId,
      name: nameById[personId] ?? "Bilinmiyor",
      daysPresent: days.size,
      totalHours,
      verifiedCount,
      manualCount,
      missingExit,
    };
  }).sort((a, b) => b.totalHours - a.totalHours);

  const totalRecords = records.length;
  const verifiedTotal = records.filter(r => r.verified).length;
  const verifiedRate = totalRecords > 0 ? Math.round((verifiedTotal / totalRecords) * 100) : 0;
  const totalMissingExit = summaries.reduce((a, s) => a + s.missingExit, 0);

  const summaryColumns: DataTableColumn[] = [
    { key: "name", label: "Personel", sortable: true },
    { key: "daysPresent", label: "Gün Sayısı", sortable: true },
    { key: "totalHours", label: "Toplam Saat", sortable: true },
    { key: "verifiedCount", label: "Doğrulanmış Kayıt", sortable: true },
    { key: "manualCount", label: "Manuel Kayıt", sortable: true },
    { key: "missingExit", label: "Eksik Çıkış", sortable: true },
  ];
  const summaryData = summaries.map(s => ({
    name: s.name,
    daysPresent: s.daysPresent,
    totalHours: formatHours(s.totalHours),
    verifiedCount: s.verifiedCount,
    manualCount: s.manualCount,
    missingExit: s.missingExit,
  }));

  const detailColumns: DataTableColumn[] = [
    { key: "date", label: "Tarih", sortable: true },
    { key: "time", label: "Saat", sortable: true },
    { key: "name", label: "Personel", sortable: true },
    { key: "location", label: "Lokasyon", sortable: true },
    { key: "type", label: "Tür", sortable: true },
    { key: "verified", label: "Doğrulama" },
  ];
  const detailData = [...records]
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    .map(r => {
      const d = new Date(r.recorded_at);
      const verifiedCell: DataTableCell = r.verified
        ? { csv: "Doğrulandı", display: <span className="text-emerald-600 font-bold text-xs">Doğrulandı</span> }
        : { csv: "Manuel", display: <span className="text-amber-600 font-bold text-xs">Manuel</span> };
      return {
        date: toDateStr(d),
        time: d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        name: nameById[r.personnel_id] ?? "Bilinmiyor",
        location: r.location_id ? (locationById[r.location_id] ?? "Bilinmiyor") : "—",
        type: r.type === "entry" ? "Giriş" : "Çıkış",
        verified: verifiedCell,
      };
    });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Toplam Kayıt</p>
          <h3 className="font-display text-headline-sm text-on-surface">{totalRecords}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">NFC Doğrulama Oranı</p>
          <h3 className="font-display text-headline-sm text-on-surface">%{verifiedRate}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Takip Edilen Personel</p>
          <h3 className="font-display text-headline-sm text-on-surface">{summaries.length}</h3>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-xs font-semibold text-on-surface-variant">Eksik Çıkış</p>
          <h3 className="font-display text-headline-sm text-on-surface">{totalMissingExit}</h3>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Personel Bazlı Özet</h2>
        <DataTable columns={summaryColumns} data={summaryData} loading={false} exportable />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-headline-sm text-on-surface">Detaylı Kayıtlar</h2>
        <DataTable columns={detailColumns} data={detailData} loading={false} exportable />
      </section>
    </div>
  );
}
