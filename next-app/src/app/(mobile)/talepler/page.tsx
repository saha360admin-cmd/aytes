"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Request } from "@/lib/types";

const requestTypes = [
  { id: "unpaid", label: "Ücretsiz İzin", icon: "beach_access" },
  { id: "annual", label: "Yıllık İzin", icon: "calendar_month" },
  { id: "medical", label: "Doktor Raporu", icon: "medical_services" },
  { id: "resign", label: "İstifa", icon: "exit_to_app" },
  { id: "other", label: "Diğer", icon: "more_horiz" },
];

const typeLabels: Record<string, string> = { unpaid: "Ücretsiz İzin", annual: "Yıllık İzin", medical: "Doktor Raporu", resign: "İstifa", other: "Diğer" };
const statusLabels: Record<string, string> = { pending: "Bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };
const statusColors: Record<string, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" };

export default function TaleplerPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [selectedType, setSelectedType] = useState("unpaid");
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [myRequests, setMyRequests] = useState<Request[]>([]);
  const [toast, setToast] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const isMedical = selectedType === "medical";

  function handlePhotoAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
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

  useEffect(() => {
    if (!personnel) return;
    loadRequests();
  }, [personnel]);

  async function loadRequests() {
    if (!personnel) return;
    const { data } = await supabase
      .from("requests")
      .select("*")
      .eq("personnel_id", personnel.id)
      .order("created_at", { ascending: false });
    setMyRequests(data || []);
  }

  async function handleSubmit() {
    if (!personnel || !details) return;
    setSending(true);

    const { error } = await supabase.from("requests").insert({
      personnel_id: personnel.id,
      department_id: personnel.department_id,
      type: selectedType,
      details,
      status: "pending",
    });

    setSending(false);
    if (!error) {
      setDetails("");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
      loadRequests();
    }
  }

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-8">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-800 text-white px-6 py-4 rounded-full shadow-xl z-[60] flex items-center gap-2 animate-fade-up">
          <span className="material-symbols-outlined">check_circle</span>
          <span className="text-sm font-semibold">Talep başarıyla gönderildi!</span>
        </div>
      )}

      <header className="w-full sticky top-0 z-50 bg-[#f8f9ff] shadow-sm flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="active:scale-95 transition-transform p-2 -ml-2 rounded-full hover:bg-gray-200">
            <span className="material-symbols-outlined text-blue-800">arrow_back</span>
          </button>
          <span className="text-2xl font-bold text-blue-800">Talepler</span>
        </div>
      </header>

      <main className="px-6 pt-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-blue-800 mb-1">Talep Oluştur</h1>
          <p className="text-base text-gray-500">Lütfen oluşturmak istediğiniz talep türünü seçin ve detayları girin.</p>
        </div>

        <section className="mb-6">
          <div className="grid grid-cols-3 gap-3">
            {requestTypes.map(t => (
              <button key={t.id} onClick={() => setSelectedType(t.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border h-24 transition-all active:scale-90 ${
                  selectedType === t.id ? "bg-blue-700 text-white border-blue-700 shadow-lg" : "bg-white text-gray-700 border-gray-200 shadow-sm"
                }`}>
                <span className={`material-symbols-outlined text-2xl mb-1 ${selectedType === t.id ? "text-white" : "text-blue-800"}`}
                  style={selectedType === t.id ? { fontVariationSettings: "'FILL' 1" } : undefined}>{t.icon}</span>
                <span className="text-[11px] font-semibold text-center leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <label className="block text-sm font-semibold text-gray-500 mb-2">Talebiniz Hakkında Detaylar</label>
            <textarea value={details} onChange={e => setDetails(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-blue-700 focus:border-blue-700 outline-none text-base transition-all resize-none"
              placeholder="Talebinizi buraya yazınız..." rows={4} />
            <div className="mt-4 flex items-center gap-2 text-gray-500">
              <span className="material-symbols-outlined text-[18px]">info</span>
              <span className="text-xs font-semibold">Talebiniz yönetici onayına sunulacaktır.</span>
            </div>
          </div>

          {/* Doktor Raporu Fotoğraf Bölümü */}
          {isMedical && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-500 text-[20px]">medical_information</span>
                  <label className="text-sm font-semibold text-gray-700">Rapor Fotoğrafı</label>
                </div>
                <span className="text-xs font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded-full">Zorunlu</span>
              </div>
              <p className="text-xs text-gray-400">Doktor raporunun tamamını net şekilde fotoğraflayın veya galeriden yükleyin.</p>

              {photos.length > 0 && (
                <div className="flex gap-3 flex-wrap">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                      <img src={p.preview} alt={`rapor-${i}`} className="w-full h-full object-cover" />
                      <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center shadow">
                        <span className="material-symbols-outlined text-[12px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => cameraRef.current?.click()}
                  className="flex-1 py-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-rose-300 text-rose-500 bg-rose-50 hover:bg-rose-100 active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-[28px]">photo_camera</span>
                  <span className="text-xs font-semibold">Fotoğraf Çek</span>
                </button>
                <button onClick={() => galleryRef.current?.click()}
                  className="flex-1 py-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-rose-300 text-rose-500 bg-rose-50 hover:bg-rose-100 active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-[28px]">photo_library</span>
                  <span className="text-xs font-semibold">Galeriden Seç</span>
                </button>
              </div>

              <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handlePhotoAdd} />
              <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoAdd} />
            </div>
          )}

          <button onClick={handleSubmit} disabled={sending || !details || (isMedical && photos.length === 0)}
            className="w-full bg-blue-700 text-white text-2xl font-semibold py-4 rounded-full shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {sending ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
            {sending ? "Gönderiliyor..." : "Talebi Gönder"}
          </button>
        </section>

        {myRequests.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Taleplerim</h2>
            {myRequests.map(r => (
              <div key={r.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold">{typeLabels[r.type] || r.type}</p>
                  <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString("tr-TR")}</p>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">{r.details}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[r.status]}`}>
                  {statusLabels[r.status]}
                </span>
              </div>
            ))}
          </section>
        )}

        <div className="mt-12 relative h-40 w-full overflow-hidden rounded-2xl bg-blue-100/50 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-sm font-bold text-blue-800">7/24 Personel Destek Hattı</p>
            <p className="text-base text-gray-700">Yardıma mı ihtiyacınız var? Destek ekibimiz her zaman yanınızda.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
