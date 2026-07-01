"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function TaseronFirmaYeniPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") router.replace("/dashboard");
  }, [personnel]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSubmit() {
    if (!name.trim()) { showToast("Firma adı zorunludur.", false); return; }
    setSaving(true);
    const payload: Record<string, string> = { name: name.trim() };
    if (description.trim()) payload.description = description.trim();
    const { error } = await supabase.from("contractors").insert(payload);
    setSaving(false);
    if (error) {
      showToast("Kayıt oluşturulamadı. Lütfen tekrar deneyin.", false);
    } else {
      router.push("/yonetici");
    }
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-8">

      {toast && (
        <div className="fixed top-4 left-0 right-0 max-w-[430px] mx-auto z-[60] flex justify-center px-4">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-full shadow-xl text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
            <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
            {toast.msg}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">Yeni Firma Kaydı</h1>
          <p className="text-white/70 text-xs">Taşeron firmayı sisteme ekle</p>
        </div>
      </header>

      <div className="px-4 pt-5 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">
              Firma Adı <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value.toLocaleUpperCase("tr-TR"))}
              placeholder="Örn: ABC TEKNİK SERVİS"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">
              Kısa Açıklama <span className="text-xs font-normal text-gray-400">(opsiyonel)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.replace(/\b\S/g, c => c.toLocaleUpperCase("tr-TR")))}
              placeholder="Firmanın uzmanlık alanı veya notlar…"
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 pb-6">
          <button onClick={() => router.back()}
            className="flex-1 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-all">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            {saving
              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
