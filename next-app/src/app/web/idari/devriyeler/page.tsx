"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";

// İdari İşler'in Güvenlik'in devriye verilerini salt okunur izlediği sayfa.
// web/guvenlik/devriyeler/page.tsx'e KASITLI olarak dokunulmadı — o sayfa
// Güvenlik yöneticisinin tam CRUD yetkisiyle kullandığı ayrı bir sayfa.
// Bu sayfa aynı patrol_routes/patrol_route_points/patrol_schedules/
// patrol_assignments/patrols/patrol_checkpoints tablolarını sadece okur.

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAY_LABEL: Record<string, string> = { weekday: "Hafta İçi", weekend: "Hafta Sonu", everyday: "Her Gün" };

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateOnly(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${TR_MONTHS[m - 1]} ${y}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`;
}

interface Location { id: string; name: string; }
interface RoutePoint { id: string; name: string; point_order: number; nfc_uid: string | null; }
interface Schedule {
  id: string;
  day_type: "weekday" | "weekend" | "everyday";
  start_time: string;
  interval_minutes: number;
  end_time: string | null;
  is_active: boolean;
  shift_code: string | null;
}
interface PatrolRoute {
  id: string;
  name: string;
  location_id: string | null;
  is_active: boolean;
  points: RoutePoint[];
  schedules: Schedule[];
}

const TABS = [
  { key: "noktalar", label: "Devriye Noktaları" },
  { key: "atilmayan", label: "Atılmayan Devriyeler" },
  { key: "ihlaller", label: "İhlaller" },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function WebIdariDevriyelerPage() {
  const [tab, setTab] = useState<TabKey>("noktalar");
  const { personnel, loading } = useAuth();
  const router = useRouter();
  const isIdari = personnel?.departments?.slug === "idari";

  useEffect(() => {
    if (!loading && personnel && !isIdari) router.replace("/web/dashboard");
  }, [loading, personnel, isIdari, router]);

  if (loading || !personnel || !isIdari) {
    return (
      <div className="flex justify-center py-24">
        <span className="material-symbols-outlined animate-spin text-[40px] text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-display text-headline-lg text-on-background">Devriye Takibi</h1>
        <p className="text-on-surface-variant">Güvenlik departmanının devriye noktalarını, atlanan devriyeleri ve ihlal kayıtlarını salt okunur görüntüleyin.</p>
      </div>

      <div className="flex gap-6 border-b border-outline-variant/20">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 text-sm font-bold transition-all border-b-2 -mb-px ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "noktalar" && <DevriyeNoktalariSection />}
      {tab === "atilmayan" && <AtilmayanDevriyelerSection />}
      {tab === "ihlaller" && <IhlallerSection />}
    </div>
  );
}

// ───────────────────────── Devriye Noktaları (salt okunur) ─────────────────────────

function DevriyeNoktalariSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [locFilter, setLocFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }

    const [locRes, routeRes] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("patrol_routes").select(`
        id, name, location_id, is_active,
        points:patrol_route_points(id, name, point_order, nfc_uid),
        schedules:patrol_schedules(id, day_type, start_time, interval_minutes, end_time, is_active, shift_code)
      `).eq("department_id", dept.id).order("created_at", { ascending: false }),
    ]);
    setLocations((locRes.data || []) as Location[]);
    setRoutes(((routeRes.data || []) as PatrolRoute[]).map(r => ({
      ...r,
      points: [...(r.points || [])].sort((a: RoutePoint, b: RoutePoint) => a.point_order - b.point_order),
      schedules: r.schedules || [],
    })));
    setLoading(false);
  }

  const filtered = locFilter === "all" ? routes : routes.filter(r => r.location_id === locFilter);
  const activeCount = routes.filter(r => r.is_active).length;

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="space-y-1 max-w-xs">
          <label className="text-xs font-semibold text-on-surface-variant ml-1">Bölgeye Göre Filtrele</label>
          <select
            value={locFilter}
            onChange={e => setLocFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
          >
            <option value="all">Tüm Bölgeler</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </section>

      <p className="text-sm text-on-surface-variant">{filtered.length} rota · {activeCount} aktif</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[32px]">route</span>
          </div>
          <p className="font-bold text-on-surface">Henüz rota tanımlanmadı</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(route => {
            const isOpen = expandedId === route.id;
            const loc = locations.find(l => l.id === route.location_id);
            return (
              <div key={route.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isOpen ? null : route.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-container-low transition-colors"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${route.is_active ? "bg-secondary/10" : "bg-surface-container-high"}`}>
                    <span className={`material-symbols-outlined text-[22px] ${route.is_active ? "text-secondary" : "text-on-surface-variant"}`}>route</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-bold text-on-surface text-sm truncate">{route.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {loc?.name ?? "Bölge yok"} · {route.points.length} nokta · {route.schedules.length} plan
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${route.is_active ? "bg-secondary/10 text-secondary" : "bg-surface-container-high text-on-surface-variant"}`}>
                    {route.is_active ? "Aktif" : "Pasif"}
                  </span>
                  <span className={`material-symbols-outlined text-outline transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                </button>

                {isOpen && (
                  <div className="border-t border-outline-variant/20">
                    <div className="px-5 pt-4 pb-3">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Kontrol Noktaları</p>
                      {route.points.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic text-center py-3">Nokta tanımlanmadı</p>
                      ) : (
                        <div className="space-y-2">
                          {route.points.map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-3 py-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-[11px] font-bold text-primary">{pt.point_order}</span>
                              </div>
                              <span className="flex-1 text-sm font-semibold text-on-surface">{pt.name}</span>
                              <span className={`px-2.5 h-7 rounded-full flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${
                                pt.nfc_uid ? "bg-emerald-500/10 text-emerald-600" : "bg-on-surface-variant/10 text-on-surface-variant"
                              }`}>
                                <span className="material-symbols-outlined text-[13px]">nfc</span>
                                {pt.nfc_uid ? "Atandı" : "Atanmadı"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="px-5 pt-3 pb-4 border-t border-outline-variant/20">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Zaman Planları</p>
                      {route.schedules.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic text-center py-3">Plan tanımlanmadı</p>
                      ) : (
                        <div className="space-y-2">
                          {route.schedules.map(s => (
                            <div key={s.id} className="flex items-center gap-3 bg-primary/5 rounded-xl px-3 py-2.5">
                              <div className="w-9 h-9 rounded-xl bg-surface-container-lowest flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-on-surface">{DAY_LABEL[s.day_type]}</p>
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  {s.start_time.slice(0, 5)} başlar · her{" "}
                                  {s.interval_minutes >= 60 ? `${s.interval_minutes / 60} saat` : `${s.interval_minutes} dk`}
                                  {s.end_time ? ` · ${s.end_time.slice(0, 5)}'e kadar` : ""}
                                  {s.shift_code ? ` · Vardiya ${s.shift_code}` : ""}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Ortak tarih aralığı filtresi ─────────────────────────

function DateRangeFilter({ start, end, onStartChange, onEndChange, onFilter }: {
  start: string; end: string; onStartChange: (v: string) => void; onEndChange: (v: string) => void; onFilter: () => void;
}) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-on-surface-variant ml-1">Başlangıç Tarihi</label>
          <input
            type="date"
            value={start}
            onChange={e => onStartChange(e.target.value)}
            className="bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-on-surface-variant ml-1">Bitiş Tarihi</label>
          <input
            type="date"
            value={end}
            onChange={e => onEndChange(e.target.value)}
            className="bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
        <button
          onClick={onFilter}
          className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">filter_alt</span>
          Filtrele
        </button>
      </div>
    </section>
  );
}

// ───────────────────────── Atılmayan Devriyeler ─────────────────────────
// patrol_assignments.status = "missed": (mobile)/devriye/page.tsx bir slotun
// zamanı geçtiği halde devriye başlatılmadığında bu durumu ayarlıyor —
// "planlanan ama gerçekleşmeyen devriye" için mevcut tablodaki tek karşılık bu.

interface MissedAssignment {
  id: string;
  date: string;
  scheduled_time: string;
  personnel_id: string;
  route_id: string;
}

function AtilmayanDevriyelerSection() {
  const [start, setStart] = useState(toDateStr(new Date(Date.now() - 7 * 86400000)));
  const [end, setEnd] = useState(toDateStr(new Date()));
  const [rows, setRows] = useState<MissedAssignment[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [routeInfoById, setRouteInfoById] = useState<Record<string, { name: string; location: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }

    const [{ data: routes }, { data: locs }] = await Promise.all([
      supabase.from("patrol_routes").select("id, name, location_id").eq("department_id", dept.id),
      supabase.from("locations").select("id, name"),
    ]);
    const locNameById: Record<string, string> = {};
    for (const l of (locs || []) as Location[]) locNameById[l.id] = l.name;
    const routeMap: Record<string, { name: string; location: string }> = {};
    const routeIds: string[] = [];
    for (const r of (routes || []) as { id: string; name: string; location_id: string | null }[]) {
      routeIds.push(r.id);
      routeMap[r.id] = { name: r.name, location: r.location_id ? (locNameById[r.location_id] ?? "—") : "—" };
    }
    setRouteInfoById(routeMap);

    if (routeIds.length === 0) { setRows([]); setLoading(false); return; }

    const { data } = await supabase.from("patrol_assignments")
      .select("id, date, scheduled_time, personnel_id, route_id")
      .eq("status", "missed")
      .in("route_id", routeIds)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });

    const list = (data || []) as MissedAssignment[];
    setRows(list);

    const ids = [...new Set(list.map(r => r.personnel_id).filter(Boolean))];
    if (ids.length > 0) {
      const { data: people } = await supabase.from("personnel").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of people || []) map[p.id] = p.full_name;
      setNameById(map);
    } else {
      setNameById({});
    }
    setLoading(false);
  }

  const columns: DataTableColumn[] = [
    { key: "tarih", label: "Tarih", sortable: true },
    { key: "saat", label: "Saat" },
    { key: "lokasyon", label: "Lokasyon" },
    { key: "personel", label: "Planlanan Personel" },
    { key: "aciklama", label: "Açıklama" },
  ];

  const tableData = rows.map(r => {
    const routeInfo = routeInfoById[r.route_id];
    return {
      tarih: formatDateOnly(r.date),
      saat: r.scheduled_time.slice(0, 5),
      lokasyon: routeInfo?.location ?? "—",
      personel: nameById[r.personnel_id] ?? "Bilinmiyor",
      aciklama: `${routeInfo?.name ?? "Rota"} rotasında planlanan devriye başlatılmadı`,
    };
  });

  return (
    <div className="space-y-6">
      <DateRangeFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} onFilter={load} />
      {!loading && rows.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <div className="w-16 h-16 bg-secondary/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary text-[32px]">check_circle</span>
          </div>
          <p className="font-bold text-on-surface">Seçili tarih aralığında atlanmış devriye yok</p>
        </div>
      ) : (
        <DataTable columns={columns} data={tableData} loading={loading} exportable rowClassName={() => "bg-error/10"} />
      )}
    </div>
  );
}

// ───────────────────────── İhlaller ─────────────────────────
// Şemada ayrı bir "ihlal" tablosu yok, "durum" (açık/inceleniyor/kapatıldı)
// hiçbir yerde kalıcı tutulmuyor — bu yüzden tüm satırlar hesaplanan/türetilen
// kayıtlar ve Durum her zaman "Açık" gösteriliyor (gerçek bir inceleme iş
// akışı için yeni bir tablo gerekir). Süre aşımı ve geç imzalama eşikleri
// departmanın kendi verisinden (medyan) türetilen istatistiksel sezgisel
// değerlerdir, sabit kodlanmış bir kural değil.

interface PatrolRow {
  id: string;
  personnel_id: string;
  route_name: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_checkpoints: number;
  completed_checkpoints: number;
  duration_seconds: number | null;
}

interface ViolationRow {
  tarih: string;
  lokasyon: string;
  tur: string;
  personel: string;
  durum: DataTableCell;
  aciklama: string;
}

function IhlallerSection() {
  const [start, setStart] = useState(toDateStr(new Date(Date.now() - 30 * 86400000)));
  const [end, setEnd] = useState(toDateStr(new Date()));
  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }

    const [{ data: routes }, { data: locs }, { data: patrolsData }] = await Promise.all([
      supabase.from("patrol_routes").select("name, location_id").eq("department_id", dept.id),
      supabase.from("locations").select("id, name"),
      supabase.from("patrols")
        .select("id, personnel_id, route_name, status, started_at, completed_at, total_checkpoints, completed_checkpoints, duration_seconds")
        .eq("department_id", dept.id)
        .gte("started_at", `${start}T00:00:00`)
        .lte("started_at", `${end}T23:59:59`)
        .order("started_at", { ascending: false }),
    ]);

    const locNameById: Record<string, string> = {};
    for (const l of (locs || []) as Location[]) locNameById[l.id] = l.name;
    // patrols.route_name düz metin bir kopya (route_id FK'si yok) — eşleştirme
    // rota adı üzerinden, en iyi çaba (best-effort) esasıyla yapılıyor.
    const locByRouteName: Record<string, string> = {};
    for (const r of (routes || []) as { name: string; location_id: string | null }[]) {
      locByRouteName[r.name] = r.location_id ? (locNameById[r.location_id] ?? "—") : "—";
    }

    const patrols = (patrolsData || []) as PatrolRow[];

    const ids = [...new Set(patrols.map(p => p.personnel_id).filter(Boolean))];
    const names: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: people } = await supabase.from("personnel").select("id, full_name").in("id", ids);
      for (const p of people || []) names[p.id] = p.full_name;
    }

    const patrolIds = patrols.map(p => p.id);
    const checkpointsByPatrol: Record<string, { checkpoint_order: number; scanned_at: string }[]> = {};
    if (patrolIds.length > 0) {
      const { data: cps } = await supabase.from("patrol_checkpoints")
        .select("patrol_id, checkpoint_order, scanned_at")
        .in("patrol_id", patrolIds)
        .not("scanned_at", "is", null)
        .order("checkpoint_order");
      for (const c of (cps || []) as { patrol_id: string; checkpoint_order: number; scanned_at: string }[]) {
        (checkpointsByPatrol[c.patrol_id] ??= []).push(c);
      }
    }

    // Süre aşımı eşiği: tamamlanan devriyelerin medyan süresi × 1.5
    // (en az 5 örnek olmadan anlamlı bir medyan kurulamaz).
    const completedDurations = patrols
      .filter(p => p.status === "completed" && p.duration_seconds)
      .map(p => p.duration_seconds as number)
      .sort((a, b) => a - b);
    const medianDuration = completedDurations.length >= 5 ? completedDurations[Math.floor(completedDurations.length / 2)] : null;

    const rows: ViolationRow[] = [];
    const durumAcik: DataTableCell = {
      csv: "Açık",
      display: <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-error/10 text-error">Açık</span>,
    };

    for (const p of patrols) {
      const lokasyon = (p.route_name && locByRouteName[p.route_name]) ?? "—";
      const personel = names[p.personnel_id] ?? "Bilinmiyor";
      const tarih = formatDateOnly(p.started_at.slice(0, 10));

      if ((p.status === "completed" || p.status === "cancelled") && p.completed_checkpoints < p.total_checkpoints) {
        rows.push({
          tarih, lokasyon, tur: "Atlanan Nokta", personel, durum: durumAcik,
          aciklama: `${p.completed_checkpoints}/${p.total_checkpoints} kontrol noktası tamamlandı`,
        });
      }

      if (medianDuration && p.status === "completed" && p.duration_seconds && p.duration_seconds > medianDuration * 1.5) {
        rows.push({
          tarih, lokasyon, tur: "Süre Aşımı", personel, durum: durumAcik,
          aciklama: `Devriye süresi ${formatDuration(p.duration_seconds)} — departman ortalamasının belirgin üzerinde`,
        });
      }

      if (p.status === "cancelled") {
        rows.push({
          tarih, lokasyon, tur: "Diğer", personel, durum: durumAcik,
          aciklama: "Devriye iptal edildi",
        });
      }

      const cps = checkpointsByPatrol[p.id];
      if (cps && cps.length >= 3) {
        const gaps: number[] = [];
        for (let i = 1; i < cps.length; i++) {
          gaps.push((new Date(cps[i].scanned_at).getTime() - new Date(cps[i - 1].scanned_at).getTime()) / 60000);
        }
        const sortedGaps = [...gaps].sort((a, b) => a - b);
        const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
        gaps.forEach((gap, i) => {
          if (medianGap > 0 && gap > medianGap * 2 && gap > 10) {
            rows.push({
              tarih, lokasyon, tur: "Geç İmzalama", personel, durum: durumAcik,
              aciklama: `${i + 2}. kontrol noktası önceki noktadan ${Math.round(gap)} dk sonra imzalandı`,
            });
          }
        });
      }
    }

    setViolations(rows);
    setLoading(false);
  }

  const columns: DataTableColumn[] = [
    { key: "tarih", label: "Tarih", sortable: true },
    { key: "lokasyon", label: "Lokasyon" },
    { key: "tur", label: "İhlal Türü" },
    { key: "personel", label: "Personel" },
    { key: "durum", label: "Durum" },
    { key: "aciklama", label: "Açıklama" },
  ];

  return (
    <div className="space-y-6">
      <DateRangeFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} onFilter={load} />
      {!loading && violations.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <div className="w-16 h-16 bg-secondary/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary text-[32px]">verified</span>
          </div>
          <p className="font-bold text-on-surface">Seçili tarih aralığında ihlal kaydı yok</p>
        </div>
      ) : (
        <DataTable columns={columns} data={violations as unknown as Record<string, unknown>[]} loading={loading} exportable />
      )}
    </div>
  );
}
