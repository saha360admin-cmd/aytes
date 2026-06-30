"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Location { id: string; name: string }
interface RoutePoint { id: string; name: string; point_order: number }
interface Schedule {
  id: string;
  day_type: "weekday" | "weekend" | "everyday";
  start_time: string;
  interval_minutes: number;
  end_time: string | null;
  is_active: boolean;
}
interface PatrolRoute {
  id: string; name: string; location_id: string | null;
  is_active: boolean; points: RoutePoint[]; schedules: Schedule[];
}

const DAY_TYPES = [
  { id: "weekday",  label: "Hafta İçi" },
  { id: "weekend",  label: "Hafta Sonu" },
  { id: "everyday", label: "Her Gün" },
] as const;

const INTERVALS = [30, 60, 90, 120, 180, 240];
const DAY_LABEL: Record<string, string> = { weekday: "Hafta İçi", weekend: "Hafta Sonu", everyday: "Her Gün" };

export default function DevriyePlanlama() {
  const router = useRouter();
  const { personnel } = useAuth();

  const [locations, setLocations]   = useState<Location[]>([]);
  const [routes, setRoutes]         = useState<PatrolRoute[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedLoc, setSelectedLoc] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ── Yeni rota formu ── */
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteLocId, setNewRouteLocId] = useState("");
  const [savingRoute, setSavingRoute] = useState(false);

  /* ── Nokta ekleme ── */
  const [addingPointTo, setAddingPointTo] = useState<string | null>(null);
  const [newPointName, setNewPointName]   = useState("");
  const [savingPoint, setSavingPoint]     = useState(false);

  /* ── Plan ekleme ── */
  const [addingSchedTo, setAddingSchedTo]   = useState<string | null>(null);
  const [schedDayType, setSchedDayType]     = useState<"weekday"|"weekend"|"everyday">("weekday");
  const [schedStart, setSchedStart]         = useState("08:00");
  const [schedInterval, setSchedInterval]   = useState(60);
  const [schedEnd, setSchedEnd]             = useState("");
  const [savingSched, setSavingSched]       = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadData();
  }, [personnel]);

  async function loadData() {
    const [locRes, routeRes] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("patrol_routes").select(`
        id, name, location_id, is_active,
        points:patrol_route_points(id, name, point_order),
        schedules:patrol_schedules(id, day_type, start_time, interval_minutes, end_time, is_active)
      `).order("created_at", { ascending: false }),
    ]);
    setLocations(locRes.data || []);
    setRoutes((routeRes.data || []).map((r: any) => ({
      ...r,
      points: [...(r.points || [])].sort((a: RoutePoint, b: RoutePoint) => a.point_order - b.point_order),
      schedules: r.schedules || [],
    })));
    setLoading(false);
  }

  async function createRoute() {
    if (!newRouteName.trim() || !personnel) return;
    setSavingRoute(true);
    const { data, error } = await supabase.from("patrol_routes")
      .insert({ name: newRouteName.trim(), location_id: newRouteLocId || null, department_id: personnel.department_id, created_by: personnel.id })
      .select("id, name, location_id, is_active").single();
    if (!error && data) {
      const nr: PatrolRoute = { ...data, points: [], schedules: [] };
      setRoutes(p => [nr, ...p]);
      setExpandedId(nr.id);
      setShowNewRoute(false); setNewRouteName(""); setNewRouteLocId("");
      flash("Rota oluşturuldu", true);
    } else flash(error?.message ?? "Hata", false);
    setSavingRoute(false);
  }

  async function addPoint(routeId: string) {
    if (!newPointName.trim()) return;
    setSavingPoint(true);
    const route = routes.find(r => r.id === routeId);
    const { data, error } = await supabase.from("patrol_route_points")
      .insert({ route_id: routeId, name: newPointName.trim(), point_order: (route?.points.length ?? 0) + 1 })
      .select("id, name, point_order").single();
    if (!error && data) {
      setRoutes(p => p.map(r => r.id === routeId ? { ...r, points: [...r.points, data] } : r));
      setNewPointName(""); setAddingPointTo(null);
      flash("Nokta eklendi", true);
    }
    setSavingPoint(false);
  }

  async function deletePoint(routeId: string, pointId: string) {
    await supabase.from("patrol_route_points").delete().eq("id", pointId);
    setRoutes(p => p.map(r => r.id === routeId
      ? { ...r, points: r.points.filter(pt => pt.id !== pointId).map((pt, i) => ({ ...pt, point_order: i + 1 })) }
      : r));
  }

  async function addSchedule(routeId: string) {
    setSavingSched(true);
    const { data, error } = await supabase.from("patrol_schedules")
      .insert({ route_id: routeId, day_type: schedDayType, start_time: schedStart, interval_minutes: schedInterval, end_time: schedEnd || null, is_active: true })
      .select("id, day_type, start_time, interval_minutes, end_time, is_active").single();
    if (!error && data) {
      setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: [...r.schedules, data] } : r));
      setAddingSchedTo(null);
      setSchedDayType("weekday"); setSchedStart("08:00"); setSchedInterval(60); setSchedEnd("");
      flash("Plan kaydedildi", true);
    } else flash(error?.message ?? "Hata", false);
    setSavingSched(false);
  }

  async function deleteSchedule(routeId: string, schedId: string) {
    await supabase.from("patrol_schedules").delete().eq("id", schedId);
    setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: r.schedules.filter(s => s.id !== schedId) } : r));
  }

  async function toggleRoute(routeId: string, current: boolean) {
    await supabase.from("patrol_routes").update({ is_active: !current }).eq("id", routeId);
    setRoutes(p => p.map(r => r.id === routeId ? { ...r, is_active: !current } : r));
  }

  async function deleteRoute(routeId: string) {
    await supabase.from("patrol_routes").delete().eq("id", routeId);
    setRoutes(p => p.filter(r => r.id !== routeId));
    if (expandedId === routeId) setExpandedId(null);
    flash("Rota silindi", true);
  }

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  const filtered = selectedLoc === "all" ? routes : routes.filter(r => r.location_id === selectedLoc);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
      <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
    </div>
  );

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">Devriye Planlaması</h1>
          <p className="text-white/60 text-xs">Bölge bazlı rota ve zaman yönetimi</p>
        </div>
      </header>

      {/* Bölge Filtre */}
      <div className="flex gap-2 px-4 pt-4 pb-2 overflow-x-auto no-scrollbar">
        {[{ id: "all", name: "Tümü" }, ...locations].map(loc => (
          <button key={loc.id} onClick={() => setSelectedLoc(loc.id)}
            className={`flex-shrink-0 h-9 px-4 rounded-full text-xs font-bold transition-all active:scale-95 ${selectedLoc === loc.id ? "text-white shadow-md" : "bg-white text-gray-500 border border-gray-200"}`}
            style={selectedLoc === loc.id ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
            {loc.name}
          </button>
        ))}
      </div>

      {/* Rota Kartları */}
      <main className="px-4 pt-2 space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 shadow-sm mt-2">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[#3949AB] text-[36px]">route</span>
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-700">Henüz rota oluşturulmadı</p>
              <p className="text-xs text-gray-400 mt-1">Aşağıdaki butona basarak başlayın</p>
            </div>
          </div>
        ) : filtered.map(route => {
          const isOpen = expandedId === route.id;
          const loc = locations.find(l => l.id === route.location_id);
          return (
            <div key={route.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">

              {/* Kart Başlığı */}
              <button onClick={() => setExpandedId(isOpen ? null : route.id)}
                className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${route.is_active ? "bg-teal-100" : "bg-gray-100"}`}>
                  <span className={`material-symbols-outlined text-[22px] ${route.is_active ? "text-teal-600" : "text-gray-400"}`} style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-gray-800 text-sm truncate">{route.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {loc?.name ?? "Bölge yok"} · {route.points.length} nokta · {route.schedules.length} plan
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${route.is_active ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                    {route.is_active ? "Aktif" : "Pasif"}
                  </span>
                  <span className={`material-symbols-outlined text-gray-300 text-[22px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">

                  {/* ── KONTROL NOKTALARI ── */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Kontrol Noktaları</p>
                      <button onClick={() => { setAddingPointTo(route.id); setNewPointName(""); }}
                        className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Nokta Ekle
                      </button>
                    </div>

                    {route.points.length === 0
                      ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz nokta eklenmedi</p>
                      : (
                        <div className="space-y-2">
                          {route.points.map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3">
                              <div className="w-7 h-7 rounded-full bg-[#3949AB]/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-[11px] font-bold text-[#3949AB]">{pt.point_order}</span>
                              </div>
                              <span className="flex-1 text-sm font-semibold text-gray-700">{pt.name}</span>
                              <button onClick={() => deletePoint(route.id, pt.id)}
                                className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center active:scale-90 transition-all">
                                <span className="material-symbols-outlined text-red-400 text-[16px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                    {addingPointTo === route.id && (
                      <div className="mt-3 flex gap-2">
                        <input autoFocus value={newPointName}
                          onChange={e => setNewPointName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addPoint(route.id)}
                          placeholder="Nokta adı (örn: Ana Giriş)"
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
                        <button onClick={() => addPoint(route.id)} disabled={savingPoint || !newPointName.trim()}
                          className="px-4 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                          {savingPoint ? "..." : "Ekle"}
                        </button>
                        <button onClick={() => setAddingPointTo(null)}
                          className="px-3 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold flex-shrink-0">
                          İptal
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── ZAMAN PLANLARI ── */}
                  <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Zaman Planları</p>
                      <button onClick={() => {
                        setAddingSchedTo(route.id);
                        setSchedDayType("weekday"); setSchedStart("08:00"); setSchedInterval(60); setSchedEnd("");
                      }} className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Plan Ekle
                      </button>
                    </div>

                    {route.schedules.length === 0
                      ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz plan eklenmedi</p>
                      : (
                        <div className="space-y-2">
                          {route.schedules.map(s => (
                            <div key={s.id} className="flex items-center gap-3 bg-indigo-50 rounded-xl px-3 py-3">
                              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-[#3949AB] text-[18px]">schedule</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-700">{DAY_LABEL[s.day_type]}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {s.start_time.slice(0, 5)} başlar · her{" "}
                                  {s.interval_minutes >= 60 ? `${s.interval_minutes / 60} saat` : `${s.interval_minutes} dk`}
                                  {s.end_time ? ` · ${s.end_time.slice(0, 5)}'e kadar` : ""}
                                </p>
                              </div>
                              <button onClick={() => deleteSchedule(route.id, s.id)}
                                className="w-8 h-8 rounded-full bg-white flex items-center justify-center active:scale-90 transition-all flex-shrink-0">
                                <span className="material-symbols-outlined text-red-400 text-[16px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                    {addingSchedTo === route.id && (
                      <div className="mt-3 bg-gray-50 rounded-2xl p-4 space-y-4">

                        {/* Gün tipi */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Hangi Günler</label>
                          <div className="flex gap-2">
                            {DAY_TYPES.map(dt => (
                              <button key={dt.id} onClick={() => setSchedDayType(dt.id)}
                                className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all active:scale-95 ${schedDayType === dt.id ? "text-white" : "bg-white border border-gray-200 text-gray-500"}`}
                                style={schedDayType === dt.id ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                                {dt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Saatler */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Başlangıç</label>
                            <input type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)}
                              className="w-full h-11 bg-white border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Bitiş (isteğe bağlı)</label>
                            <input type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)}
                              className="w-full h-11 bg-white border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                          </div>
                        </div>

                        {/* Aralık */}
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Devriye Aralığı</label>
                          <div className="grid grid-cols-3 gap-2">
                            {INTERVALS.map(iv => (
                              <button key={iv} onClick={() => setSchedInterval(iv)}
                                className={`h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${schedInterval === iv ? "text-white" : "bg-white border border-gray-200 text-gray-500"}`}
                                style={schedInterval === iv ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                                {iv < 60 ? `${iv} dk` : `${iv / 60} saat`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => addSchedule(route.id)} disabled={savingSched}
                            className="flex-1 h-12 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all"
                            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                            {savingSched ? "Kaydediliyor..." : "Planı Kaydet"}
                          </button>
                          <button onClick={() => setAddingSchedTo(null)}
                            className="h-12 px-5 rounded-xl bg-gray-200 text-gray-600 text-sm font-bold active:scale-95 transition-all">
                            İptal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Rota Aksiyonları */}
                  <div className="flex gap-2 px-4 pb-4">
                    <button onClick={() => toggleRoute(route.id, route.is_active)}
                      className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${route.is_active ? "bg-gray-100 text-gray-600" : "bg-teal-100 text-teal-700"}`}>
                      {route.is_active ? "Pasife Al" : "Aktife Al"}
                    </button>
                    <button onClick={() => deleteRoute(route.id)}
                      className="flex-1 h-11 rounded-xl bg-red-50 text-red-600 text-sm font-bold active:scale-95 transition-all">
                      Rotayı Sil
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* FAB — Yeni Rota */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
        <div className="flex justify-end pb-[6.5rem] pr-4">
          <button onClick={() => setShowNewRoute(true)}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Yeni Rota
          </button>
        </div>
      </div>

      {/* Yeni Rota Bottom Sheet */}
      {showNewRoute && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewRoute(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Yeni Rota Oluştur</h3>
              <button onClick={() => setShowNewRoute(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rota Adı</label>
              <input autoFocus value={newRouteName} onChange={e => setNewRouteName(e.target.value)}
                placeholder="Örn: Ataşehir A Bölgesi Devriyesi"
                className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Bölge</label>
              <div className="relative">
                <select value={newRouteLocId} onChange={e => setNewRouteLocId(e.target.value)}
                  className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none appearance-none">
                  <option value="">— Bölge seçin —</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] pointer-events-none">expand_more</span>
              </div>
            </div>

            <button onClick={createRoute} disabled={savingRoute || !newRouteName.trim()}
              className="w-full h-13 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              {savingRoute
                ? <span className="material-symbols-outlined animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>}
              {savingRoute ? "Oluşturuluyor..." : "Rotayı Oluştur"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
