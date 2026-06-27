"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Department } from "@/lib/types";
import { Suspense } from "react";

const incidentTypes = [
  { id: "fire", label: "Yangın", icon: "local_fire_department", bg: "bg-red-100", color: "text-red-600" },
  { id: "theft", label: "Hırsızlık", icon: "lock_person", bg: "bg-blue-50", color: "text-blue-700" },
  { id: "suspicious", label: "Şüpheli Durum", icon: "visibility", bg: "bg-amber-100", color: "text-amber-700" },
  { id: "maintenance", label: "Teknik Arıza", icon: "build", bg: "bg-green-100", color: "text-green-700" },
  { id: "other", label: "Diğer", icon: "more_horiz", bg: "bg-blue-50", color: "text-blue-700" },
];

const severities = [
  { id: "low", label: "Düşük", active: "bg-green-100 text-green-800 ring-2 ring-green-500" },
  { id: "medium", label: "Orta", active: "bg-amber-100 text-amber-800 ring-2 ring-amber-500" },
  { id: "high", label: "Yüksek", active: "bg-red-100 text-red-800 ring-2 ring-red-500" },
];

function OlayBildirForm() {
  const router = useRouter();
  const params = useSearchParams();
  const patrolId = params.get("patrol_id");
  const { personnel } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    supabase.from("departments").select("*").then(({ data }) => {
      if (data) setDepartments(data);
    });
  }, []);

  async function handleSubmit() {
    if (!selectedType || !severity || !description || !personnel) return;
    setSending(true);

    const { error } = await supabase.from("incidents").insert({
      department_id: selectedDept || personnel.department_id,
      reported_by: personnel.id,
      type: selectedType,
      severity,
      title: incidentTypes.find(t => t.id === selectedType)?.label || selectedType,
      description,
      location,
      status: "open",
      patrol_id: patrolId || null,
    });

    setSending(false);
    if (!error) {
      setToast(true);
      setTimeout(() => { setToast(false); router.push("/dashboard"); }, 2000);
    }
  }

  const deptIcons: Record<string, string> = { idari: "admin_panel_settings", guvenlik: "security", teknik: "engineering", temizlik: "cleaning_services" };

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-32 relative">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-800 text-white px-6 py-4 rounded-full shadow-xl z-[60] flex items-center gap-2 animate-fade-up">
          <span className="material-symbols-outlined">check_circle</span>
          <span className="text-sm font-semibold">Rapor başarıyla iletildi!</span>
        </div>
      )}

      <header className="bg-gray-50 shadow-sm sticky top-0 z-50 flex justify-between items-center px-6 h-16 w-full">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-blue-800">arrow_back</span>
          </button>
          <h1 className="text-2xl font-semibold text-blue-800">Olay Bildir</h1>
        </div>
      </header>

      <main className="px-6 pt-6 space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Olay Türü Seçin</h2>
          <div className="grid grid-cols-2 gap-4">
            {incidentTypes.map(t => (
              <button key={t.id} onClick={() => setSelectedType(t.id)}
                className={`flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border-2 transition-all group ${selectedType === t.id ? "border-blue-700 bg-blue-50" : "border-transparent hover:border-blue-300"}`}>
                <div className={`w-12 h-12 ${t.bg} ${t.color} rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>{t.icon}</span>
                </div>
                <span className="text-sm font-semibold">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">İlgili Birimi Seçin</h2>
          <div className="grid grid-cols-2 gap-4">
            {departments.map(d => (
              <button key={d.id} onClick={() => setSelectedDept(d.id)}
                className={`flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border-2 transition-all group ${selectedDept === d.id ? "border-blue-700 bg-blue-50" : "border-transparent hover:border-blue-300"}`}>
                <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-[28px]">{deptIcons[d.slug] || "business"}</span>
                </div>
                <span className="text-sm font-semibold">{d.name}</span>
              </button>
            ))}
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
                className={`flex-1 py-4 rounded-full text-sm font-semibold text-center transition-all ${severity === s.id ? s.active : "bg-white border border-gray-200 hover:bg-gray-50"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Medya Ekle</h2>
          <div className="flex gap-6">
            <button className="flex-1 aspect-square bg-white border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-700 hover:text-blue-700 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[32px]">photo_camera</span>
              <span className="text-xs font-semibold">Fotoğraf Çek</span>
            </button>
            <button className="flex-1 aspect-square bg-white border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-700 hover:text-blue-700 transition-all active:scale-95">
              <span className="material-symbols-outlined text-[32px]">videocam</span>
              <span className="text-xs font-semibold">Video Yükle</span>
            </button>
          </div>
        </section>
      </main>

      <div className="sticky bottom-0 w-full bg-white p-6 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] rounded-t-2xl z-50">
        <button onClick={handleSubmit} disabled={sending || !selectedType || !severity || !description}
          className="w-full py-4 bg-blue-800 text-white rounded-full text-2xl font-semibold shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50">
          {sending ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
          {sending ? "Gönderiliyor..." : "Raporu Gönder"}
        </button>
      </div>
    </div>
  );
}

export default function OlayBildirPage() {
  return <Suspense><OlayBildirForm /></Suspense>;
}
