"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ShiftCode = "T211" | "G1" | "G2" | "OFF" | null;

interface Employee {
  id: number;
  initials: string;
  name: string;
  role: string;
  avatarColor: string;
  shifts: ShiftCode[];
}

const DAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const SHIFT_OPTIONS: ShiftCode[] = ["T211", "G1", "G2", "OFF", null];

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 1,
    initials: "ME",
    name: "Murat Erkan",
    role: "Güvenlik Amiri",
    avatarColor: "bg-blue-600",
    shifts: ["T211", "G1", "G1", "T211", "G1", null, null],
  },
  {
    id: 2,
    initials: "AY",
    name: "Ahmet Yılmaz",
    role: "Gece Bekçisi",
    avatarColor: "bg-emerald-500",
    shifts: ["G2", "G2", "G2", "OFF", "G2", null, null],
  },
  {
    id: 3,
    initials: "SD",
    name: "Selin Demir",
    role: "Resepsiyon Güvenlik",
    avatarColor: "bg-orange-400",
    shifts: ["G1", "G1", "OFF", null, null, null, null],
  },
  {
    id: 4,
    initials: "CK",
    name: "Canan Kaya",
    role: "Güvenlik Görevlisi",
    avatarColor: "bg-purple-500",
    shifts: ["T211", null, "G1", "G1", "T211", null, "OFF"],
  },
];

function ShiftBadge({
  code,
  active,
  onClick,
}: {
  code: ShiftCode;
  active?: boolean;
  onClick?: () => void;
}) {
  if (!code) {
    return (
      <button
        onClick={onClick}
        className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center active:bg-gray-50 transition-colors"
      >
        <span className="material-symbols-outlined text-gray-300 text-[18px]">add</span>
      </button>
    );
  }

  const isOff = code === "OFF";

  return (
    <button
      onClick={onClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all active:scale-90 ${
        active
          ? "bg-[#1a2b6b] text-white shadow-md"
          : isOff
          ? "bg-gray-100 text-gray-400"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {code}
    </button>
  );
}

export default function VardiyaOlusturmaPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [activeCell, setActiveCell] = useState<{ empId: number; dayIdx: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);

  function cycleShift(empId: number, dayIdx: number) {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const cur = emp.shifts[dayIdx];
        const curIdx = SHIFT_OPTIONS.indexOf(cur);
        const next = SHIFT_OPTIONS[(curIdx + 1) % SHIFT_OPTIONS.length];
        const newShifts = [...emp.shifts];
        newShifts[dayIdx] = next;
        return { ...emp, shifts: newShifts };
      })
    );
    setActiveCell({ empId, dayIdx });
  }

  const totalShifts = employees.flatMap((e) => e.shifts).filter(Boolean).length;
  const overtime = employees.flatMap((e) => e.shifts).filter((s) => s === "G2").length;
  const active = employees.filter((e) => e.shifts.some(Boolean)).length;

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handlePublish() {
    setPublished(true);
    setTimeout(() => setPublished(false), 2000);
  }

  return (
    <div className="flex flex-col min-h-screen bg-white pb-[152px]">

      {/* Header */}
      <header className="bg-white px-4 h-14 flex items-center justify-between border-b border-gray-100 sticky top-0 z-30">
        <span className="text-lg font-extrabold text-[#1a2b6b] tracking-wide">AYTES</span>
        <button className="flex items-center gap-1.5 bg-gray-100 rounded-xl px-3 py-1.5 active:bg-gray-200 transition-colors">
          <span className="text-sm font-semibold text-gray-700">Genel Merkez</span>
          <span className="material-symbols-outlined text-gray-500 text-[18px]">keyboard_arrow_down</span>
        </button>
        <div className="w-9 h-9 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 flex flex-col gap-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Toplam Çalışma", value: `${totalShifts * 8}s`, color: "text-blue-600" },
            { label: "Fazla Mesai", value: `${overtime * 4}s`, color: "text-emerald-600" },
            { label: "Aktif Personel", value: `${active}`, color: "text-gray-800" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-gray-400 leading-tight">{stat.label}</span>
              <span className={`text-xl font-extrabold ${stat.color}`}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Section heading */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">Vardiya Girişi</span>
          <div className="flex items-center gap-1.5 text-gray-500">
            <span className="text-xs font-semibold">20 – 26 Mayıs</span>
            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
          </div>
        </div>

        {/* Employee cards */}
        <div className="flex flex-col gap-3">
          {employees.map((emp) => (
            <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Employee header */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <div className={`w-10 h-10 rounded-full ${emp.avatarColor} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                  {emp.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                  <p className="text-xs text-gray-400 truncate">{emp.role}</p>
                </div>
                <button className="p-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors">
                  <span className="material-symbols-outlined text-gray-400 text-[20px]">more_vert</span>
                </button>
              </div>

              {/* Shift row — horizontally scrollable */}
              <div
                className="flex gap-3 px-4 pb-4 overflow-x-auto"
                style={{ scrollbarWidth: "none" }}
              >
                {DAYS.map((day, di) => {
                  const isActive =
                    activeCell?.empId === emp.id && activeCell?.dayIdx === di;
                  return (
                    <div key={di} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] font-semibold ${isActive ? "text-[#1a2b6b]" : "text-gray-400"}`}>
                        {day}
                      </span>
                      <ShiftBadge
                        code={emp.shifts[di]}
                        active={isActive}
                        onClick={() => cycleShift(emp.id, di)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Bottom action bar — above BottomNav (h-20 = 80px) */}
      <div className="fixed bottom-20 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-3 z-40">
        <button
          onClick={handleSave}
          className={`flex-1 py-3.5 rounded-2xl font-bold text-sm border-2 transition-all active:scale-95 ${
            saved
              ? "border-emerald-500 text-emerald-600 bg-emerald-50"
              : "border-gray-200 text-gray-600 bg-white"
          }`}
        >
          {saved ? "Kaydedildi ✓" : "Kaydet"}
        </button>
        <button
          onClick={handlePublish}
          className={`flex-[2] py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${
            published
              ? "bg-emerald-600 text-white"
              : "bg-[#1a2b6b] text-white"
          }`}
        >
          {published ? (
            <>
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Yayınlandı
            </>
          ) : (
            <>
              Yayınla
              <span className="material-symbols-outlined text-[18px]">send</span>
            </>
          )}
        </button>
      </div>

      {/* Toast */}
      {(saved || published) && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#1a2b6b] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg whitespace-nowrap">
          {saved ? "Vardiyalar kaydedildi" : "Vardiyalar yayınlandı"}
        </div>
      )}
    </div>
  );
}
