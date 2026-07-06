"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { CleaningArea, CleaningChecklistItem } from "@/lib/types";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ItemRow extends CleaningChecklistItem {
  area: CleaningArea;
}

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  tamamlandı:    { label: "Tamamlandı",   bg: "bg-emerald-100", text: "text-emerald-700", icon: "check_circle" },
  devam_ediyor:  { label: "Devam Ediyor", bg: "bg-blue-100",    text: "text-blue-700",    icon: "hourglass_top" },
  tamamlanmadı:  { label: "Tamamlanmadı", bg: "bg-red-100",     text: "text-red-600",     icon: "cancel" },
  atlandı:       { label: "Atlandı",      bg: "bg-gray-100",    text: "text-gray-500",    icon: "skip_next" },
};

export default function GunlukKontrolPage() {
  const router = useRouter();
  const { personnel } = useAuth();

  const [loading, setLoading] = useState(true);
  const [noProgram, setNoProgram] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!personnel) return;
    loadToday();
  }, [personnel]);

  async function loadToday() {
    if (!personnel?.location_id) { setNoProgram(true); setLoading(false); return; }
    const today = new Date();
    const dateStr = toDateStr(today);

    const { data: loc } = await supabase.from("locations").select("name").eq("id", personnel.location_id).maybeSingle();
    setLocationName(loc?.name || "");

    let { data: checklist } = await supabase
      .from("cleaning_checklists")
      .select("id")
      .eq("location_id", personnel.location_id)
      .eq("date", dateStr)
      .maybeSingle();

    if (!checklist) {
      const dow = today.getDay();
      const { data: programs } = await supabase
        .from("cleaning_programs")
        .select("id, recurrence_type, days_of_week")
        .eq("location_id", personnel.location_id)
        .eq("active", true);

      const match = (programs || []).find((p: any) =>
        p.recurrence_type === "daily" || (p.recurrence_type === "weekly" && (p.days_of_week || []).includes(dow))
      );

      if (!match) { setNoProgram(true); setLoading(false); return; }

      const { data: areas } = await supabase
        .from("cleaning_areas")
        .select("id")
        .eq("location_id", personnel.location_id)
        .order("sort_order");

      if (!areas || areas.length === 0) { setNoProgram(true); setLoading(false); return; }

      const { data: newChecklist, error } = await supabase
        .from("cleaning_checklists")
        .insert({
          program_id: match.id,
          department_id: personnel.department_id,
          location_id: personnel.location_id,
          personnel_id: personnel.id,
          date: dateStr,
        })
        .select("id").single();

      if (error || !newChecklist) { setNoProgram(true); setLoading(false); return; }

      await supabase.from("cleaning_checklist_items").insert(
        areas.map(a => ({ checklist_id: newChecklist.id, area_id: a.id }))
      );

      checklist = newChecklist;
    }

    const { data: rows } = await supabase
      .from("cleaning_checklist_items")
      .select("*, area:area_id(id, location_id, name, requires_photo, sort_order)")
      .eq("checklist_id", checklist.id);

    const sorted = ((rows || []) as unknown as ItemRow[]).sort((a, b) => a.area.sort_order - b.area.sort_order);
    setItems(sorted);
    setLoading(false);
  }

  async function updateStatus(item: ItemRow, status: CleaningChecklistItem["status"]) {
    if (status === "tamamlandı" && item.area.requires_photo && !item.photo_url) {
      fileInputs.current[item.id]?.click();
      return;
    }
    await supabase.from("cleaning_checklist_items")
      .update({ status, completed_at: status === "tamamlandı" ? new Date().toISOString() : null })
      .eq("id", item.id);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status, completed_at: status === "tamamlandı" ? new Date().toISOString() : null } : i));
  }

  async function handlePhotoSelected(item: ItemRow, file: File) {
    setUploadingId(item.id);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${item.checklist_id}/${item.area_id}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("cleaning-checklist-photos")
      .upload(path, file, { contentType: file.type });

    if (!upErr) {
      const { data: urlData } = supabase.storage.from("cleaning-checklist-photos").getPublicUrl(path);
      const now = new Date().toISOString();
      await supabase.from("cleaning_checklist_items")
        .update({ status: "tamamlandı", photo_url: urlData.publicUrl, completed_at: now })
        .eq("id", item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: "tamamlandı", photo_url: urlData.publicUrl, completed_at: now } : i));
    }
    setUploadingId(null);
  }

  const completed = items.filter(i => i.status === "tamamlandı").length;
  const total = items.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span></div>;
  }

  if (noProgram) {
    return (
      <div className="bg-[#f8f9ff] min-h-screen flex flex-col items-center justify-center px-6 gap-5">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-gray-400 text-[40px]">event_busy</span>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-700">Bugün İçin Program Yok</h2>
          <p className="text-sm text-gray-400">Lokasyonunuz için tanımlı bir temizlik programı bulunamadı.</p>
        </div>
        <button onClick={() => router.push("/dashboard")}
          className="mt-2 px-8 py-3.5 rounded-2xl text-white font-bold active:scale-95 transition-all"
          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
          Panele Dön
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-24">
      <header className="bg-white shadow-sm sticky top-0 z-50 flex justify-between items-center px-6 h-16">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-blue-800">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-blue-800">Günlük Kontrol Listesi</h1>
        </div>
      </header>

      <main className="px-6 pt-5 space-y-4">
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lokasyon</p>
            <h2 className="text-lg font-bold text-gray-800">{locationName || "—"}</h2>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-gray-500">Tamamlanma Oranı</span>
              <span className="text-blue-800">{completed} / {total} Alan</span>
            </div>
            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: "linear-gradient(to right, #00BCD4, #3949AB)" }} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {items.map(item => {
            const cfg = STATUS_CFG[item.status];
            return (
              <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{item.area.name}</p>
                    {item.area.requires_photo && (
                      <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">photo_camera</span>
                        Fotoğraf zorunlu
                      </p>
                    )}
                  </div>
                  <span className={`flex items-center gap-1.5 ${cfg.bg} ${cfg.text} text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0`}>
                    <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                </div>

                {item.photo_url && (
                  <img src={item.photo_url} alt={item.area.name} className="w-full h-32 object-cover rounded-xl" />
                )}

                <input
                  ref={el => { fileInputs.current[item.id] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelected(item, f); e.target.value = ""; }}
                />

                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(STATUS_CFG) as CleaningChecklistItem["status"][]).map(s => (
                    <button
                      key={s}
                      onClick={() => updateStatus(item, s)}
                      disabled={uploadingId === item.id}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                        item.status === s ? "text-white" : "bg-gray-50 text-gray-500"
                      }`}
                      style={item.status === s ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}
                    >
                      {uploadingId === item.id && s === "tamamlandı" ? "Yükleniyor..." : STATUS_CFG[s].label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
