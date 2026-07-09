"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Request } from "@/lib/types";
import { getDepartmentHeaderTheme } from "@/lib/departmentTheme";

const requestTypes = [
  { id: "unpaid", label: "Ücretsiz İzin", icon: "beach_access" },
  { id: "annual", label: "Yıllık İzin", icon: "calendar_month" },
  { id: "medical", label: "Doktor Raporu", icon: "medical_services" },
  { id: "resign", label: "İstifa", icon: "exit_to_app" },
  { id: "other", label: "Diğer", icon: "more_horiz" },
];

const typeLabels: Record<string, string> = { unpaid: "Ücretsiz İzin", annual: "Yıllık İzin", medical: "Doktor Raporu", resign: "İstifa", giris_destek: "Giriş Desteği", other: "Diğer" };
const statusLabels: Record<string, string> = { pending: "Bekliyor", approved: "Onaylandı", rejected: "Reddedildi" };
const statusColors: Record<string, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-700", rejected: "bg-red-100 text-red-700" };

export default function TaleplerPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const headerTheme = getDepartmentHeaderTheme(personnel?.departments?.slug);
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

  const loadRequests = useCallback(async () => {
    if (!personnel) return;
    const { data } = await supabase
      .from("requests")
      .select("*")
      .eq("personnel_id", personnel.id)
      .order("created_at", { ascending: false });
    setMyRequests(data || []);
  }, [personnel]);

  useEffect(() => {
    if (!personnel) return;
    loadRequests();
  }, [personnel, loadRequests]);

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

      <header className="w-full sticky top-0 z-50 flex items-center justify-between px-6 h-16"
        style={{ background: headerTheme.gradient }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="active:scale-95 transition-transform w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <span className="text-lg font-bold text-white">Talepler</span>
        </div>
      </header>

      <main className="px-6 pt-6 bg-[#f0f2ff] min-h-screen">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-gray-800 mb-1">Talep Oluştur</h1>
          <p className="text-sm text-gray-500">Lütfen oluşturmak istediğiniz talep türünü seçin ve detayları girin.</p>
        </div>

        <section className="mb-6">
          <div className="grid grid-cols-3 gap-3">
            {requestTypes.map((t, idx) => {
              const accentColors = ["#3949AB","#00897B","#EF5350","#9C27B0","#FF9800"];
              const accent = accentColors[idx % accentColors.length];
              const isSel = selectedType === t.id;
              return (
                <button key={t.id} onClick={() => setSelectedType(t.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl h-24 transition-all active:scale-90 shadow-sm ${isSel ? "shadow-md" : "bg-white"}`}
                  style={isSel ? { backgroundColor: accent + "20", borderWidth: 2, borderColor: accent } : { border: "2px solid transparent" }}>
                  <span className="material-symbols-outlined text-2xl mb-1"
                    style={{ color: isSel ? accent : "#6B7280", fontVariationSettings: isSel ? "'FILL' 1" : undefined }}>{t.icon}</span>
                  <span className={`text-[11px] font-bold text-center leading-tight ${isSel ? "" : "text-gray-600"}`}
                    style={isSel ? { color: accent } : undefined}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <label className="block text-sm font-semibold text-gray-500 mb-2">Talebiniz Hakkında Detaylar</label>
            <textarea value={details} onChange={e => setDetails(e.target.value.slice(0, 1000))} maxLength={1000}
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
            className="w-full text-white text-base font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            {sending ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">send</span>}
            {sending ? "Gönderiliyor..." : "Talebi Gönder"}
          </button>
        </section>

        {myRequests.length > 0 && (
          <section className="mt-8 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Taleplerim</h2>
            {myRequests.map(r => (
              <div key={r.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold">{typeLabels[r.type] || r.type}</p>
                    <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString("tr-TR")}</p>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">{r.details}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${statusColors[r.status]}`}>
                    {statusLabels[r.status]}
                  </span>
                </div>
                {r.status === "rejected" && r.rejection_note && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    <span className="material-symbols-outlined text-red-500 text-[16px] flex-shrink-0 mt-0.5">info</span>
                    <p className="text-xs text-red-700 leading-relaxed">{r.rejection_note}</p>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        <div className="mt-12 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
            <span className="material-symbols-outlined text-amber-600 text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>gavel</span>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-bold text-amber-800">Yasal Mevzuat Bilgisi</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Buradan yapacağınız talepler <span className="font-semibold">hızlı bilgilendirme</span> amaçlıdır. 4857 Sayılı İş Kanunu kapsamındaki izin, istifa ve benzeri resmi taleplerinizin <span className="font-semibold">yazılı dilekçe</span> ile insan kaynakları birimine iletilmesi zorunludur.
            </p>
            <p className="text-[11px] text-amber-600 font-semibold pt-0.5">İş K. Md. 56 · Md. 17 · Md. 19</p>
          </div>
        </div>
      </main>
    </div>
  );
}
