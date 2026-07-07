"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface GuvenlikStats { activePersonnel: number; locationCount: number; openIncidents: number }
interface TemizlikStats { activePersonnel: number; locationCount: number; completedToday: number }
interface TeknikStats { activePersonnel: number; openTickets: number }

interface CardState<T> {
  loading: boolean;
  error: boolean;
  data: T | null;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadGuvenlikStats(): Promise<GuvenlikStats> {
  const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
  if (!dept) throw new Error("dept not found");

  const [{ data: personnelRows }, { data: incDepts }] = await Promise.all([
    supabase.from("personnel").select("location_id").eq("department_id", dept.id).eq("status", "active"),
    supabase.from("incident_departments").select("status").eq("department_id", dept.id),
  ]);

  const rows = personnelRows || [];
  const locationIds = new Set(rows.map(r => r.location_id).filter(Boolean));
  const openIncidents = (incDepts || []).filter(r => r.status === "open" || r.status === "in_progress").length;

  return { activePersonnel: rows.length, locationCount: locationIds.size, openIncidents };
}

async function loadTemizlikStats(): Promise<TemizlikStats> {
  const { data: dept } = await supabase.from("departments").select("id").eq("slug", "temizlik").single();
  if (!dept) throw new Error("dept not found");

  const { data: personnelRows } = await supabase
    .from("personnel")
    .select("location_id")
    .eq("department_id", dept.id)
    .eq("status", "active");

  const rows = personnelRows || [];
  const locationIds = new Set(rows.map(r => r.location_id).filter(Boolean));

  const todayStr = toDateStr(new Date());
  const { data: checklists } = await supabase
    .from("cleaning_checklists")
    .select("id")
    .eq("department_id", dept.id)
    .eq("date", todayStr);

  const checklistIds = (checklists || []).map(c => c.id);
  let completedToday = 0;
  if (checklistIds.length > 0) {
    const { data: items } = await supabase
      .from("cleaning_checklist_items")
      .select("checklist_id, status")
      .in("checklist_id", checklistIds);

    const byChecklist: Record<string, string[]> = {};
    for (const it of items || []) {
      (byChecklist[it.checklist_id] ??= []).push(it.status);
    }
    completedToday = checklistIds.filter(id => (byChecklist[id] || []).every(s => s === "tamamlandı")).length;
  }

  return { activePersonnel: rows.length, locationCount: locationIds.size, completedToday };
}

async function loadTeknikStats(): Promise<TeknikStats> {
  const { data: dept } = await supabase.from("departments").select("id").eq("slug", "teknik").single();
  if (!dept) throw new Error("dept not found");

  const [{ count: personnelCount }, { count: ticketCount }] = await Promise.all([
    supabase.from("personnel").select("id", { count: "exact", head: true }).eq("department_id", dept.id).eq("status", "active"),
    supabase.from("service_requests").select("id", { count: "exact", head: true }).eq("department_id", dept.id).in("status", ["open", "in_progress"]),
  ]);

  return { activePersonnel: personnelCount || 0, openTickets: ticketCount || 0 };
}

function StatSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-24 bg-surface-container animate-pulse rounded" />
      <div className="h-3 w-16 bg-surface-container animate-pulse rounded" />
    </div>
  );
}

export default function WebDashboardPage() {
  const { personnel } = useAuth();

  const [guvenlik, setGuvenlik] = useState<CardState<GuvenlikStats>>({ loading: true, error: false, data: null });
  const [temizlik, setTemizlik] = useState<CardState<TemizlikStats>>({ loading: true, error: false, data: null });
  const [teknik, setTeknik] = useState<CardState<TeknikStats>>({ loading: true, error: false, data: null });

  useEffect(() => {
    loadGuvenlikStats()
      .then(data => setGuvenlik({ loading: false, error: false, data }))
      .catch(() => setGuvenlik({ loading: false, error: true, data: null }));

    loadTemizlikStats()
      .then(data => setTemizlik({ loading: false, error: false, data }))
      .catch(() => setTemizlik({ loading: false, error: true, data: null }));

    loadTeknikStats()
      .then(data => setTeknik({ loading: false, error: false, data }))
      .catch(() => setTeknik({ loading: false, error: true, data: null }));
  }, []);

  const allCards = [
    {
      slug: "guvenlik", label: "Güvenlik", icon: "security", color: "text-secondary", bg: "bg-secondary-container",
      state: guvenlik,
      render: (d: GuvenlikStats) => (
        <>
          <p className="font-body-md text-on-surface-variant">{d.activePersonnel} aktif personel</p>
          <p className="font-label-sm text-outline">{d.locationCount} lokasyon · {d.openIncidents} açık olay</p>
        </>
      ),
    },
    {
      slug: "temizlik", label: "Temizlik", icon: "cleaning_services", color: "text-primary-container", bg: "bg-primary-fixed-dim",
      state: temizlik,
      render: (d: TemizlikStats) => (
        <>
          <p className="font-body-md text-on-surface-variant">{d.activePersonnel} aktif personel</p>
          <p className="font-label-sm text-outline">{d.locationCount} lokasyon · bugün {d.completedToday} tamamlanan</p>
        </>
      ),
    },
    {
      slug: "teknik", label: "Teknik", icon: "engineering", color: "text-tertiary", bg: "bg-tertiary-fixed",
      state: teknik,
      render: (d: TeknikStats) => (
        <>
          <p className="font-body-md text-on-surface-variant">{d.activePersonnel} aktif personel</p>
          <p className="font-label-sm text-outline">{d.openTickets} açık çağrı</p>
        </>
      ),
    },
  ];

  const cards = personnel?.role === "admin"
    ? allCards
    : allCards.filter(c => c.slug === personnel?.departments?.slug);

  return (
    <div className="p-8">
      <h1 className="font-display text-headline-lg text-on-background mb-xs">Ana Panel</h1>
      <p className="font-body-md text-on-surface-variant mb-xl">
        Hoş geldiniz, {personnel?.full_name} — {personnel?.role === "admin" ? "tüm birimler" : personnel?.departments?.name}
      </p>

      <div className="grid grid-cols-3 gap-lg">
        {cards.map(c => (
          <div key={c.slug} className="bg-surface-container-lowest rounded-lg shadow-sm p-lg space-y-md">
            <div className={`w-12 h-12 rounded-full ${c.bg} flex items-center justify-center ${c.color}`}>
              <span className="material-symbols-outlined text-[24px]">{c.icon}</span>
            </div>
            <div>
              <h2 className="font-headline-md text-body-lg text-on-surface mb-1">{c.label}</h2>
              {c.state.loading ? (
                <StatSkeleton />
              ) : c.state.error || !c.state.data ? (
                <p className="font-body-md text-on-surface-variant">—</p>
              ) : (
                c.render(c.state.data as never)
              )}
            </div>
          </div>
        ))}
      </div>

      {cards.length === 0 && (
        <p className="font-label-md text-on-surface-variant">Görüntülenecek birim yok.</p>
      )}
    </div>
  );
}
