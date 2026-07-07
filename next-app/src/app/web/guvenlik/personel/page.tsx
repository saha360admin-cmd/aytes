"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableColumn } from "@/components/web/DataTable";

// Aynı pozisyon/durum tanımları mobildeki (mobile)/personel/page.tsx ile
// birebir aynı — mobil ve masaüstü aynı gerçek veriyi/etiketleri kullansın diye.
const GUVENLIK_POSITIONS = [
  { value: "guvenlik-gorevlisi", label: "Güvenlik Görevlisi" },
  { value: "cctv-sorumlusu", label: "CCTV Güvenlik" },
  { value: "sabit-guvenlik", label: "Sabit Güvenlik" },
  { value: "guvenlik-sorumlusu", label: "Güvenlik Sorumlusu" },
];

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Aktif", className: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Pasif", className: "bg-gray-100 text-gray-500" },
  on_leave: { label: "İzinli", className: "bg-amber-100 text-amber-700" },
  archived: { label: "Arşiv", className: "bg-gray-100 text-gray-400" },
};

const STATUS_TABS = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Pasif" },
  { key: "on_leave", label: "İzinli" },
  { key: "archived", label: "Arşiv" },
] as const;
type StatusTabKey = typeof STATUS_TABS[number]["key"];

interface Person {
  id: string;
  full_name: string;
  phone: string | null;
  position: string | null;
  location_id: string | null;
  status: string;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

export default function WebGuvenlikPersonelPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [locationNameById, setLocationNameById] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [statusTab, setStatusTab] = useState<StatusTabKey>("all");
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) throw new Error("dept not found");

      const { data: personnelRows, error: pErr } = await supabase
        .from("personnel")
        .select("id, full_name, phone, position, location_id, status")
        .eq("department_id", dept.id)
        .order("full_name");
      if (pErr) throw pErr;

      const rows = (personnelRows || []) as Person[];
      setPeople(rows);

      const locIds = [...new Set(rows.map(r => r.location_id).filter(Boolean))] as string[];
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from("locations").select("id, name").in("id", locIds);
        const map: Record<string, string> = {};
        for (const l of locs || []) map[l.id] = l.name;
        setLocationNameById(map);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function archivePerson(id: string) {
    setArchiving(id);
    await supabase.from("personnel").update({ status: "archived" }).eq("id", id);
    setPeople(prev => prev.map(p => (p.id === id ? { ...p, status: "archived" } : p)));
    setArchiving(null);
  }

  const usedLocationIds = useMemo(() => [...new Set(people.map(p => p.location_id).filter(Boolean))] as string[], [people]);

  const filtered = people.filter(p => {
    if (statusTab !== "all" && p.status !== statusTab) return false;
    if (locationFilter !== "all" && p.location_id !== locationFilter) return false;
    if (positionFilter !== "all" && p.position !== positionFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !(p.phone || "").includes(q)) return false;
    }
    return true;
  });

  const activeCount = people.filter(p => p.status === "active").length;
  const onLeaveCount = people.filter(p => p.status === "on_leave").length;

  const columns: DataTableColumn[] = [
    { key: "name", label: "Ad Soyad", sortable: true },
    { key: "position", label: "Görev" },
    { key: "location", label: "Çalıştığı Bölge" },
    { key: "phone", label: "Telefon" },
    { key: "statusBadge", label: "Durum" },
    { key: "actions", label: "İşlemler" },
  ];

  const tableData = filtered.map(p => {
    const badge = STATUS_LABEL[p.status] ?? STATUS_LABEL.active;
    const positionLabel = GUVENLIK_POSITIONS.find(pos => pos.value === p.position)?.label ?? p.position ?? "—";
    return {
      name: (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials(p.full_name)}
          </div>
          <span className="font-semibold text-on-surface">{p.full_name}</span>
        </div>
      ),
      position: positionLabel,
      location: p.location_id ? (locationNameById[p.location_id] ?? "—") : "—",
      phone: p.phone || "—",
      statusBadge: (
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badge.className}`}>{badge.label}</span>
      ),
      actions: (
        <div className="flex items-center justify-end gap-1">
          <button title="Düzenle" className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button title="Erişimi Değiştir" className="p-1.5 text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[18px]">key</span>
          </button>
          {p.status !== "archived" && (
            <button
              title="Arşivle"
              onClick={() => archivePerson(p.id)}
              disabled={archiving === p.id}
              className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">archive</span>
            </button>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">Personel Yönetimi</h1>
          <p className="text-on-surface-variant">Güvenlik departmanındaki tüm personeli görüntüleyin ve yönetin.</p>
        </div>
        <div className="relative w-full md:w-80">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Personel ara..."
            className="w-full bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary text-sm outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              statusTab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Bölgeye Göre Filtrele</label>
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Tüm Bölgeler</option>
              {usedLocationIds.map(id => (
                <option key={id} value={id}>{locationNameById[id] ?? id}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Görevi</label>
            <select
              value={positionFilter}
              onChange={e => setPositionFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Tüm Görevler</option>
              {GUVENLIK_POSITIONS.map(pos => (
                <option key={pos.value} value={pos.value}>{pos.label}</option>
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
          <p className="text-sm text-on-surface-variant">Toplam {filtered.length} personel gösteriliyor</p>
        </>
      )}

      {!loading && !error && (
        <div className="fixed bottom-6 right-6 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border border-primary/10 flex items-center gap-4 z-50">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-xs font-semibold text-on-surface-variant">{activeCount} Aktif</span>
          </div>
          <div className="w-px h-4 bg-outline-variant" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-on-surface-variant">{onLeaveCount} İzinli</span>
          </div>
        </div>
      )}
    </div>
  );
}
