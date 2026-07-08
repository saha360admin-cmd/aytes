"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Toplam kadro sayısı — sorguyla hesaplanmıyor, sabit tutuluyor.
// personnel tablosundaki durum filtreleri (arşiv/izinli/pasif) gerçek
// kadro sayısını tutarlı vermediği için talep üzerine elle sabitlendi.
const FIXED_TOTAL_PERSONNEL = 103;

interface LocationCard {
  location_id: string;
  name: string;
  activeNow: number;
  todayTotal: number;
  activeNames: { id: string; name: string }[];
}

interface RecentIncident {
  id: string;
  title: string | null;
  description: string;
  type: string;
  created_at: string;
  location: string | null;
}

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

const TYPE_ICON: Record<string, string> = {
  fire: "local_fire_department",
  theft: "lock_person",
  fight: "sports_mma",
  medical: "medical_services",
  unauthorized_entry: "gpp_bad",
  suspicious: "visibility",
  maintenance: "build",
  form: "description",
  other: "report_problem",
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Bir vardiya atamasının (shift_date + shift_types.start/end_time) şu anki
// saatte gerçekten devam edip etmediğini hesaplar. Gece yarısını aşan
// vardiyalar (ör. 22:00-06:00) doğru şekilde ele alınır.
function isAssignmentActiveNow(shiftDateStr: string, startTime: string | null, endTime: string | null, now: Date): boolean {
  if (!startTime || !endTime) return false;
  const [sh, sm] = startTime.slice(0, 5).split(":").map(Number);
  const [eh, em] = endTime.slice(0, 5).split(":").map(Number);
  const [y, m, d] = shiftDateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, sh, sm);
  let end = new Date(y, m - 1, d, eh, em);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return now >= start && now < end;
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function WebGuvenlikPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [totalPersonnel, setTotalPersonnel] = useState(0);
  const [activePersonnel, setActivePersonnel] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [openIncidents, setOpenIncidents] = useState(0);
  const [patrolCompletionPct, setPatrolCompletionPct] = useState<number | null>(null);
  const [locations, setLocations] = useState<LocationCard[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<RecentIncident[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hoveredLocId, setHoveredLocId] = useState<string | null>(null);
  const [popoverAbove, setPopoverAbove] = useState(false);
  const locationGridRef = useRef<HTMLDivElement>(null);
  const [locationShortages, setLocationShortages] = useState<{ id: string; name: string; target: number; actual: number; deficit: number }[]>([]);
  const [showShortages, setShowShortages] = useState(false);

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(true), 120000);
    return () => clearInterval(interval);
  }, []);

  async function load(isBackground: boolean) {
    if (!isBackground) setLoading(true);
    setError(false);
    try {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) throw new Error("dept not found");
      const deptId = dept.id;
      const now = new Date();
      const todayStr = toDateStr(now);
      const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = toDateStr(yesterday);
      const startOfDay = new Date(todayStr + "T00:00:00").toISOString();

      const [
        { data: activeRows },
        { count: reqCount },
        { data: incDepts },
        { data: todayPatrols },
        { data: allLocations },
      ] = await Promise.all([
        supabase.from("personnel").select("id, location_id, full_name, role").eq("department_id", deptId).eq("status", "active"),
        supabase.from("requests").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "pending"),
        supabase.from("incident_departments").select("incident_id, status").eq("department_id", deptId),
        supabase.from("patrols").select("id, status").eq("department_id", deptId).gte("created_at", startOfDay),
        supabase.from("locations").select("id, name, target_count"),
      ]);

      // Toplam kadro sorgudan değil, sabit olarak tutuluyor (talep üzerine).
      setTotalPersonnel(FIXED_TOTAL_PERSONNEL);
      setActivePersonnel((activeRows || []).length);
      setPendingRequests(reqCount || 0);
      setOpenIncidents((incDepts || []).filter(r => r.status === "open" || r.status === "in_progress").length);

      if (todayPatrols && todayPatrols.length > 0) {
        const completed = todayPatrols.filter(p => p.status === "completed").length;
        setPatrolCompletionPct(Math.round((completed / todayPatrols.length) * 100));
      } else {
        setPatrolCompletionPct(null);
      }

      // Eksik Güvenlik: mobildeki (mobile)/yonetici/page.tsx'teki
      // "Eksik Güvenlik" widget'ıyla birebir aynı mantık — yönetici/
      // süpervizörler idari olarak Genel Müdürlük'e bağlı sayılır,
      // her lokasyonun target_count'undan aşağı kalanlar "eksik".
      const allLocs = (allLocations || []) as { id: string; name: string; target_count: number }[];
      const genelMudId = allLocs.find(l => l.name === "Genel Müdürlük")?.id;
      const locCounts: Record<string, number> = {};
      for (const p of (activeRows || []) as { location_id: string | null; role: string }[]) {
        let locId = p.location_id;
        if ((p.role === "admin" || p.role === "supervisor") && genelMudId) locId = genelMudId;
        if (locId) locCounts[locId] = (locCounts[locId] || 0) + 1;
      }
      const shortages = allLocs
        .map(l => ({ id: l.id, name: l.name, target: l.target_count, actual: locCounts[l.id] || 0, deficit: l.target_count - (locCounts[l.id] || 0) }))
        .filter(l => l.deficit > 0)
        .sort((a, b) => b.deficit - a.deficit);
      setLocationShortages(shortages);

      // Canlı Lokasyon Takibi: bugün+dün (gece yarısını aşan vardiyalar için)
      // yayınlanmış atamalar, shift_types saatleriyle birleştirilip her
      // atamanın şu anda gerçekten devam edip etmediği hesaplanır.
      const activeIds = (activeRows || []).map(p => p.id);
      const nameById = new Map((activeRows || []).map(p => [p.id, p.full_name as string]));
      if (activeIds.length > 0) {
        const [{ data: assignments }, { data: shiftTypesData }] = await Promise.all([
          supabase.from("shift_assignments")
            .select("location_id, shift_code, shift_date, personnel_id")
            .in("personnel_id", activeIds)
            .in("shift_date", [yesterdayStr, todayStr])
            .eq("status", "published")
            .not("location_id", "is", null),
          supabase.from("shift_types").select("code, start_time, end_time, is_day_off").eq("department_id", deptId),
        ]);
        const locs = allLocs;

        const shiftTypeByCode = new Map((shiftTypesData || []).map(s => [s.code, s]));
        // Sayı ile isim listesinin her zaman birebir örtüşmesi için ikisi
        // de AYNI benzersiz-kişi kümesinden (Set) türetiliyor — önceden
        // sayaç ile isim listesi ayrı ayrı tutulduğunda, aynı kişi için
        // çakışan/yinelenen atama satırları sayıyı isim listesinden
        // fazla gösterebiliyordu.
        const activeNowPeople: Record<string, Set<string>> = {};
        const todayTotalPeople: Record<string, Set<string>> = {};

        (assignments || []).forEach(a => {
          // "T" ile başlayan kodlar (T211 hafta tatili, T216 yıllık izin,
          // T241 rapor, T245 ücretsiz izin vb.) fiilen görevde değil —
          // is_day_off bayrağı tutarsız olabileceği için doğrudan kod
          // önekine bakılıyor.
          if (a.shift_code?.toUpperCase().startsWith("T")) return;
          const st = shiftTypeByCode.get(a.shift_code);
          if (!st || st.is_day_off || !a.location_id) return;
          if (a.shift_date === todayStr) {
            (todayTotalPeople[a.location_id] ??= new Set()).add(a.personnel_id);
          }
          if (isAssignmentActiveNow(a.shift_date, st.start_time, st.end_time, now)) {
            (activeNowPeople[a.location_id] ??= new Set()).add(a.personnel_id);
          }
        });

        const relevantLocIds = new Set([...Object.keys(activeNowPeople), ...Object.keys(todayTotalPeople)]);
        const locCards: LocationCard[] = (locs || [])
          .filter(l => relevantLocIds.has(l.id))
          .map(l => {
            const activeSet = activeNowPeople[l.id] ?? new Set<string>();
            return {
              location_id: l.id,
              name: l.name,
              activeNow: activeSet.size,
              todayTotal: (todayTotalPeople[l.id] ?? new Set()).size,
              activeNames: [...activeSet]
                .map(id => ({ id, name: nameById.get(id) || "İsimsiz Personel" }))
                .sort((a, b) => a.name.localeCompare(b.name, "tr")),
            };
          })
          .sort((a, b) => b.activeNow - a.activeNow || b.todayTotal - a.todayTotal);
        setLocations(locCards);
      } else {
        setLocations([]);
      }

      // Son aktiviteler: gerçek son olaylar (patrol/vardiya-değişimi gibi
      // ayrı bir "aktivite log"u yok, bu yüzden feed şimdilik olaylardan geliyor)
      const incidentIds = (incDepts || []).map(r => r.incident_id);
      if (incidentIds.length > 0) {
        const { data: incidents } = await supabase
          .from("incidents")
          .select("id, title, description, type, created_at, location")
          .in("id", incidentIds)
          .order("created_at", { ascending: false })
          .limit(5);
        setRecentIncidents((incidents || []) as RecentIncident[]);
      } else {
        setRecentIncidents([]);
      }

      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  const topLocation = locations[0] || null;

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 w-64 bg-surface-container animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-container-lowest border border-outline-variant/30 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-error font-semibold">Veriler yüklenemedi. Sayfayı yenileyin.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ background: "linear-gradient(135deg, #0D47A1 0%, #1565C0 55%, #1E88E5 100%)" }}
        >
          <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-headline-lg text-on-background">Güvenlik Komuta Merkezi</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(135deg, #0D47A1, #1E88E5)" }}>AY-GÜV</span>
          </div>
          <p className="text-on-surface-variant">Sistemdeki {locations.length} aktif güvenlik noktasının anlık durumu</p>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          className="relative bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-3"
          onMouseEnter={() => locationShortages.length > 0 && setShowShortages(true)}
          onMouseLeave={() => setShowShortages(false)}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-on-surface-variant text-sm mb-1">Aktif Personel</p>
              <h3 className="text-4xl text-primary font-bold">{activePersonnel}<span className="text-xl text-on-surface-variant/50">/{totalPersonnel}</span></h3>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl flex-shrink-0">
              <span className="material-symbols-outlined">group</span>
            </div>
          </div>

          {locationShortages.length > 0 && (
            <div className="flex items-center gap-1.5 text-error text-xs font-bold">
              <span className="material-symbols-outlined text-[14px]">person_alert</span>
              {locationShortages.length} lokasyonda {locationShortages.reduce((s, l) => s + l.deficit, 0)} eksik personel
            </div>
          )}

          {showShortages && locationShortages.length > 0 && (
            <div className="absolute z-50 top-full left-0 mt-2 w-72 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-error/10 border-b border-outline-variant/20 flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_alert</span>
                <p className="text-xs font-bold text-error">Eksik Güvenlik — {locationShortages.length} lokasyon</p>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-outline-variant/10">
                {locationShortages.map(loc => (
                  <div key={loc.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-on-surface truncate">{loc.name}</span>
                      <span className="text-[10px] font-bold text-error bg-error/10 px-1.5 py-0.5 rounded-full flex-shrink-0">-{loc.deficit}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 bg-surface-container-high rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-error rounded-full" style={{ width: `${Math.max(0, Math.round((loc.actual / loc.target) * 100))}%` }} />
                      </div>
                      <span className="text-[10px] text-on-surface-variant font-mono flex-shrink-0">{loc.actual}/{loc.target}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex items-start justify-between">
          <div>
            <p className="text-on-surface-variant text-sm mb-1">Bekleyen Talepler</p>
            <h3 className="text-4xl text-tertiary font-bold">{pendingRequests}</h3>
          </div>
          <div className="p-3 bg-tertiary-container/20 text-tertiary rounded-xl">
            <span className="material-symbols-outlined">pending_actions</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex items-start justify-between">
          <div>
            <p className="text-on-surface-variant text-sm mb-1">Açık Olay Raporları</p>
            <h3 className="text-4xl text-error font-bold">{openIncidents}</h3>
          </div>
          <div className="p-3 bg-error-container/50 text-error rounded-xl">
            <span className="material-symbols-outlined">report_problem</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex items-start justify-between">
          <div>
            <p className="text-on-surface-variant text-sm mb-1">Devriye Tamamlanma</p>
            <h3 className="text-4xl text-secondary font-bold">{patrolCompletionPct === null ? "—" : `%${patrolCompletionPct}`}</h3>
          </div>
          <div className="p-3 bg-secondary-container/50 text-secondary rounded-xl">
            <span className="material-symbols-outlined">task_alt</span>
          </div>
        </div>
      </div>

      {/* Canlı Lokasyon Takibi */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
        <div className="p-6 border-b border-outline-variant/20 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl text-on-surface font-bold flex items-center gap-2">
              Canlı Lokasyon Takibi
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
              </span>
            </h2>
            <p className="text-on-surface-variant text-sm">Şu an nöbette olan personel sayısı, saate göre</p>
          </div>
          {lastUpdated && (
            <p className="text-xs text-on-surface-variant flex-shrink-0">Güncellendi: {lastUpdated.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p>
          )}
        </div>
        <div ref={locationGridRef} className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-h-[500px] overflow-y-auto no-scrollbar">
          {locations.length === 0 ? (
            <p className="col-span-full text-center text-on-surface-variant py-8">Kayıt bulunamadı</p>
          ) : locations.map(loc => {
            const status = loc.activeNow > 0 ? "active" : loc.todayTotal > 0 ? "pending" : "empty";
            const dotClass = status === "active" ? "bg-secondary" : status === "pending" ? "bg-amber-500" : "bg-outline";
            const label = status === "active" ? "Nöbette" : status === "pending" ? "Aralarda" : "İnsansız";
            return (
              <div
                key={loc.location_id}
                className="relative p-4 rounded-lg border border-outline-variant/30 bg-surface hover:bg-surface-container transition-colors"
                onMouseEnter={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const popoverHeight = Math.min(loc.activeNames.length, 13) * 22 + 40;
                  // Hem ekranın hem de kaydırmalı lokasyon kutusunun alt
                  // sınırına bakılıyor — hangisi daha yakınsa ona göre
                  // popup yukarı/aşağı açılıyor (kutunun altındaki
                  // satırlarda popup aşağı açılırsa kesiliyordu).
                  const containerBottom = locationGridRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
                  const availableSpace = Math.min(window.innerHeight, containerBottom) - rect.bottom;
                  setPopoverAbove(availableSpace < popoverHeight + 16);
                  setHoveredLocId(loc.location_id);
                }}
                onMouseLeave={() => setHoveredLocId(null)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-3 h-3 rounded-full ${dotClass}`} />
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{label}</span>
                </div>
                <h4 className="font-bold text-on-surface mb-1 truncate text-sm">{loc.name}</h4>
                <div className="flex items-center gap-1 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px]">person</span>
                  <span className="text-xs"><span className="font-bold text-on-surface">{loc.activeNow}</span> şu an · {loc.todayTotal} bugün toplam</span>
                </div>

                {hoveredLocId === loc.location_id && loc.activeNames.length > 0 && (
                  <div className={`absolute z-50 left-1/2 -translate-x-1/2 w-56 bg-on-surface text-surface rounded-xl shadow-lg p-3 text-left pointer-events-none ${popoverAbove ? "bottom-full mb-2" : "top-full mt-2"}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-surface/60 mb-1.5">Nöbette ({loc.activeNames.length})</p>
                    <ul className="space-y-1 max-h-72 overflow-y-auto">
                      {loc.activeNames.map(n => (
                        <li key={n.id} className="text-xs font-semibold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">person</span>
                          {n.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Son Aktiviteler + En Aktif Bölge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 flex flex-col">
          <div className="p-6 border-b border-outline-variant/20">
            <h2 className="text-xl text-on-surface font-bold">Son Aktiviteler</h2>
            <p className="text-on-surface-variant text-sm">Şu an için son olay raporlarından geliyor</p>
          </div>
          <div className="p-6 space-y-3">
            {recentIncidents.length === 0 ? (
              <p className="text-center text-on-surface-variant py-4">Kayıt bulunamadı</p>
            ) : recentIncidents.map(inc => (
              <div key={inc.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low border-l-4 border-error">
                <div className="p-2 bg-error-container/50 text-error rounded-lg">
                  <span className="material-symbols-outlined text-[20px]">{TYPE_ICON[inc.type] || "report_problem"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-bold text-on-surface text-sm">{inc.title || TYPE_LABELS[inc.type] || inc.type}</h4>
                    <span className="text-xs text-on-surface-variant flex-shrink-0">{timeAgo(inc.created_at)}</span>
                  </div>
                  <p className="text-sm text-on-surface-variant truncate">{inc.location ? `${inc.location} — ` : ""}{inc.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl text-on-surface font-bold">En Aktif Bölge</h2>
            <div className="p-2 bg-surface-container rounded-full">
              <span className="material-symbols-outlined text-primary">location_on</span>
            </div>
          </div>
          {topLocation && topLocation.activeNow > 0 ? (
            <div className="mt-auto bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
              <p className="text-xs font-bold text-on-surface-variant uppercase">Şu An En Çok Personel</p>
              <p className="text-xl text-primary font-bold truncate">{topLocation.name}</p>
              <div className="flex items-center gap-1.5 mt-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">group</span>
                <span className="text-sm">{topLocation.activeNow} Personel Nöbette</span>
              </div>
            </div>
          ) : (
            <p className="mt-auto text-center text-on-surface-variant py-4">Şu an nöbette kimse yok</p>
          )}
        </div>
      </div>
    </div>
  );
}
