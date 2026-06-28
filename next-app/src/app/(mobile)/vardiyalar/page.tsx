"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Location {
  id: string;
  name: string;
  description: string | null;
}

interface PersonnelItem {
  id: string;
  full_name: string;
  position: string | null;
  avatar_url: string | null;
  phone: string | null;
  location_id: string | null;
}

interface ShiftType {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface RowState {
  shift_id: string | null;
  notes: string;
  saved: boolean;
  dirty: boolean;
}

interface ClipShift {
  shift_id: string | null;
  notes: string;
}

const DAYS_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function getInitials(n: string) {
  return n.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function getShiftIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("gece")) return "nights_stay";
  if (n.includes("sabah") || n.includes("gündüz")) return "light_mode";
  if (n.includes("akşam") || n.includes("öğleden")) return "wb_twilight";
  return "schedule";
}
const GRADIENTS = [
  "linear-gradient(135deg,#1A237E,#3949AB)",
  "linear-gradient(135deg,#00695C,#00897B)",
  "linear-gradient(135deg,#6A1B9A,#8E24AA)",
  "linear-gradient(135deg,#E65100,#F57C00)",
];

export default function VardiyalarPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const isManager = personnel?.role === "admin" || personnel?.role === "supervisor";

  /* ─── MANAGER STATE ─── */
  const [locations, setLocations] = useState<Location[]>([]);
  const [selLoc, setSelLoc] = useState<Location | null>(null);
  const [locPersonnel, setLocPersonnel] = useState<PersonnelItem[]>([]);
  const [shifts, setShifts] = useState<ShiftType[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loadingMgr, setLoadingMgr] = useState(true);
  const [loadingPers, setLoadingPers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clip, setClip] = useState<ClipShift | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selDate, setSelDate] = useState(new Date());

  /* ─── PERSONNEL STATE ─── */
  const [myShift, setMyShift] = useState<ShiftType | null>(null);
  const [myNote, setMyNote] = useState<string>("");
  const [myShifts, setMyShifts] = useState<ShiftType[]>([]);
  const [team, setTeam] = useState<PersonnelItem[]>([]);
  const [loadingMe, setLoadingMe] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    if (isManager) loadMgr();
    else loadMe();
  }, [personnel]);

  /* ─── MANAGER LOAD ─── */
  async function loadMgr() {
    if (!personnel) return;
    const [locRes, shiftRes] = await Promise.all([
      supabase.from("locations").select("id,name,description").eq("department_id", personnel.department_id).order("name"),
      supabase.from("shifts").select("*").eq("department_id", personnel.department_id).order("start_time"),
    ]);
    setLocations((locRes.data || []) as Location[]);
    setShifts((shiftRes.data || []) as ShiftType[]);
    setLoadingMgr(false);
  }

  async function pickLocation(loc: Location) {
    setSelLoc(loc);
    setLoadingPers(true);
    setRows({});
    setClip(null);
    await fetchLocRows(loc, selDate);
    setLoadingPers(false);
  }

  async function fetchLocRows(loc: Location, date: Date) {
    const dateStr = fmtDate(date);
    const [persRes, assignRes] = await Promise.all([
      supabase.from("personnel")
        .select("id,full_name,position,avatar_url,phone,location_id")
        .eq("location_id", loc.id).eq("status", "active").order("full_name"),
      supabase.from("shift_assignments")
        .select("*").eq("location_id", loc.id).eq("date", dateStr),
    ]);
    const persData = (persRes.data || []) as PersonnelItem[];
    setLocPersonnel(persData);
    const map: Record<string, RowState> = {};
    persData.forEach((p) => {
      const ex = ((assignRes.data || []) as any[]).find((a) => a.personnel_id === p.id);
      map[p.id] = { shift_id: ex?.shift_id || null, notes: ex?.notes || "", saved: !!ex, dirty: false };
    });
    setRows(map);
  }

  async function changeDate(delta: number) {
    const d = new Date(selDate);
    d.setDate(d.getDate() + delta);
    setSelDate(d);
    if (selLoc) {
      setLoadingPers(true);
      await fetchLocRows(selLoc, d);
      setLoadingPers(false);
    }
  }

  function setRow(pid: string, field: "shift_id" | "notes", val: string | null) {
    setRows((prev) => ({ ...prev, [pid]: { ...prev[pid], [field]: val, dirty: true } }));
  }

  function doCopy(pid: string) {
    const r = rows[pid];
    if (r) setClip({ shift_id: r.shift_id, notes: r.notes });
  }

  function doPaste(pid: string) {
    if (!clip) return;
    setRows((prev) => ({ ...prev, [pid]: { ...prev[pid], shift_id: clip.shift_id, notes: clip.notes, dirty: true } }));
  }

  async function saveAll() {
    if (!selLoc || !personnel) return;
    setSaving(true);
    const dateStr = fmtDate(selDate);
    const dirty = Object.entries(rows).filter(([, r]) => r.dirty);

    for (const [pid, r] of dirty) {
      if (!r.shift_id) {
        if (r.saved) await supabase.from("shift_assignments").delete().eq("personnel_id", pid).eq("date", dateStr);
      } else {
        await supabase.from("shift_assignments").upsert(
          { personnel_id: pid, location_id: selLoc.id, shift_id: r.shift_id, date: dateStr, notes: r.notes || null, created_by: personnel.id, updated_at: new Date().toISOString() },
          { onConflict: "personnel_id,date" }
        );
      }
    }

    setRows((prev) => {
      const next = { ...prev };
      dirty.forEach(([pid, r]) => { next[pid] = { ...r, saved: !!r.shift_id, dirty: false }; });
      return next;
    });
    setSaving(false);
    showToast(`${dirty.length} vardiya kaydedildi`);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  /* ─── PERSONNEL LOAD ─── */
  async function loadMe() {
    if (!personnel) return;
    const dateStr = fmtDate(new Date());
    const locId = (personnel as any).location_id;
    const [assignRes, shiftRes, teamRes] = await Promise.all([
      supabase.from("shift_assignments").select("*,shift:shift_id(*)").eq("personnel_id", personnel.id).eq("date", dateStr).maybeSingle(),
      supabase.from("shifts").select("*").eq("department_id", personnel.department_id).order("start_time"),
      locId
        ? supabase.from("personnel").select("id,full_name,position,avatar_url,phone,location_id").eq("location_id", locId).eq("status", "active").neq("id", personnel.id).order("full_name")
        : Promise.resolve({ data: [] }),
    ]);
    const s = (assignRes.data as any)?.shift as ShiftType | null;
    setMyShift(s || null);
    setMyNote((assignRes.data as any)?.notes || "");
    setMyShifts((shiftRes.data || []) as ShiftType[]);
    setTeam(((teamRes as any).data || []) as PersonnelItem[]);
    setLoadingMe(false);
  }

  /* ─── DATE LABELS ─── */
  const now = new Date();
  const dateLabel = `${selDate.getDate()} ${MONTHS_TR[selDate.getMonth()]} ${selDate.getFullYear()}`;
  const dayLabel = DAYS_TR[selDate.getDay()];
  const isToday = fmtDate(selDate) === fmtDate(now);
  const dirtyCount = Object.values(rows).filter((r) => r.dirty).length;

  /* ═══════════════════════════════════════
     PERSONEL GÖRÜNÜMÜ
  ════════════════════════════════════════ */
  if (!isManager) {
    return (
      <div className="bg-[#f0f2ff] min-h-screen pb-28">
        <header className="sticky top-0 z-50 w-full h-16 flex items-center gap-3 px-4"
          style={{ background: "linear-gradient(135deg,#1A237E 0%,#3949AB 100%)" }}>
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center active:scale-90 transition-all">
            <span className="material-symbols-outlined text-white text-[20px]">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-white">Vardiyam</h1>
        </header>

        <div className="px-4 pb-5 pt-3" style={{ background: "linear-gradient(135deg,#1A237E 0%,#3949AB 100%)" }}>
          {loadingMe ? (
            <div className="bg-white/10 rounded-2xl p-4 text-center"><span className="material-symbols-outlined animate-spin text-white">progress_activity</span></div>
          ) : myShift ? (
            <div className="bg-white/15 rounded-2xl p-4 border border-white/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-emerald-300">BUGÜNKÜ VARDİYA</span>
              </div>
              <p className="text-white font-bold text-xl">{myShift.name}</p>
              <p className="text-white/75 text-sm mt-0.5">{myShift.start_time.slice(0, 5)} – {myShift.end_time.slice(0, 5)}</p>
              {myNote && <p className="text-white/60 text-xs mt-2 bg-white/10 rounded-xl px-3 py-1.5">{myNote}</p>}
            </div>
          ) : (
            <div className="bg-white/10 rounded-2xl p-4 text-center border border-white/20">
              <p className="text-white/60 text-sm">Bugün için vardiya atanmamış</p>
            </div>
          )}
        </div>
        <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

        <main className="px-4 space-y-5">
          {myShifts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Vardiya Tipleri</h3>
              {myShifts.map((s, i) => {
                const [sh, sm] = s.start_time.split(":").map(Number);
                const [eh, em] = s.end_time.split(":").map(Number);
                let dur = (eh * 60 + em) - (sh * 60 + sm);
                if (dur < 0) dur += 24 * 60;
                const isMy = myShift?.id === s.id;
                return (
                  <div key={s.id} className={`bg-white rounded-2xl shadow-sm border-l-4 p-4 ${isMy ? "border-l-emerald-500 ring-2 ring-emerald-100" : "border-l-[#3949AB]"}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENTS[i % 4] }}>
                        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{getShiftIcon(s.name)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} ({Math.floor(dur / 60)} saat)</p>
                      </div>
                      {isMy && <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Benim</span>}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {team.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Lokasyondaki Ekip</h3>
                <span className="text-xs font-bold text-[#3949AB]">{team.length} kişi</span>
              </div>
              {team.map((m) => (
                <div key={m.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#E8EAF6] flex items-center justify-center overflow-hidden">
                    {m.avatar_url ? <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" /> : <span className="text-[#3949AB] font-bold text-sm">{getInitials(m.full_name)}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{m.full_name}</p>
                    {m.position && <p className="text-xs text-gray-400 truncate">{m.position}</p>}
                  </div>
                  {m.phone
                    ? <a href={`tel:${m.phone}`} className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center"><span className="material-symbols-outlined text-[#3949AB] text-[18px]">call</span></a>
                    : <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><span className="material-symbols-outlined text-gray-300 text-[18px]">call</span></div>}
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
    );
  }

  /* ═══════════════════════════════════════
     YÖNETİCİ GÖRÜNÜMÜ
  ════════════════════════════════════════ */
  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white bg-emerald-600">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 w-full h-16 flex items-center justify-between px-4"
        style={{ background: "linear-gradient(135deg,#1A237E 0%,#3949AB 100%)" }}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-white text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>edit_calendar</span>
          <h1 className="text-lg font-bold text-white">Vardiya Yönetimi</h1>
        </div>
        {dirtyCount > 0 && (
          <button onClick={saveAll} disabled={saving}
            className="flex items-center gap-1.5 bg-emerald-400 text-white text-xs font-bold px-3 py-1.5 rounded-full active:scale-95 transition-all disabled:opacity-60">
            {saving ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span> : <span className="material-symbols-outlined text-[14px]">save</span>}
            {saving ? "..." : `Kaydet (${dirtyCount})`}
          </button>
        )}
      </header>

      {/* Tarih seçici */}
      <div className="px-4 pb-4 pt-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg,#1A237E 0%,#3949AB 100%)" }}>
        <button onClick={() => changeDate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">chevron_left</span>
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-bold">{dayLabel}, {dateLabel}</p>
          {isToday && <p className="text-emerald-300 text-xs font-bold">Bugün</p>}
        </div>
        <button onClick={() => changeDate(1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">chevron_right</span>
        </button>
      </div>
      <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-4 space-y-4">

        {/* Kopyalama bandı */}
        {clip && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-500 text-[20px]">content_paste</span>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-700">
                {shifts.find((s) => s.id === clip.shift_id)?.name || "Boş vardiya"} panoda
              </p>
              <p className="text-[10px] text-amber-500">Personele yapıştırmak için <span className="font-bold">yapıştır</span> ikonuna dokun</p>
            </div>
            <button onClick={() => setClip(null)}><span className="material-symbols-outlined text-amber-400 text-[18px]">close</span></button>
          </div>
        )}

        {/* Lokasyon seçici */}
        {loadingMgr ? (
          <div className="flex justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
          </div>
        ) : locations.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <span className="material-symbols-outlined text-gray-300 text-[48px] block mb-3">location_off</span>
            <p className="text-gray-500 font-bold">Lokasyon tanımlanmamış</p>
            <p className="text-gray-400 text-xs mt-1">Yönetici panelinden lokasyon ekleyebilirsiniz</p>
          </div>
        ) : (
          <>
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Lokasyon Seç</h3>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {locations.map((loc) => {
                  const sel = selLoc?.id === loc.id;
                  return (
                    <button key={loc.id} onClick={() => pickLocation(loc)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95 border ${sel ? "text-white border-transparent shadow-md" : "bg-white text-gray-600 border-gray-200 shadow-sm"}`}
                      style={sel ? { background: "linear-gradient(135deg,#1A237E,#3949AB)" } : undefined}>
                      <span className="material-symbols-outlined text-[15px]" style={sel ? { color: "#93C5FD" } : {}}>location_on</span>
                      {loc.name}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Personel / vardiya listesi */}
            {!selLoc ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
                <span className="material-symbols-outlined text-gray-200 text-[52px] block mb-3">touch_app</span>
                <p className="text-gray-400 font-semibold">Yukarıdan bir lokasyon seçin</p>
              </div>
            ) : loadingPers ? (
              <div className="flex justify-center py-12">
                <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[32px]">progress_activity</span>
              </div>
            ) : locPersonnel.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
                <span className="material-symbols-outlined text-gray-300 text-[48px] block mb-2">group_off</span>
                <p className="text-gray-500 font-bold">{selLoc.name}</p>
                <p className="text-gray-400 text-xs mt-1">Bu lokasyona atanmış aktif personel yok</p>
                <p className="text-gray-300 text-[10px] mt-0.5">Personel sayfasından lokasyon ataması yapın</p>
              </div>
            ) : (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{selLoc.name}</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">{locPersonnel.length} personel</p>
                  </div>
                  {dirtyCount > 0 && (
                    <button onClick={saveAll} disabled={saving}
                      className="text-xs font-bold text-white px-3 py-1.5 rounded-full active:scale-95 transition-all flex items-center gap-1"
                      style={{ background: "linear-gradient(135deg,#43A047,#2E7D32)" }}>
                      {saving ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span> : <span className="material-symbols-outlined text-[14px]">save</span>}
                      {saving ? "Kaydediliyor..." : `Kaydet (${dirtyCount})`}
                    </button>
                  )}
                </div>

                {locPersonnel.map((p) => {
                  const r = rows[p.id];
                  if (!r) return null;
                  return (
                    <div key={p.id}
                      className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all ${r.dirty ? "ring-2 ring-amber-300" : r.saved ? "ring-1 ring-emerald-200" : ""}`}>

                      {/* Personel satırı */}
                      <div className="p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-[#E8EAF6] flex items-center justify-center">
                          {p.avatar_url
                            ? <img src={p.avatar_url} alt={p.full_name} className="w-full h-full object-cover" />
                            : <span className="text-[#3949AB] font-bold text-sm">{getInitials(p.full_name)}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 text-sm truncate">{p.full_name}</p>
                          {p.position && <p className="text-[11px] text-gray-400 truncate">{p.position}</p>}
                        </div>
                        {r.dirty
                          ? <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-white text-[11px]">edit</span></span>
                          : r.saved
                          ? <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-white text-[11px]">check</span></span>
                          : null}
                      </div>

                      {/* Vardiya seç + aksiyon */}
                      <div className="px-3 pb-3 space-y-2">
                        <div className="flex gap-2">
                          {/* Dropdown */}
                          <div className="relative flex-1">
                            <select
                              value={r.shift_id || ""}
                              onChange={(e) => setRow(p.id, "shift_id", e.target.value || null)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2.5 text-sm font-semibold text-gray-700 appearance-none focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none">
                              <option value="">— Vardiya Yok —</option>
                              {shifts.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})
                                </option>
                              ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] pointer-events-none">expand_more</span>
                          </div>

                          {/* Kopyala */}
                          <button onClick={() => doCopy(p.id)} title="Kopyala"
                            className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center active:scale-90 transition-all flex-shrink-0">
                            <span className="material-symbols-outlined text-[#3949AB] text-[18px]">content_copy</span>
                          </button>

                          {/* Yapıştır */}
                          {clip && (
                            <button onClick={() => doPaste(p.id)} title="Yapıştır"
                              className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center active:scale-90 transition-all flex-shrink-0">
                              <span className="material-symbols-outlined text-amber-600 text-[18px]">content_paste</span>
                            </button>
                          )}
                        </div>

                        {/* Not */}
                        <input
                          value={r.notes}
                          onChange={(e) => setRow(p.id, "notes", e.target.value)}
                          placeholder="Not ekle (isteğe bağlı)"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                          maxLength={200}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Tümünü kaydet */}
                <button onClick={saveAll} disabled={saving || dirtyCount === 0}
                  className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#1A237E,#3949AB)" }}>
                  {saving
                    ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]">save</span>}
                  {saving ? "Kaydediliyor..." : dirtyCount > 0 ? `${dirtyCount} Değişikliği Kaydet` : "Kaydedildi"}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
