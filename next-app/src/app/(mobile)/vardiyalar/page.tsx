"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Shift } from "@/lib/types";

interface TeamMember {
  id: string;
  full_name: string;
  position: string | null;
  avatar_url: string | null;
  phone: string | null;
  status: string;
}

const DAYS_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function getWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      day: DAYS_TR[d.getDay()],
      num: d.getDate(),
      isToday: d.toDateString() === today.toDateString(),
      date: d,
    };
  });
}

function getCurrentShift(shifts: Shift[]): Shift | null {
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  return shifts.find((s) => {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh > sh ? eh * 60 + em : (eh + 24) * 60 + em;
    return hhmm >= start && hhmm < end;
  }) || null;
}

function getShiftIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("gece") || n.includes("gündüz".split("").reverse().join(""))) return "nights_stay";
  if (n.includes("sabah") || n.includes("gündüz") || n.includes("öğlen")) return "light_mode";
  if (n.includes("akşam") || n.includes("öğleden")) return "wb_twilight";
  return "schedule";
}

function getShiftGradient(index: number): string {
  const gradients = [
    "linear-gradient(135deg, #1A237E, #3949AB)",
    "linear-gradient(135deg, #00695C, #00897B)",
    "linear-gradient(135deg, #6A1B9A, #8E24AA)",
    "linear-gradient(135deg, #E65100, #F57C00)",
  ];
  return gradients[index % gradients.length];
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function VardiyalarPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number>(-1); // -1 = today

  const weekDays = getWeekDays();
  const todayIndex = weekDays.findIndex((d) => d.isToday);
  const activeIndex = selectedDay === -1 ? todayIndex : selectedDay;

  useEffect(() => {
    if (!personnel) return;
    loadData();
  }, [personnel]);

  async function loadData() {
    if (!personnel) return;
    const deptId = personnel.department_id;

    const [shiftRes, teamRes] = await Promise.all([
      supabase.from("shifts").select("*").eq("department_id", deptId).order("start_time"),
      supabase.from("personnel").select("id, full_name, position, avatar_url, phone, status")
        .eq("department_id", deptId).eq("status", "active").neq("id", personnel.id).order("full_name"),
    ]);

    setShifts(shiftRes.data || []);
    setTeam((teamRes.data || []) as TeamMember[]);
    setLoading(false);
  }

  const currentShift = getCurrentShift(shifts);
  const now = new Date();
  const monthLabel = `${MONTHS_TR[now.getMonth()]} ${now.getFullYear()}`;

  // Mesai saati hesaplama (tüm vardiyaların toplamı, haftalık tahmin)
  const totalWeeklyHours = shifts.reduce((acc, s) => {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    let dur = (eh * 60 + em) - (sh * 60 + sm);
    if (dur < 0) dur += 24 * 60;
    return acc + dur / 60;
  }, 0);

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Header */}
      <header className="sticky top-0 z-50 w-full h-16 flex items-center justify-between px-4"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-white text-[20px]">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold text-white">Vardiyam</h1>
        </div>
        <div className="flex items-center gap-1 bg-white/15 rounded-full px-3 py-1">
          <span className="material-symbols-outlined text-white text-[16px]">calendar_today</span>
          <span className="text-white text-xs font-bold">{monthLabel}</span>
        </div>
      </header>

      {/* Aktif vardiya bandı */}
      <div className="px-4 pb-5 pt-3" style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        {currentShift ? (
          <div className="bg-white/15 rounded-2xl p-4 border border-white/20">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-300">ŞU AN AKTİF</span>
            </div>
            <p className="text-white font-bold text-lg">{currentShift.name}</p>
            <p className="text-white/75 text-sm mt-0.5">
              {currentShift.start_time.slice(0, 5)} – {currentShift.end_time.slice(0, 5)}
            </p>
          </div>
        ) : (
          <div className="bg-white/10 rounded-2xl p-4 border border-white/20 text-center">
            <p className="text-white/60 text-sm">Şu an aktif vardiya yok</p>
            <p className="text-white/40 text-xs mt-0.5">{now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")} itibarıyla</p>
          </div>
        )}
      </div>
      <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-4 space-y-5">

        {/* Haftalık Takvim */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Bu Hafta</h3>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {weekDays.map((d, i) => (
              <button key={i}
                onClick={() => setSelectedDay(i === activeIndex && selectedDay !== -1 ? -1 : i)}
                className={`flex flex-col items-center justify-center min-w-[50px] h-[70px] rounded-2xl transition-all flex-shrink-0 active:scale-95 ${
                  i === activeIndex ? "text-white shadow-md shadow-indigo-200" : "bg-white text-gray-500 shadow-sm"
                } ${d.isToday && i !== activeIndex ? "ring-2 ring-[#3949AB]" : ""}`}
                style={i === activeIndex ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                <span className="text-[10px] font-bold">{d.day}</span>
                <span className="text-lg font-bold mt-0.5">{d.num}</span>
                {d.isToday && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${i === activeIndex ? "bg-emerald-300" : "bg-[#3949AB]"}`} />
                )}
              </button>
            ))}
          </div>
          {weekDays[activeIndex] && (
            <p className="text-xs text-gray-400 mt-2 font-semibold text-center">
              {weekDays[activeIndex].day}, {weekDays[activeIndex].num} {monthLabel}
              {weekDays[activeIndex].isToday ? " — Bugün" : ""}
            </p>
          )}
        </section>

        {/* Vardiya Listesi */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Departman Vardiyaları</h3>

          {loading ? (
            <div className="flex justify-center py-8">
              <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[32px]">progress_activity</span>
            </div>
          ) : shifts.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[48px] block mb-3">schedule</span>
              <p className="text-gray-400 font-semibold">Vardiya tanımlanmamış</p>
              <p className="text-gray-300 text-xs mt-1">Yöneticiniz henüz vardiya eklememiş</p>
            </div>
          ) : (
            shifts.map((s, idx) => {
              const isCurrent = currentShift?.id === s.id;
              const [sh] = s.start_time.split(":").map(Number);
              const [eh, em] = s.end_time.split(":").map(Number);
              let dur = (eh * 60 + em) - (sh * 60 + Number(s.start_time.split(":")[1]));
              if (dur < 0) dur += 24 * 60;
              const durH = Math.floor(dur / 60);
              const durM = dur % 60;

              return (
                <div key={s.id}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden border-l-4 ${isCurrent ? "border-l-emerald-500 ring-2 ring-emerald-100" : "border-l-[#3949AB]"}`}>
                  {/* Üst kısım — gradyan şerit */}
                  <div className="h-2" style={{ background: getShiftGradient(idx) }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                          style={{ background: getShiftGradient(idx) }}>
                          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {getShiftIcon(s.name)}
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                          </p>
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Aktif
                        </span>
                      ) : (
                        <span className="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-1 rounded-full">
                          {sh < 12 ? "Sabah" : sh < 18 ? "Öğleden Sonra" : "Gece"}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-[10px] font-bold text-gray-400">Süre</p>
                        <p className="text-sm font-bold text-gray-700">{durH > 0 ? `${durH}s` : ""}{durM > 0 ? ` ${durM}dk` : ""}</p>
                      </div>
                      <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-[10px] font-bold text-gray-400">Başlangıç</p>
                        <p className="text-sm font-bold text-gray-700">{s.start_time.slice(0, 5)}</p>
                      </div>
                      <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-[10px] font-bold text-gray-400">Bitiş</p>
                        <p className="text-sm font-bold text-gray-700">{s.end_time.slice(0, 5)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Ekip Üyeleri */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ekibim</h3>
            <span className="text-xs font-bold text-[#3949AB]">{team.length} kişi</span>
          </div>

          {team.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <p className="text-gray-400 text-sm">Ekip üyesi bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {team.map((member) => (
                <div key={member.id} className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full flex-shrink-0 overflow-hidden bg-[#E8EAF6] flex items-center justify-center">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[#3949AB] font-bold text-sm">{getInitials(member.full_name)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm truncate">{member.full_name}</p>
                    {member.position && (
                      <p className="text-xs text-gray-400 truncate">{member.position}</p>
                    )}
                  </div>
                  {member.phone ? (
                    <a href={`tel:${member.phone}`}
                      className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 text-[#3949AB] flex items-center justify-center flex-shrink-0 active:scale-90 transition-all">
                      <span className="material-symbols-outlined text-[18px]">call</span>
                    </a>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-gray-300 text-[18px]">call</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Özet İstatistikler */}
        <section>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Vardiya Özeti</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: "schedule", label: "Tanımlı Vardiya", value: String(shifts.length), color: "text-[#3949AB]", bg: "bg-indigo-50 border-indigo-100" },
              { icon: "timer", label: "Toplam Saat/Gün", value: `${totalWeeklyHours.toFixed(0)}s`, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
              { icon: "group", label: "Aktif Ekip", value: String(team.length), color: "text-purple-600", bg: "bg-purple-50 border-purple-100" },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl p-3 text-center border ${s.bg}`}>
                <span className={`material-symbols-outlined ${s.color} text-[22px]`}>{s.icon}</span>
                <p className={`text-xl font-bold ${s.color} mt-1`}>{s.value}</p>
                <p className="text-[10px] font-bold text-gray-400 leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
