"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePTT, type PTTChannelKey } from "@/hooks/usePTT";

export default function PTTPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const {
    isGuvenlik,
    hasMudurluk,
    activeChannel,
    activeChannelLabel,
    setActiveChannel,
    speaking,
    connecting,
    joined,
    participantCount,
    error,
    startTalking,
    stopTalking,
  } = usePTT();

  useEffect(() => {
    if (personnel && personnel.departments?.slug !== "guvenlik") {
      router.replace("/dashboard");
    }
  }, [personnel, router]);

  if (!personnel || !isGuvenlik) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
        <span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span>
      </div>
    );
  }

  const isJoined = joined[activeChannel];

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-white shadow-sm flex items-center gap-3 px-4 h-16">
        <button
          onClick={() => router.push("/dashboard")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined text-blue-800">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-blue-800 text-lg">Telsiz</h1>
          <p className="text-xs text-gray-400">{activeChannelLabel} kanalı</p>
        </div>
      </header>

      <main className="px-5 pt-5 space-y-5">
        {hasMudurluk && (
          <div className="bg-white rounded-2xl shadow-sm p-1.5 flex gap-1.5">
            {(["genel", "mudurluk"] as PTTChannelKey[]).map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                disabled={speaking}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
                  activeChannel === ch ? "bg-blue-800 text-white" : "text-gray-500"
                }`}
              >
                {ch === "genel" ? "Genel" : "Müdürlük"}
              </button>
            ))}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm p-8 flex flex-col items-center gap-5">
          {connecting && !isJoined ? (
            <p className="text-sm text-gray-400">Kanala bağlanılıyor...</p>
          ) : (
            <>
              <button
                onPointerDown={startTalking}
                onPointerUp={stopTalking}
                onPointerLeave={stopTalking}
                disabled={!isJoined}
                className={`w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 select-none transition-all active:scale-95 disabled:opacity-50 ${
                  speaking ? "bg-red-600 shadow-lg shadow-red-200" : "bg-blue-800 shadow-lg shadow-blue-200"
                }`}
                style={{ touchAction: "none" }}
              >
                <span className="material-symbols-outlined text-white text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  mic
                </span>
                <span className="text-white font-bold text-sm">{speaking ? "Konuşuyorsunuz" : "Konuş"}</span>
              </button>
              <p className="text-xs text-gray-400">{isJoined ? "Basılı tutarak konuşun" : "Kanala bağlanılıyor..."}</p>
            </>
          )}
        </div>

        {error && (
          <div className="bg-red-50 rounded-2xl p-4 flex items-start gap-2">
            <span className="material-symbols-outlined text-red-500 text-[18px] flex-shrink-0 mt-0.5">error</span>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <section className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              groups
            </span>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Kanalda</p>
            <p className="text-sm font-bold text-gray-800">{participantCount} kişi bağlı</p>
          </div>
        </section>
      </main>
    </div>
  );
}
