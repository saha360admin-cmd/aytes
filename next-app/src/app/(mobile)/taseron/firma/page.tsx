"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Contractor { id: string; name: string; description: string | null; created_at: string; }

export default function TaseronFirmaPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [firms, setFirms] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadFirms();
  }, [personnel]);

  async function loadFirms() {
    setLoading(true);
    const { data } = await supabase.from("contractors").select("*").order("name");
    setFirms((data || []) as Contractor[]);
    setLoading(false);
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-lg leading-tight">Taşeron Firmalar</h1>
          <p className="text-white/70 text-xs">{firms.length} firma kayıtlı</p>
        </div>
        <button onClick={() => router.push("/taseron/firma/yeni")}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[22px]">add</span>
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
        </div>
      ) : firms.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 px-8 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-gray-300 text-[32px]">business</span>
          </div>
          <p className="font-bold text-gray-500">Henüz firma kaydı yok</p>
          <button onClick={() => router.push("/taseron/firma/yeni")}
            className="px-5 py-3 rounded-full text-sm font-bold text-white active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            İlk Firmayı Ekle
          </button>
        </div>
      ) : (
        <main className="px-4 pt-4 space-y-3">
          {firms.map(firm => (
            <div key={firm.id} className="bg-white rounded-2xl shadow-sm px-4 py-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #E8EAF6, #C5CAE9)" }}>
                <span className="material-symbols-outlined text-[#3949AB] text-[20px]">business</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm truncate">{firm.name}</p>
                {firm.description && (
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{firm.description}</p>
                )}
              </div>
            </div>
          ))}
        </main>
      )}

      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
        <div className="flex justify-end pb-[8.5rem] pr-4">
          <button onClick={() => router.push("/taseron/firma/yeni")}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Yeni Firma
          </button>
        </div>
      </div>
    </div>
  );
}
