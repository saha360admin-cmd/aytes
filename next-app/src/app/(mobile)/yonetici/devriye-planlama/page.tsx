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
  shift_code: string | null;
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

  /* ── Bölge seçici ── */
  const [showLocPicker, setShowLocPicker] = useState(false);

  /* ── Yeni rota formu ── */
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteLocId, setNewRouteLocId] = useState("");
  const [savingRoute, setSavingRoute] = useState(false);

  /* ── Nokta ekleme ── */
  const [addingPointTo, setAddingPointTo] = useState<string | null>(null);
  const [newPointName, setNewPointName]   = useState("");
  const [savingPoint, setSavingPoint]     = useState(false);

  /* ── Plan ekle / düzenle ── */
  const [editingSched, setEditingSched] = useState<{ routeId: string; sched: Schedule | null } | null>(null);
  const [schedDayType, setSchedDayType] = useState<"weekday"|"weekend"|"everyday">("weekday");
  const [schedStart, setSchedStart]     = useState("08:00");
  const [schedInterval, setSchedInterval] = useState(60);
  const [schedEnd, setSchedEnd]         = useState("");
  const [schedShiftCode, setSchedShiftCode] = useState("");
  const [savingSched, setSavingSched]   = useState(false);

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
        schedules:patrol_schedules(id, day_type, start_time, interval_minutes, end_time, is_active, shift_code)
      `).eq("department_id", personnel.department_id).order("created_at", { ascending: false }),
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

  function openSchedForm(routeId: string, sched: Schedule | null) {
    setEditingSched({ routeId, sched });
    if (sched) {
      setSchedDayType(sched.day_type);
      setSchedStart(sched.start_time.slice(0, 5));
      setSchedInterval(sched.interval_minutes);
      setSchedEnd(sched.end_time ? sched.end_time.slice(0, 5) : "");
      setSchedShiftCode(sched.shift_code ?? "");
    } else {
      setSchedDayType("weekday"); setSchedStart("08:00"); setSchedInterval(60); setSchedEnd(""); setSchedShiftCode("");
    }
  }

  async function saveSchedule() {
    if (!editingSched) return;
    const { routeId, sched } = editingSched;
    setSavingSched(true);
    const payload = { day_type: schedDayType, start_time: schedStart, interval_minutes: schedInterval, end_time: schedEnd || null, is_active: true, shift_code: schedShiftCode || null };

    if (sched) {
      const { data, error } = await supabase.from("patrol_schedules").update(payload).eq("id", sched.id).select("id, day_type, start_time, interval_minutes, end_time, is_active, shift_code").single();
      if (!error && data) {
        setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: r.schedules.map(s => s.id === sched.id ? data : s) } : r));
        flash("Plan güncellendi", true);
      } else flash(error?.message ?? "Hata", false);
    } else {
      const { data, error } = await supabase.from("patrol_schedules")
        .insert({ route_id: routeId, ...payload })
        .select("id, day_type, start_time, interval_minutes, end_time, is_active, shift_code").single();
      if (!error && data) {
        setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: [...r.schedules, data] } : r));
        flash("Plan kaydedildi", true);
      } else flash(error?.message ?? "Hata", false);
    }
    setEditingSched(null);
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

  const selectedLocName = selectedLoc === "all" ? "Tüm Bölgeler" : (locations.find(l => l.id === selectedLoc)?.name ?? "Bölge");
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
          <p className="text-white/60 text-xs">{filtered.length} rota · {filtered.filter(r => r.is_active).length} aktif</p>
        </div>
      </header>

      {/* Bölge Seçici Butonu */}
      <div className="px-4 pt-4 pb-2">
        <div role="button" onClick={() => setShowLocPicker(true)}
          className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm active:scale-[0.98] transition-all cursor-pointer select-none">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
            </div>
            <div className="text-left">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bölge Filtresi</p>
              <p className="text-sm font-bold text-gray-800">{selectedLocName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedLoc !== "all" && (
              <button onClick={e => { e.stopPropagation(); setSelectedLoc("all"); }}
                className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-gray-400 text-[14px]">close</span>
              </button>
            )}
            <span className="material-symbols-outlined text-gray-300 text-[22px]">expand_more</span>
          </div>
        </div>
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
                      <button onClick={() => openSchedForm(route.id, null)}
                        className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Plan Ekle
                      </button>
                    </div>

                    {route.schedules.length === 0
                      ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz plan eklenmedi</p>
                      : (
                        <div className="space-y-2">
                          {route.schedules.map(s => (
                            <div key={s.id} role="button" onClick={() => openSchedForm(route.id, s)}
                              className="w-full flex items-center gap-3 bg-indigo-50 rounded-xl px-3 py-3 active:bg-indigo-100 transition-colors cursor-pointer select-none">
                              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-[#3949AB] text-[18px]">schedule</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-700">{DAY_LABEL[s.day_type]}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {s.start_time.slice(0, 5)} başlar · her{" "}
                                  {s.interval_minutes >= 60 ? `${s.interval_minutes / 60} saat` : `${s.interval_minutes} dk`}
                                  {s.end_time ? ` · ${s.end_time.slice(0, 5)}'e kadar` : ""}
                                  {s.shift_code ? ` · Vardiya ${s.shift_code}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10px] font-bold text-[#3949AB] bg-white px-2 py-1 rounded-full">Düzenle</span>
                                <button onClick={e => { e.stopPropagation(); deleteSchedule(route.id, s.id); }}
                                  className="w-7 h-7 rounded-full bg-white flex items-center justify-center active:scale-90 transition-all">
                                  <span className="material-symbols-outlined text-red-400 text-[14px]">delete</span>
                                </button>
                              </div>
                            </div>
                          ))}
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
        <div className="flex justify-end pb-[8.5rem] pr-4">
          <button onClick={() => setShowNewRoute(true)}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Yeni Rota
          </button>
        </div>
      </div>

      {/* ── Bölge Seçici Bottom Sheet ── */}
      {showLocPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLocPicker(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 relative">
              <div className="w-10 h-1 bg-gray-200 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
              <h3 className="text-base font-bold text-gray-800 mt-2">Bölge Seç</h3>
              <button onClick={() => setShowLocPicker(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all mt-2">
                <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
              </button>
            </div>

            <div className="px-4 pb-8 space-y-2 max-h-[60vh] overflow-y-auto">
              {[{ id: "all", name: "Tüm Bölgeler" }, ...locations].map(loc => (
                <button key={loc.id}
                  onClick={() => { setSelectedLoc(loc.id); setShowLocPicker(false); }}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] ${selectedLoc === loc.id ? "text-white" : "bg-gray-50 text-gray-700"}`}
                  style={selectedLoc === loc.id ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedLoc === loc.id ? "bg-white/20" : "bg-white"}`}>
                    <span className={`material-symbols-outlined text-[18px] ${selectedLoc === loc.id ? "text-white" : "text-[#3949AB]"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                      {loc.id === "all" ? "layers" : "location_on"}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-sm">{loc.name}</p>
                    {loc.id !== "all" && (
                      <p className={`text-xs mt-0.5 ${selectedLoc === loc.id ? "text-white/70" : "text-gray-400"}`}>
                        {routes.filter(r => r.location_id === loc.id).length} rota
                      </p>
                    )}
                  </div>
                  {selectedLoc === loc.id && (
                    <span className="material-symbols-outlined text-white text-[20px]">check_circle</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Plan Ekle / Düzenle Bottom Sheet ── */}
      {editingSched && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingSched(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl">
            <div className="px-6 pt-5 pb-4 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">
                  {editingSched.sched ? "Planı Düzenle" : "Yeni Plan Ekle"}
                </h3>
                <button onClick={() => setEditingSched(null)}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
                </button>
              </div>

              {/* Gün tipi */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Hangi Günler</label>
                <div className="flex gap-2">
                  {DAY_TYPES.map(dt => (
                    <button key={dt.id} onClick={() => setSchedDayType(dt.id)}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${schedDayType === dt.id ? "text-white" : "bg-gray-100 text-gray-500"}`}
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
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Bitiş (isteğe bağlı)</label>
                  <input type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)}
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                </div>
              </div>

              {/* Aralık */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Devriye Aralığı</label>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVALS.map(iv => (
                    <button key={iv} onClick={() => setSchedInterval(iv)}
                      className={`h-12 rounded-xl text-sm font-bold transition-all active:scale-95 ${schedInterval === iv ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={schedInterval === iv ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {iv < 60 ? `${iv} dk` : `${iv / 60} saat`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hedef Vardiya */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Hedef Vardiya (isteğe bağlı)</label>
                <div className="grid grid-cols-5 gap-2">
                  {["", "1", "2", "3", "4", "5", "6", "7", "8"].map(v => (
                    <button key={v} onClick={() => setSchedShiftCode(v)}
                      className={`h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${schedShiftCode === v ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={schedShiftCode === v ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {v === "" ? "Hepsi" : v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Özet */}
              <div className="bg-indigo-50 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="material-symbols-outlined text-[#3949AB] text-[20px]">info</span>
                <p className="text-xs text-[#3949AB] font-semibold leading-relaxed">
                  {DAY_LABEL[schedDayType]}, {schedStart} başlar · Her {schedInterval < 60 ? `${schedInterval} dk'da` : `${schedInterval / 60} saatte`} bir devriye
                  {schedEnd ? ` · ${schedEnd}'e kadar` : ""}
                  {schedShiftCode ? ` · Vardiya ${schedShiftCode}` : " · Tüm vardiyalar"}
                </p>
              </div>

              <div className="flex gap-2 pb-6">
                <button onClick={saveSchedule} disabled={savingSched}
                  className="flex-1 h-13 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                  {savingSched
                    ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
                  {savingSched ? "Kaydediliyor..." : (editingSched.sched ? "Güncelle" : "Planı Kaydet")}
                </button>
                <button onClick={() => setEditingSched(null)}
                  className="py-4 px-5 rounded-2xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-all">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Yeni Rota Bottom Sheet ── */}
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
              className="w-full py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
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
