"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface LocationCard {
  location_id: string;
  name: string;
  activePersonnel: number;
  hasShiftToday: boolean;
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

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) throw new Error("dept not found");
      const deptId = dept.id;
      const todayStr = toDateStr(new Date());
      const startOfDay = new Date(todayStr + "T00:00:00").toISOString();

      const [
        { count: totalCount },
        { data: activeRows },
        { count: reqCount },
        { data: incDepts },
        { data: todayPatrols },
      ] = await Promise.all([
        supabase.from("personnel").select("id", { count: "exact", head: true }).eq("department_id", deptId),
        supabase.from("personnel").select("id, location_id").eq("department_id", deptId).eq("status", "active"),
        supabase.from("requests").select("id", { count: "exact", head: true }).eq("department_id", deptId).eq("status", "pending"),
        supabase.from("incident_departments").select("incident_id, status").eq("department_id", deptId),
        supabase.from("patrols").select("id, status").eq("department_id", deptId).gte("created_at", startOfDay),
      ]);

      setTotalPersonnel(totalCount || 0);
      setActivePersonnel((activeRows || []).length);
      setPendingRequests(reqCount || 0);
      setOpenIncidents((incDepts || []).filter(r => r.status === "open" || r.status === "in_progress").length);

      if (todayPatrols && todayPatrols.length > 0) {
        const completed = todayPatrols.filter(p => p.status === "completed").length;
        setPatrolCompletionPct(Math.round((completed / todayPatrols.length) * 100));
      } else {
        setPatrolCompletionPct(null);
      }

      // Lokasyon özeti: aktif personelin location_id'sine göre grupla
      const counts: Record<string, number> = {};
      for (const p of (activeRows || []) as { location_id: string | null }[]) {
        if (p.location_id) counts[p.location_id] = (counts[p.location_id] || 0) + 1;
      }
      const locationIds = Object.keys(counts);
      if (locationIds.length > 0) {
        const [{ data: locs }, { data: todayShifts }] = await Promise.all([
          supabase.from("locations").select("id, name").in("id", locationIds),
          supabase.from("shift_assignments").select("location_id").in("location_id", locationIds).eq("shift_date", todayStr).eq("status", "published"),
        ]);
        const shiftedLocIds = new Set((todayShifts || []).map(s => s.location_id));
        const locCards: LocationCard[] = (locs || [])
          .map(l => ({ location_id: l.id, name: l.name, activePersonnel: counts[l.id] || 0, hasShiftToday: shiftedLocIds.has(l.id) }))
          .sort((a, b) => b.activePersonnel - a.activePersonnel);
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
    } catch {
      setError(true);
    } finally {
      setLoading(false);
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
      <div>
        <h1 className="font-display text-headline-lg text-on-background">Güvenlik Komuta Merkezi</h1>
        <p className="text-on-surface-variant">Sistemdeki {locations.length} aktif güvenlik noktasının anlık durumu</p>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex items-start justify-between">
          <div>
            <p className="text-on-surface-variant text-sm mb-1">Aktif Personel</p>
            <h3 className="text-4xl text-primary font-bold">{activePersonnel}<span className="text-xl text-on-surface-variant/50">/{totalPersonnel}</span></h3>
          </div>
          <div className="p-3 bg-primary/10 text-primary rounded-xl">
            <span className="material-symbols-outlined">group</span>
          </div>
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
        <div className="p-6 border-b border-outline-variant/20">
          <h2 className="text-xl text-on-surface font-bold">Canlı Lokasyon Takibi</h2>
          <p className="text-on-surface-variant text-sm">Personel sayısı ve bugünkü vardiya durumu</p>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-h-[500px] overflow-y-auto no-scrollbar">
          {locations.length === 0 ? (
            <p className="col-span-full text-center text-on-surface-variant py-8">Kayıt bulunamadı</p>
          ) : locations.map(loc => (
            <div key={loc.location_id} className="p-4 rounded-lg border border-outline-variant/30 bg-surface hover:bg-surface-container transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className={`w-3 h-3 rounded-full ${loc.hasShiftToday ? "bg-secondary" : "bg-outline"}`} />
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  {loc.hasShiftToday ? "Aktif" : "İnsansız"}
                </span>
              </div>
              <h4 className="font-bold text-on-surface mb-1 truncate text-sm">{loc.name}</h4>
              <div className="flex items-center gap-1 text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px]">person</span>
                <span className="text-xs">{loc.activePersonnel} Görevli</span>
              </div>
            </div>
          ))}
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
          {topLocation ? (
            <div className="mt-auto bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
              <p className="text-xs font-bold text-on-surface-variant uppercase">En Çok Personel</p>
              <p className="text-xl text-primary font-bold truncate">{topLocation.name}</p>
              <div className="flex items-center gap-1.5 mt-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">group</span>
                <span className="text-sm">{topLocation.activePersonnel} Personel</span>
              </div>
            </div>
          ) : (
            <p className="mt-auto text-center text-on-surface-variant py-4">Kayıt bulunamadı</p>
          )}
        </div>
      </div>
    </div>
  );
}
