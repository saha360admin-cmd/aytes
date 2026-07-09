"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Location { id: string; name: string }
interface Area { id: string; name: string; requires_photo: boolean; sort_order: number }
interface Program {
  id: string;
  personnel_id: string | null;
  recurrence_type: "daily" | "weekly";
  days_of_week: number[] | null;
  shift_code: string | null;
  active: boolean;
}
interface LocationGroup {
  location: Location;
  areas: Area[];
  programs: Program[];
}
interface PersonnelOption { id: string; full_name: string }

const DEFAULT_AREAS: { name: string; requires_photo: boolean }[] = [
  { name: "Giriş & Lobi", requires_photo: false },
  { name: "Koridorlar", requires_photo: false },
  { name: "Tuvaletler", requires_photo: true },
  { name: "Mutfak / Yemekhane", requires_photo: true },
  { name: "Toplantı Odaları", requires_photo: false },
];

const DAYS = [
  { id: 1, label: "Pzt" }, { id: 2, label: "Sal" }, { id: 3, label: "Çar" },
  { id: 4, label: "Per" }, { id: 5, label: "Cum" }, { id: 6, label: "Cmt" }, { id: 0, label: "Paz" },
];

export default function TemizlikProgramPage() {
  const router = useRouter();
  const { personnel } = useAuth();

  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const [personnelOptions, setPersonnelOptions] = useState<PersonnelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [addingAreaTo, setAddingAreaTo] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaPhoto, setNewAreaPhoto] = useState(false);
  const [savingArea, setSavingArea] = useState(false);

  const [editingProgram, setEditingProgram] = useState<{ locationId: string; program: Program | null } | null>(null);
  const [progRecurrence, setProgRecurrence] = useState<"daily" | "weekly">("daily");
  const [progDays, setProgDays] = useState<number[]>([]);
  const [progPersonnel, setProgPersonnel] = useState("");
  const [progShiftCode, setProgShiftCode] = useState("");
  const [savingProgram, setSavingProgram] = useState(false);

  const loadData = useCallback(async () => {
    if (!personnel) return;
    const [locRes, areaRes, progRes, persRes] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("cleaning_areas").select("id, location_id, name, requires_photo, sort_order").order("sort_order"),
      supabase.from("cleaning_programs").select("id, location_id, personnel_id, recurrence_type, days_of_week, shift_code, active").eq("department_id", personnel.department_id),
      supabase.from("personnel").select("id, full_name").eq("department_id", personnel.department_id).neq("status", "archived").order("full_name"),
    ]);

    const locations = (locRes.data || []) as Location[];
    const areas = (areaRes.data || []) as (Area & { location_id: string })[];
    const programs = (progRes.data || []) as (Program & { location_id: string })[];

    setGroups(locations.map(loc => ({
      location: loc,
      areas: areas.filter(a => a.location_id === loc.id),
      programs: programs.filter(p => p.location_id === loc.id),
    })));
    setPersonnelOptions((persRes.data || []) as PersonnelOption[]);
    setLoading(false);
  }, [personnel]);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadData();
  }, [personnel, router, loadData]);

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  async function seedDefaultAreas(locationId: string) {
    const inserts = DEFAULT_AREAS.map((a, i) => ({ location_id: locationId, name: a.name, requires_photo: a.requires_photo, sort_order: i + 1 }));
    const { data, error } = await supabase.from("cleaning_areas").insert(inserts).select("id, location_id, name, requires_photo, sort_order");
    if (!error && data) {
      setGroups(p => p.map(g => g.location.id === locationId ? { ...g, areas: [...g.areas, ...data] } : g));
      flash("Varsayılan alanlar eklendi", true);
    } else flash(error?.message ?? "Hata", false);
  }

  async function addArea(locationId: string) {
    if (!newAreaName.trim()) return;
    setSavingArea(true);
    const group = groups.find(g => g.location.id === locationId);
    const { data, error } = await supabase.from("cleaning_areas")
      .insert({ location_id: locationId, name: newAreaName.trim(), requires_photo: newAreaPhoto, sort_order: (group?.areas.length ?? 0) + 1 })
      .select("id, location_id, name, requires_photo, sort_order").single();
    if (!error && data) {
      setGroups(p => p.map(g => g.location.id === locationId ? { ...g, areas: [...g.areas, data] } : g));
      setNewAreaName(""); setNewAreaPhoto(false); setAddingAreaTo(null);
      flash("Alan eklendi", true);
    } else flash(error?.message ?? "Hata", false);
    setSavingArea(false);
  }

  async function deleteArea(locationId: string, areaId: string) {
    await supabase.from("cleaning_areas").delete().eq("id", areaId);
    setGroups(p => p.map(g => g.location.id === locationId ? { ...g, areas: g.areas.filter(a => a.id !== areaId) } : g));
  }

  function openProgramForm(locationId: string, program: Program | null) {
    setEditingProgram({ locationId, program });
    if (program) {
      setProgRecurrence(program.recurrence_type);
      setProgDays(program.days_of_week || []);
      setProgPersonnel(program.personnel_id || "");
      setProgShiftCode(program.shift_code || "");
    } else {
      setProgRecurrence("daily"); setProgDays([]); setProgPersonnel(""); setProgShiftCode("");
    }
  }

  async function saveProgram() {
    if (!editingProgram || !personnel) return;
    const { locationId, program } = editingProgram;
    setSavingProgram(true);
    const payload = {
      recurrence_type: progRecurrence,
      days_of_week: progRecurrence === "weekly" ? progDays : null,
      personnel_id: progPersonnel || null,
      shift_code: progShiftCode || null,
      active: true,
    };

    if (program) {
      const { data, error } = await supabase.from("cleaning_programs").update(payload).eq("id", program.id)
        .select("id, location_id, personnel_id, recurrence_type, days_of_week, shift_code, active").single();
      if (!error && data) {
        setGroups(p => p.map(g => g.location.id === locationId ? { ...g, programs: g.programs.map(pr => pr.id === program.id ? data : pr) } : g));
        flash("Program güncellendi", true);
      } else flash(error?.message ?? "Hata", false);
    } else {
      const { data, error } = await supabase.from("cleaning_programs")
        .insert({ department_id: personnel.department_id, location_id: locationId, ...payload })
        .select("id, location_id, personnel_id, recurrence_type, days_of_week, shift_code, active").single();
      if (!error && data) {
        setGroups(p => p.map(g => g.location.id === locationId ? { ...g, programs: [...g.programs, data] } : g));
        flash("Program oluşturuldu", true);
      } else flash(error?.message ?? "Hata", false);
    }
    setEditingProgram(null);
    setSavingProgram(false);
  }

  async function deleteProgram(locationId: string, programId: string) {
    await supabase.from("cleaning_programs").delete().eq("id", programId);
    setGroups(p => p.map(g => g.location.id === locationId ? { ...g, programs: g.programs.filter(pr => pr.id !== programId) } : g));
  }

  async function toggleProgram(locationId: string, programId: string, current: boolean) {
    await supabase.from("cleaning_programs").update({ active: !current }).eq("id", programId);
    setGroups(p => p.map(g => g.location.id === locationId ? { ...g, programs: g.programs.map(pr => pr.id === programId ? { ...pr, active: !current } : pr) } : g));
  }

  function toggleDay(d: number) {
    setProgDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
      <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
    </div>
  );

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">Temizlik Programı</h1>
          <p className="text-white/60 text-xs">{groups.length} lokasyon</p>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-3">
        {groups.map(g => {
          const isOpen = expandedId === g.location.id;
          return (
            <div key={g.location.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button onClick={() => setExpandedId(isOpen ? null : g.location.id)}
                className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#3949AB] text-[22px]">location_on</span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-gray-800 text-sm truncate">{g.location.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{g.areas.length} alan · {g.programs.length} program</p>
                </div>
                <span className={`material-symbols-outlined text-gray-300 text-[22px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">
                  {/* ── ALANLAR ── */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Alanlar</p>
                      <div className="flex gap-2">
                        {g.areas.length === 0 && (
                          <button onClick={() => seedDefaultAreas(g.location.id)}
                            className="h-8 px-3 rounded-full bg-teal-50 text-teal-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                            <span className="material-symbols-outlined text-[14px]">playlist_add</span>
                            Varsayılanları Ekle
                          </button>
                        )}
                        <button onClick={() => { setAddingAreaTo(g.location.id); setNewAreaName(""); setNewAreaPhoto(false); }}
                          className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Alan Ekle
                        </button>
                      </div>
                    </div>

                    {g.areas.length === 0
                      ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz alan tanımlanmadı</p>
                      : (
                        <div className="space-y-2">
                          {g.areas.map(a => (
                            <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3">
                              <div className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-gray-700 truncate">{a.name}</span>
                                {a.requires_photo && (
                                  <span className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                    <span className="material-symbols-outlined text-[12px]">photo_camera</span>
                                    Fotoğraf zorunlu
                                  </span>
                                )}
                              </div>
                              <button onClick={() => deleteArea(g.location.id, a.id)}
                                className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center active:scale-90 transition-all flex-shrink-0">
                                <span className="material-symbols-outlined text-red-400 text-[16px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                    {addingAreaTo === g.location.id && (
                      <div className="mt-3 space-y-2">
                        <input autoFocus value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                          placeholder="Alan adı (örn: Diğer Alanlar)"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
                        <label className="flex items-center gap-2 text-sm text-gray-600 px-1">
                          <input type="checkbox" checked={newAreaPhoto} onChange={e => setNewAreaPhoto(e.target.checked)} />
                          Fotoğraf zorunlu
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => addArea(g.location.id)} disabled={savingArea || !newAreaName.trim()}
                            className="flex-1 px-4 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all"
                            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                            {savingArea ? "..." : "Ekle"}
                          </button>
                          <button onClick={() => setAddingAreaTo(null)}
                            className="px-4 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold flex-shrink-0">
                            İptal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── PROGRAMLAR ── */}
                  <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Programlar</p>
                      <button onClick={() => openProgramForm(g.location.id, null)}
                        className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Program Ekle
                      </button>
                    </div>

                    {g.programs.length === 0
                      ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz program eklenmedi</p>
                      : (
                        <div className="space-y-2">
                          {g.programs.map(p => {
                            const person = personnelOptions.find(po => po.id === p.personnel_id);
                            return (
                              <div key={p.id} role="button" onClick={() => openProgramForm(g.location.id, p)}
                                className="w-full flex items-center gap-3 bg-indigo-50 rounded-xl px-3 py-3 active:bg-indigo-100 transition-colors cursor-pointer select-none">
                                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                                  <span className="material-symbols-outlined text-[#3949AB] text-[18px]">event_repeat</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-700">
                                    {p.recurrence_type === "daily" ? "Her Gün" : `Haftalık (${(p.days_of_week || []).length} gün)`}
                                    {!p.active && <span className="ml-1.5 text-gray-400">· Pasif</span>}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {person?.full_name ?? "Personel atanmadı"}
                                    {p.shift_code ? ` · Vardiya ${p.shift_code}` : " · Tüm vardiyalar"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button onClick={e => { e.stopPropagation(); toggleProgram(g.location.id, p.id, p.active); }}
                                    className="w-7 h-7 rounded-full bg-white flex items-center justify-center active:scale-90 transition-all">
                                    <span className="material-symbols-outlined text-gray-500 text-[14px]">{p.active ? "pause" : "play_arrow"}</span>
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); deleteProgram(g.location.id, p.id); }}
                                    className="w-7 h-7 rounded-full bg-white flex items-center justify-center active:scale-90 transition-all">
                                    <span className="material-symbols-outlined text-red-400 text-[14px]">delete</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* ── Program Ekle / Düzenle Bottom Sheet ── */}
      {editingProgram && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingProgram(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl">
            <div className="px-6 pt-5 pb-4 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">{editingProgram.program ? "Programı Düzenle" : "Yeni Program"}</h3>
                <button onClick={() => setEditingProgram(null)}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Tekrar</label>
                <div className="flex gap-2">
                  {(["daily", "weekly"] as const).map(r => (
                    <button key={r} onClick={() => setProgRecurrence(r)}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${progRecurrence === r ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={progRecurrence === r ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {r === "daily" ? "Her Gün" : "Haftalık"}
                    </button>
                  ))}
                </div>
              </div>

              {progRecurrence === "weekly" && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Günler</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS.map(d => (
                      <button key={d.id} onClick={() => toggleDay(d.id)}
                        className={`h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${progDays.includes(d.id) ? "text-white" : "bg-gray-100 text-gray-500"}`}
                        style={progDays.includes(d.id) ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Personel</label>
                <select value={progPersonnel} onChange={e => setProgPersonnel(e.target.value)}
                  className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none appearance-none">
                  <option value="">— Personel seçin —</option>
                  {personnelOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Hedef Vardiya (isteğe bağlı)</label>
                <div className="grid grid-cols-5 gap-2">
                  {["", "1", "2", "3", "4", "5", "6", "7", "8"].map(v => (
                    <button key={v} onClick={() => setProgShiftCode(v)}
                      className={`h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${progShiftCode === v ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={progShiftCode === v ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {v === "" ? "Hepsi" : v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pb-6">
                <button onClick={saveProgram} disabled={savingProgram}
                  className="flex-1 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                  {savingProgram
                    ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
                  {savingProgram ? "Kaydediliyor..." : (editingProgram.program ? "Güncelle" : "Programı Kaydet")}
                </button>
                <button onClick={() => setEditingProgram(null)}
                  className="py-4 px-5 rounded-2xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-all">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
