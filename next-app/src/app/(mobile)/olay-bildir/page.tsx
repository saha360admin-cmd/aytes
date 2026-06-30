"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Department } from "@/lib/types";
import { Suspense } from "react";

const incidentTypes = [
  { id: "fire", label: "Yangın", icon: "local_fire_department", bg: "bg-red-100", color: "text-red-600", selectedBg: "#FEE2E2", selectedBorder: "#EF4444" },
  { id: "theft", label: "Hırsızlık", icon: "lock_person", bg: "bg-indigo-100", color: "text-indigo-700", selectedBg: "#E0E7FF", selectedBorder: "#4F46E5" },
  { id: "suspicious", label: "Şüpheli Durum", icon: "visibility", bg: "bg-amber-100", color: "text-amber-700", selectedBg: "#FEF3C7", selectedBorder: "#F59E0B" },
  { id: "maintenance", label: "Teknik Arıza", icon: "build", bg: "bg-emerald-100", color: "text-emerald-700", selectedBg: "#D1FAE5", selectedBorder: "#10B981" },
  { id: "other", label: "Diğer", icon: "more_horiz", bg: "bg-purple-100", color: "text-purple-700", selectedBg: "#EDE9FE", selectedBorder: "#7C3AED" },
];

const severities = [
  { id: "low", label: "Düşük", active: "bg-emerald-600 text-white shadow-md shadow-emerald-200", icon: "arrow_downward" },
  { id: "medium", label: "Orta", active: "bg-amber-500 text-white shadow-md shadow-amber-200", icon: "remove" },
  { id: "high", label: "Yüksek", active: "bg-red-600 text-white shadow-md shadow-red-200", icon: "arrow_upward" },
];

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

function OlayBildirForm() {
  const router = useRouter();
  const params = useSearchParams();
  const patrolId = params.get("patrol_id");
  const { personnel } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [severity, setSeverity] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [videos, setVideos] = useState<{ file: File; preview: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoCamRef = useRef<HTMLInputElement>(null);
  const videoGalleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("departments").select("*").then(({ data }) => {
      if (data) setDepartments(data);
    });
  }, []);

  async function handleSubmit() {
    if (!selectedType || !severity || !description || !personnel) return;
    setSending(true);

    const depts = selectedDepts.length > 0 ? selectedDepts : [personnel.department_id];

    const { data: inc, error } = await supabase.from("incidents").insert({
      department_id: depts[0],
      reported_by: personnel.id,
      type: selectedType,
      severity,
      title: incidentTypes.find(t => t.id === selectedType)?.label || selectedType,
      description,
      location,
      status: "open",
      patrol_id: patrolId || null,
    }).select("id").single();

    if (!error && inc) {
      await supabase.from("incident_departments").insert(
        depts.map(dept_id => ({ incident_id: inc.id, department_id: dept_id, status: "open" }))
      );

      if (photos.length > 0) {
        const urls: string[] = [];
        for (const p of photos) {
          const ext = p.file.name.split(".").pop() || "jpg";
          const path = `incidents/${inc.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("incident-photos")
            .upload(path, p.file, { contentType: p.file.type });
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("incident-photos").getPublicUrl(path);
            urls.push(urlData.publicUrl);
          }
        }
        if (urls.length > 0) {
          await supabase.from("incidents").update({ photo_urls: urls }).eq("id", inc.id);
        }
      }

      if (videos.length > 0) {
        const urls: string[] = [];
        for (const v of videos) {
          const ext = v.file.name.split(".").pop() || "mp4";
          const path = `incidents/${inc.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("incident-videos")
            .upload(path, v.file, { contentType: v.file.type });
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("incident-videos").getPublicUrl(path);
            urls.push(urlData.publicUrl);
          }
        }
        if (urls.length > 0) {
          await supabase.from("incidents").update({ video_urls: urls }).eq("id", inc.id);
        }
      }
    }

    setSending(false);
    if (!error) {
      setToast(true);
      setTimeout(() => { setToast(false); router.push(patrolId ? "/devriye" : "/dashboard"); }, 2000);
    }
  }

  function toggleDept(id: string) {
    setSelectedDepts((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos((prev) => [...prev, { file, preview: ev.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleVideoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!file.type.startsWith("video/")) return;
      if (file.size > MAX_VIDEO_SIZE) {
        alert(`"${file.name}" dosyası 100 MB limitini aşıyor.`);
        return;
      }
      const preview = URL.createObjectURL(file);
      setVideos((prev) => [...prev, { file, preview }]);
    });
    e.target.value = "";
  }

  function removeVideo(idx: number) {
    setVideos((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const deptIcons: Record<string, string> = { idari: "admin_panel_settings", guvenlik: "security", teknik: "engineering", temizlik: "cleaning_services" };

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32 relative">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-800 text-white px-6 py-4 rounded-full shadow-xl z-[60] flex items-center gap-2 animate-fade-up">
          <span className="material-symbols-outlined">check_circle</span>
          <span className="text-sm font-semibold">Rapor başarıyla iletildi!</span>
        </div>
      )}

      <header className="sticky top-0 z-50 flex justify-between items-center px-6 h-16"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-white">Olay Bildir</h1>
        </div>
      </header>

      <main className="px-6 pt-6 pb-8 space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Olay Türü Seçin</h2>
          <div className="grid grid-cols-2 gap-4">
            {incidentTypes.map(t => {
              const isSel = selectedType === t.id;
              return (
                <button key={t.id} onClick={() => setSelectedType(t.id)}
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl shadow-sm border-2 transition-all group relative overflow-hidden ${isSel ? "border-transparent shadow-md" : "border-transparent bg-white hover:shadow-md"}`}
                  style={isSel ? { backgroundColor: t.selectedBg, borderColor: t.selectedBorder } : undefined}>
                  {isSel && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: t.selectedBorder }}>
                      <span className="material-symbols-outlined text-white text-[12px]">check</span>
                    </span>
                  )}
                  <div className={`w-12 h-12 ${t.bg} ${t.color} rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                    <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>{t.icon}</span>
                  </div>
                  <span className="text-sm font-semibold">{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">İlgili Birimi Seçin</h2>
          <p className="text-xs text-gray-400 -mt-2">Birden fazla seçebilirsiniz</p>
          <div className="grid grid-cols-2 gap-4">
            {departments.map(d => {
              const selected = selectedDepts.includes(d.id);
              return (
                <button key={d.id} onClick={() => toggleDept(d.id)}
                  className={`flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border-2 transition-all group relative ${selected ? "border-blue-700 bg-blue-50" : "border-transparent hover:border-blue-300"}`}>
                  {selected && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-blue-700 rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-[14px]">check</span>
                    </span>
                  )}
                  <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-[28px]">{deptIcons[d.slug] || "business"}</span>
                  </div>
                  <span className="text-sm font-semibold">{d.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Konum Bilgisi</h2>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center pointer-events-none">
              <span className="material-symbols-outlined">location_on</span>
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Örn: A Blok - 3. Kat, Güvenlik Odası..."
              className="w-full pl-16 pr-4 py-4 bg-white border border-gray-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-700 focus:border-blue-700 transition-all text-base placeholder:text-gray-400"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Olay Detayları</h2>
          <div className="relative">
            <textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 500))}
              className="w-full min-h-[160px] p-6 bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-700 focus:border-blue-700 transition-all text-base placeholder:text-gray-400 resize-none"
              placeholder="Lütfen olayı detaylı bir şekilde açıklayınız..." />
            <div className={`absolute bottom-4 right-4 text-xs font-semibold ${description.length > 450 ? "text-red-500" : "text-gray-400"}`}>{description.length} / 500</div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Önem Derecesi</h2>
          <div className="flex gap-2">
            {severities.map(s => (
              <button key={s.id} onClick={() => setSeverity(s.id)}
                className={`flex-1 py-4 rounded-2xl text-sm font-bold text-center transition-all flex items-center justify-center gap-1 ${severity === s.id ? s.active : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {severity === s.id && <span className="material-symbols-outlined text-[16px]">{s.icon}</span>}
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Medya Ekle</h2>

          {/* Fotoğraflar */}
          {photos.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {photos.map((p, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                  <img src={p.preview} alt={`foto-${i}`} className="w-full h-full object-cover" />
                  <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center shadow">
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={() => cameraRef.current?.click()}
              className="flex-1 py-5 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 text-gray-500 bg-white hover:border-blue-700 hover:text-blue-700 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[32px]">photo_camera</span>
              <span className="text-xs font-semibold">Fotoğraf Çek</span>
            </button>
            <button onClick={() => galleryRef.current?.click()}
              className="flex-1 py-5 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 text-gray-500 bg-white hover:border-blue-700 hover:text-blue-700 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[32px]">photo_library</span>
              <span className="text-xs font-semibold">Galeriden Fotoğraf</span>
            </button>
          </div>

          {/* Videolar */}
          {videos.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {videos.map((v, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-black">
                  <video src={v.preview} className="w-full h-full object-cover" preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                    </div>
                  </div>
                  <button onClick={() => removeVideo(i)} className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center shadow">
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={() => videoCamRef.current?.click()}
              className="flex-1 py-5 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 text-gray-500 bg-white hover:border-blue-700 hover:text-blue-700 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[32px]">videocam</span>
              <span className="text-xs font-semibold">Video Çek</span>
            </button>
            <button onClick={() => videoGalleryRef.current?.click()}
              className="flex-1 py-5 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 text-gray-500 bg-white hover:border-blue-700 hover:text-blue-700 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[32px]">video_library</span>
              <span className="text-xs font-semibold">Galeriden Video</span>
            </button>
          </div>

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoAdd} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoAdd} />
          <input ref={videoCamRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoAdd} />
          <input ref={videoGalleryRef} type="file" accept="video/*" multiple className="hidden" onChange={handleVideoAdd} />
        </section>
      </main>

      <div className="sticky bottom-0 bg-white px-6 pt-4 pb-6 shadow-[0_-10px_20px_rgba(0,0,0,0.08)] rounded-t-2xl z-50 mt-4">
        <button onClick={handleSubmit} disabled={sending || !selectedType || !severity || !description}
          className="w-full py-4 text-white rounded-2xl text-base font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
          {sending ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
          {sending ? "Gönderiliyor..." : "Raporu Gönder"}
        </button>
      </div>
    </div>
  );
}

export default function OlayBildirPage() {
  return <Suspense><OlayBildirForm /></Suspense>;
}
