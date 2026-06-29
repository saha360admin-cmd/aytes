"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface ShiftType {
  id: string;
  code: string;
  name: string;
  type_label: string;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  break_hours: number | null;
  is_day_off: boolean;
  color: string;
  sort_order: number;
}

const COLORS = [
  { label: "Lacivert", value: "#1A237E" },
  { label: "Mavi",    value: "#0058be" },
  { label: "Yeşil",   value: "#006c49" },
  { label: "Turuncu", value: "#825100" },
  { label: "Kırmızı", value: "#ba1a1a" },
  { label: "Mor",     value: "#6A1B9A" },
  { label: "Gri",     value: "#727785" },
];

const TYPE_LABELS = ["Normal", "Uzun Vardiya", "Gece Vardiyası", "İzin", "Tatil", "Özel"];

const emptyForm = {
  code: "",
  name: "",
  type_label: "Normal",
  start_time: "",
  end_time: "",
  break_hours: "0",
  is_day_off: false,
  color: "#0058be",
};

function calcDuration(start: string, end: string, breakH: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // gece yarısı geçiş
  return Math.round((mins / 60 - Number(breakH || 0)) * 10) / 10;
}

function formatTime(t: string | null) {
  if (!t) return "—";
  return t.slice(0, 5);
}

export default function VardiyaTanimlamaPage() {
  const { personnel } = useAuth();
  const router = useRouter();

  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    load();
  }, [personnel]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("shift_types")
      .select("*")
      .eq("department_id", personnel!.department_id)
      .order("sort_order")
      .order("created_at");
    setShiftTypes((data || []) as ShiftType[]);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  }

  function openEdit(s: ShiftType) {
    setEditingId(s.id);
    setForm({
      code: s.code,
      name: s.name,
      type_label: s.type_label || "Normal",
      start_time: s.start_time?.slice(0, 5) || "",
      end_time: s.end_time?.slice(0, 5) || "",
      break_hours: String(s.break_hours ?? 0),
      is_day_off: s.is_day_off,
      color: s.color || "#0058be",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    const duration = form.is_day_off ? null : calcDuration(form.start_time, form.end_time, form.break_hours);
    const payload = {
      department_id: personnel!.department_id,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      type_label: form.type_label,
      start_time: form.is_day_off ? null : form.start_time || null,
      end_time: form.is_day_off ? null : form.end_time || null,
      duration_hours: duration,
      break_hours: form.is_day_off ? null : Number(form.break_hours) || 0,
      is_day_off: form.is_day_off,
      color: form.color,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("shift_types").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("shift_types").insert(payload));
    }

    setSaving(false);
    if (error) {
      showToast(error.message, false);
    } else {
      setModalOpen(false);
      showToast(editingId ? "Vardiya güncellendi" : "Vardiya eklendi", true);
      load();
    }
  }

  async function handleDelete(id: string) {
    await supabase.from("shift_types").delete().eq("id", id);
    setDeleteConfirm(null);
    showToast("Vardiya silindi", true);
    load();
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = shiftTypes.filter(
    s => s.name.toLowerCase().includes(search.toLowerCase()) ||
         s.code.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = shiftTypes.filter(s => !s.is_day_off).length;
  const avgDuration = shiftTypes.filter(s => s.duration_hours).reduce((a, s, _, arr) =>
    a + (s.duration_hours || 0) / arr.filter(x => x.duration_hours).length, 0);

  const duration = form.is_day_off ? null : calcDuration(form.start_time, form.end_time, form.break_hours);

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white whitespace-nowrap ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Silme Onayı */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-red-600 text-[24px]">delete</span>
              </div>
              <div>
                <p className="font-bold text-gray-800">Vardiyayı Sil</p>
                <p className="text-sm text-gray-500">Bu vardiya tipi silinecek. Onaylıyor musunuz?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm active:scale-95 transition-all">
                İptal
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm active:scale-95 transition-all">
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ekle/Düzenle Modalı */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-800 text-base">{editingId ? "Vardiyayı Düzenle" : "Yeni Vardiya Ekle"}</h2>
              <button onClick={() => setModalOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-90 transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Kod */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vardiya Kodu *</label>
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold tracking-widest uppercase focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
                  placeholder="T211, G1, OFF…"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  maxLength={10}
                />
              </div>

              {/* İsim */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vardiya Adı *</label>
                <input
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
                  placeholder="Gündüz Vardiyası, Uzun Gece…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Tip */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Vardiya Tipi</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_LABELS.map(t => (
                    <button key={t} type="button"
                      onClick={() => setForm(f => ({ ...f, type_label: t }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${form.type_label === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tam Gün İzin Toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-gray-500 text-[20px]">event_busy</span>
                  <div>
                    <p className="text-sm font-bold text-gray-700">Tam Gün İzin / Tatil</p>
                    <p className="text-xs text-gray-400">Saat aralığı gerekmez</p>
                  </div>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_day_off: !f.is_day_off }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${form.is_day_off ? "bg-indigo-600" : "bg-gray-300"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_day_off ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>

              {/* Saat Aralığı */}
              {!form.is_day_off && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Başlangıç</label>
                      <input type="time"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
                        value={form.start_time}
                        onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Bitiş</label>
                      <input type="time"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
                        value={form.end_time}
                        onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Mola Süresi (saat)</label>
                    <div className="flex gap-2">
                      {["0", "0.5", "1", "1.5", "2"].map(v => (
                        <button key={v} type="button"
                          onClick={() => setForm(f => ({ ...f, break_hours: v }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${form.break_hours === v ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                          {v === "0" ? "Yok" : `${v}s`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hesaplanan süre */}
                  {duration !== null && duration > 0 && (
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
                      <span className="material-symbols-outlined text-indigo-600 text-[18px]">timelapse</span>
                      <p className="text-sm font-bold text-indigo-700">Net çalışma: <span className="text-indigo-900">{duration} saat</span></p>
                    </div>
                  )}
                </div>
              )}

              {/* Renk */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Renk</label>
                <div className="flex gap-3 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c.value} type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-9 h-9 rounded-full transition-all active:scale-90 ${form.color === c.value ? "ring-2 ring-offset-2 ring-gray-500 scale-110" : ""}`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              {/* Önizleme */}
              {form.code && (
                <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                    style={{ backgroundColor: form.color }}>
                    {form.code.slice(0, 4)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{form.name || "—"}</p>
                    <p className="text-xs text-gray-500">{form.type_label} · {form.is_day_off ? "Tüm Gün" : duration ? `${duration}s net` : "Saat girilmedi"}</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || !form.code.trim() || !form.name.trim()}
                className="w-full py-3.5 rounded-full text-sm font-bold text-white shadow-md active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
                <span className="material-symbols-outlined text-[18px]">{saving ? "progress_activity" : "save"}</span>
                {saving ? "Kaydediliyor..." : editingId ? "Değişiklikleri Kaydet" : "Vardiya Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 w-full"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white active:scale-90 transition-all">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base leading-tight">Vardiya Tanımlama</h1>
            <p className="text-white/60 text-xs">{shiftTypes.length} vardiya tipi</p>
          </div>
          <button onClick={openAdd}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-[#1A237E] font-bold shadow-sm active:scale-90 transition-all">
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">

        {/* Özet */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Aktif Vardiya</p>
            <p className="text-3xl font-black text-indigo-700 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Ort. Süre</p>
            <p className="text-3xl font-black text-emerald-600 mt-1">
              {avgDuration > 0 ? `${avgDuration.toFixed(1)}s` : "—"}
            </p>
          </div>
        </div>

        {/* Arama */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
          <input
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
            placeholder="Kod veya isim ile ara…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Liste */}
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="material-symbols-outlined animate-spin text-indigo-400 text-[32px]">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <span className="material-symbols-outlined text-gray-300 text-[48px]">schedule</span>
            <p className="text-gray-400 font-semibold text-sm">
              {search ? "Arama sonucu bulunamadı" : "Henüz vardiya tipi eklenmedi"}
            </p>
            {!search && (
              <button onClick={openAdd}
                className="mx-auto flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-full text-sm font-bold active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[18px]">add</span>
                İlk Vardiyayı Ekle
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex">
                  {/* Sol renk çubuğu */}
                  <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                          style={{ backgroundColor: s.color }}>
                          {s.code}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{s.name}</p>
                          <p className="text-xs font-semibold mt-0.5" style={{ color: s.color }}>{s.type_label}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(s)}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 active:scale-90 transition-all">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onClick={() => setDeleteConfirm(s.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-red-400 active:scale-90 transition-all">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                      {s.is_day_off ? (
                        <>
                          <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="material-symbols-outlined text-[14px]">event_busy</span>
                            Tüm Gün
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="material-symbols-outlined text-[14px]">beach_access</span>
                            {s.type_label}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            {formatTime(s.start_time)} – {formatTime(s.end_time)}
                          </span>
                          {s.duration_hours && (
                            <span className="flex items-center gap-1.5 text-xs text-gray-500">
                              <span className="material-symbols-outlined text-[14px]">timelapse</span>
                              {s.duration_hours}s net
                            </span>
                          )}
                          {s.break_hours ? (
                            <span className="flex items-center gap-1.5 text-xs text-gray-500">
                              <span className="material-symbols-outlined text-[14px]">coffee</span>
                              {s.break_hours}s mola
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alt ekle butonu */}
        {filtered.length > 0 && (
          <button onClick={openAdd}
            className="w-full py-3.5 rounded-full text-sm font-bold text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
            <span className="material-symbols-outlined text-[18px]">add</span>
            Yeni Vardiya Ekle
          </button>
        )}
      </main>
    </div>
  );
}
