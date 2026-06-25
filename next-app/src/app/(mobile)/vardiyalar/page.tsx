"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const weekDays = [
  { day: "Pzt", num: 16, shifts: 2 },
  { day: "Sal", num: 17, shifts: 3 },
  { day: "Çar", num: 18, shifts: 2, active: true },
  { day: "Per", num: 19, shifts: 1 },
  { day: "Cum", num: 20, shifts: 1 },
  { day: "Cmt", num: 21, shifts: 0 },
  { day: "Paz", num: 22, shifts: 0 },
];

export default function VardiyalarPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [activeDay, setActiveDay] = useState(2);

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-8">
      {/* Header */}
      <header className="w-full sticky top-0 z-40 bg-[#f8f9ff] shadow-sm px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")} className="active:scale-95 transition-transform p-2 -ml-2 rounded-full hover:bg-gray-200">
            <span className="material-symbols-outlined text-blue-800">arrow_back</span>
          </button>
          <h1 className="text-2xl font-bold text-blue-800">Vardiyalar</h1>
        </div>
        <button className="active:scale-95 transition-transform p-2 rounded-full hover:bg-gray-200">
          <span className="material-symbols-outlined text-blue-800">calendar_month</span>
        </button>
      </header>

      <main className="w-full px-6 pb-8 pt-6 flex flex-col gap-8">
        {/* Weekly Calendar */}
        <section className="flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <h2 className="text-2xl font-semibold text-gray-900">Bu Hafta</h2>
            <span className="text-sm font-semibold text-gray-500">Haziran 2026</span>
          </div>
          <div className="flex gap-3 overflow-x-auto py-2 -mx-2 px-2" style={{ scrollbarWidth: "none" }}>
            {weekDays.map((d, i) => (
              <button
                key={i}
                onClick={() => setActiveDay(i)}
                className={`flex flex-col items-center justify-center min-w-[56px] h-20 rounded-2xl transition-all ${
                  activeDay === i
                    ? "bg-blue-800 text-white shadow-lg shadow-blue-800/30 scale-105"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer"
                }`}
              >
                <span className="text-xs font-semibold">{d.day}</span>
                <span className="text-2xl font-semibold">{d.num}</span>
                {d.shifts > 0 && (
                  <span className={`text-xs font-semibold ${activeDay === i ? "text-white/80" : "text-blue-600/60"}`}>{d.shifts}</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Shift Detail */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold text-gray-900">Vardiya Detayları</h2>
          <div className="bg-white rounded-2xl shadow-lg p-6 border-l-[8px] border-blue-600 flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-40 h-40 bg-blue-800/5 rounded-full blur-3xl" />
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-blue-800 text-[20px]">light_mode</span>
                  <span className="text-lg font-bold">Gündüz Vardiyası</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-gray-400 text-[18px]">schedule</span>
                  <span className="text-base text-gray-500">08:00 - 16:00</span>
                </div>
              </div>
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">Aktif</span>
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-800">location_on</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400">Konum</p>
                  <p className="text-base font-medium">A Blok - Ana Giriş</p>
                </div>
              </div>

              {["Ahmet Y.", "Mehmet D.", "Canan K."].map((name, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400">Birlikte Çalışanlar</p>
                    <p className="text-base font-medium">{name}</p>
                  </div>
                  <button className="ml-auto w-10 h-10 rounded-full border border-blue-800 text-blue-800 flex items-center justify-center active:bg-blue-50 transition-colors">
                    <span className="material-symbols-outlined text-[20px]">call</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 bg-amber-100 text-amber-900 p-4 rounded-xl flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px]">info</span>
              <p className="text-sm font-semibold">Bugün saat 14:00&apos;te bina yönetimi ile kısa bir denetim toplantısı yapılacak.</p>
            </div>
          </div>
        </section>

        {/* Monthly Summary */}
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold text-gray-900">Aylık Özet</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: "timer", value: "152", label: "Toplam Saat", color: "text-green-600", border: "border-green-500" },
              { icon: "event_repeat", value: "12", label: "Gelecek Vardiya", color: "text-blue-800", border: "border-blue-800" },
              { icon: "more_time", value: "24", label: "Fazla Mesai", color: "text-amber-700", border: "border-amber-500" },
            ].map((s, i) => (
              <div key={i} className={`bg-white rounded-2xl shadow-md p-3 flex flex-col items-center justify-center gap-2 border-b-4 ${s.border}`}>
                <span className={`material-symbols-outlined ${s.color} text-[24px]`}>{s.icon}</span>
                <span className={`text-2xl font-semibold ${s.color}`}>{s.value}</span>
                <span className="text-xs font-semibold text-gray-500 text-center">{s.label}</span>
              </div>
            ))}
          </div>

          {[
            { icon: "event_busy", label: "Ücretsiz İzin", sub: "Bu yıl toplam", value: "5 Gün", bg: "bg-blue-800", color: "text-blue-800" },
            { icon: "calendar_today", label: "Yıllık İzin", sub: "Kalan bakiye", value: "14 Gün", bg: "bg-blue-800", color: "text-blue-800" },
            { icon: "medical_information", label: "Doktor Raporu", sub: "Bu yıl toplam", value: "3 Gün", bg: "bg-red-600", color: "text-red-600" },
            { icon: "work_history", label: "Yapılan Mesai", sub: "Yıllık toplam", value: "186 Saat", bg: "bg-amber-700", color: "text-amber-700" },
            { icon: "verified", label: "Performans Puanı", sub: "Hedefin %15 üzerinde", value: "4.9/5", bg: "bg-green-600", color: "text-green-600" },
          ].map((item, i) => (
            <div key={i} className="bg-gray-100 rounded-2xl p-4 flex items-center justify-between mt-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${item.bg} flex items-center justify-center shadow-md`}>
                  <span className="material-symbols-outlined text-white">{item.icon}</span>
                </div>
                <div>
                  <p className="text-base font-bold">{item.label}</p>
                  <p className="text-xs font-semibold text-gray-500">{item.sub}</p>
                </div>
              </div>
              <span className={`text-2xl font-semibold ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
