"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Patrol, PatrolCheckpoint, PatrolAssignment } from "@/lib/types";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const defaultCheckpoints = [
  "Ana Giriş", "Otopark A1", "B Blok Girişi", "Arka Bahçe",
  "Depo Bölgesi", "C Blok Yanı", "Teknik Oda", "Ana Giriş (Dönüş)",
];

interface AvailableRoute {
  id: string;
  name: string;
  points: { name: string; point_order: number }[];
}

const patrolTips = [
  {
    emoji: "🎯",
    badge: "Taktik İpucu",
    title: "Düzeni Kır!",
    text: "Sürekli aynı yönde ve aynı hızda devriye atma. Düzenli hareket tahmin edilebilir olur — seni izleyen biri varsa fark eder.",
    gradient: "from-blue-600 to-indigo-700",
    badgeBg: "bg-white/20",
  },
  {
    emoji: "👁️",
    badge: "Kör Nokta Uyarısı",
    title: "Köşelere Dikkat!",
    text: "Otopark gibi açık alanlarda araçların arasını ve kör köşeleri mutlaka kontrol et. Tehdit her zaman görünür yerden gelmez.",
    gradient: "from-slate-700 to-gray-800",
    badgeBg: "bg-yellow-400/30",
  },
  {
    emoji: "💡",
    badge: "Çevre Taraması",
    title: "Aydınlatmayı Kontrol Et!",
    text: "Yanmayan lambalar, kırık kameralar, açık kalmış kapılar — bunlar küçük detay gibi görünse de büyük açıkların habercisidir. Rapor et!",
    gradient: "from-amber-500 to-orange-600",
    badgeBg: "bg-white/20",
  },
  {
    emoji: "🌿",
    badge: "Açık Alan Taraması",
    title: "Arka Bahçe Sessizce Konuşur",
    text: "Dış alanlar gece en riskli bölgelerdir. Alışılmadık sesler, hareket veya yabancı objeler gördüğünde durma — önce değerlendir.",
    gradient: "from-emerald-600 to-teal-700",
    badgeBg: "bg-white/20",
  },
  {
    emoji: "🔒",
    badge: "Güvenlik Kontrolü",
    title: "Kilitleri İki Kez Kontrol Et!",
    text: "Depo kapıları güvenlik zincirinin en zayıf halkasıdır. Kilit var ama kapı kilitli mi? Her zaman fiziksel olarak dene.",
    gradient: "from-rose-600 to-red-700",
    badgeBg: "bg-white/20",
  },
  {
    emoji: "🧠",
    badge: "Psikoloji",
    title: "Kararlı Dur, Caydır!",
    text: "Birileriyle göz teması kur, dimdik yürü. Kararlı duruş tek başına güçlü bir caydırıcıdır — güvensizlik davranışları yansıtma.",
    gradient: "from-violet-600 to-purple-700",
    badgeBg: "bg-white/20",
  },
  {
    emoji: "⚡",
    badge: "Teknik Bölge",
    title: "Teknik Oda Risk Noktası!",
    text: "Elektrik panoları, sunucu odaları ve teknik alanlarda olağandışı koku, ses veya ısı varsa hemen bildir. Yangının %60'ı teknik arızadan çıkar.",
    gradient: "from-yellow-500 to-amber-600",
    badgeBg: "bg-white/20",
  },
  {
    emoji: "🏆",
    badge: "Son Nokta!",
    title: "Neredeyse Bitti, Odaklan!",
    text: "Son nokta en tehlikeli andır — dikkat dağılmaya başlar. Geri dönüş rotasında da tetikte ol, devriye bitmeden güvenli değilsin.",
    gradient: "from-green-600 to-emerald-700",
    badgeBg: "bg-white/20",
  },
];

export default function DevriyePage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [checkpoints, setCheckpoints] = useState<PatrolCheckpoint[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [availableRoutes, setAvailableRoutes] = useState<AvailableRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<PatrolAssignment[]>([]);
  const [assignmentRoute, setAssignmentRoute] = useState<AvailableRoute | null>(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [startingAssignment, setStartingAssignment] = useState<string | null>(null);

  const completed = checkpoints.filter(c => c.status === "completed").length;
  const total = checkpoints.length || defaultCheckpoints.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const activeCheckpoint = checkpoints.find(c => c.status === "active");
  const allDone = checkpoints.length > 0 && checkpoints.every(c => c.status === "completed");

  useEffect(() => {
    if (!personnel) return;
    loadActivePatrol();
    loadAvailableRoutes();
    loadTodayAssignments();
  }, [personnel]);

  async function loadAvailableRoutes() {
    if (!personnel) return;
    const { data } = await supabase
      .from("patrol_routes")
      .select("id, name, points:patrol_route_points(name, point_order)")
      .eq("is_active", true)
      .or(`location_id.eq.${personnel.location_id ?? "00000000-0000-0000-0000-000000000000"},location_id.is.null`)
      .order("created_at", { ascending: false });

    if (data) {
      const routes = data.map((r: any) => ({
        ...r,
        points: [...(r.points || [])].sort((a: any, b: any) => a.point_order - b.point_order),
      }));
      setAvailableRoutes(routes);
      if (routes.length > 0) setSelectedRouteId(routes[0].id);
    }
  }

  function generateTimeSlots(startTime: string, intervalMinutes: number, endTime: string | null): string[] {
    const slots: string[] = [];
    const [sh, sm] = startTime.split(":").map(Number);
    let cur = sh * 60 + sm;
    const end = endTime
      ? (() => { const [eh, em] = endTime.split(":").map(Number); return eh * 60 + em; })()
      : cur;
    while (cur <= end) {
      slots.push(`${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`);
      cur += intervalMinutes;
    }
    return slots;
  }

  async function loadTodayAssignments() {
    if (!personnel) return;
    const today = new Date();
    const dow = today.getDay();
    if (dow === 0 || dow === 6) return; // hafta sonu

    const dateStr = toDateStr(today);

    // Bugünkü vardiya kodu
    const { data: sa } = await supabase
      .from("shift_assignments")
      .select("shift_code")
      .eq("personnel_id", personnel.id)
      .eq("shift_date", dateStr)
      .eq("status", "published")
      .maybeSingle();

    if (!sa?.shift_code) return;

    // Bu vardiyaya ait aktif plan
    const { data: scheds } = await supabase
      .from("patrol_schedules")
      .select("id, start_time, interval_minutes, end_time, route_id")
      .eq("shift_code", sa.shift_code)
      .in("day_type", ["weekday", "everyday"])
      .eq("is_active", true);

    if (!scheds || scheds.length === 0) return;

    // Personelin lokasyonuyla eşleşen rota bul
    const routeIds = scheds.map((s: any) => s.route_id);
    const locFilter = personnel.location_id
      ? `location_id.eq.${personnel.location_id},location_id.is.null`
      : "location_id.is.null";

    const { data: routes } = await supabase
      .from("patrol_routes")
      .select("id, name, location_id, patrol_route_points(id, name, point_order)")
      .in("id", routeIds)
      .eq("is_active", true)
      .or(locFilter);

    if (!routes || routes.length === 0) return;

    const matchedRoute = routes[0] as any;
    const matchedSched = scheds.find((s: any) => s.route_id === matchedRoute.id) ?? scheds[0] as any;

    setAssignmentRoute({
      id: matchedRoute.id,
      name: matchedRoute.name,
      points: [...(matchedRoute.patrol_route_points || [])].sort((a: any, b: any) => a.point_order - b.point_order),
    });

    // Zaman dilimlerini oluştur ve upsert et
    const slots = generateTimeSlots(matchedSched.start_time, matchedSched.interval_minutes, matchedSched.end_time);
    if (slots.length > 0) {
      await supabase.from("patrol_assignments").upsert(
        slots.map(time => ({
          personnel_id: personnel.id,
          route_id: matchedRoute.id,
          date: dateStr,
          scheduled_time: time,
        })),
        { onConflict: "personnel_id,date,scheduled_time", ignoreDuplicates: true }
      );
    }

    // Mevcut atamaları yükle, geçirilenleri güncelle
    const { data: existing } = await supabase
      .from("patrol_assignments")
      .select("*")
      .eq("personnel_id", personnel.id)
      .eq("date", dateStr)
      .order("scheduled_time");

    if (!existing) return;

    const nowMin = today.getHours() * 60 + today.getMinutes();
    const missedIds = existing
      .filter(a => {
        const [h, m] = a.scheduled_time.slice(0, 5).split(":").map(Number);
        return a.status === "pending" && nowMin > h * 60 + m + matchedSched.interval_minutes;
      })
      .map(a => a.id);

    if (missedIds.length > 0) {
      await supabase.from("patrol_assignments").update({ status: "missed" }).in("id", missedIds);
    }

    setAssignments(existing.map(a =>
      missedIds.includes(a.id) ? { ...a, status: "missed" as const } : a
    ));
  }

  async function startAssignedPatrol(assignment: PatrolAssignment) {
    if (!personnel || !assignmentRoute) return;
    setStartingAssignment(assignment.id);

    const cpNames = assignmentRoute.points.length > 0
      ? assignmentRoute.points.map(p => p.name)
      : defaultCheckpoints;

    const { data: newPatrol, error } = await supabase.from("patrols").insert({
      department_id: personnel.department_id,
      personnel_id: personnel.id,
      route_name: assignmentRoute.name,
      status: "active",
      total_checkpoints: cpNames.length,
      completed_checkpoints: 0,
    }).select().single();

    if (error || !newPatrol) { setStartingAssignment(null); return; }

    await supabase.from("patrol_assignments")
      .update({ status: "active", patrol_id: newPatrol.id })
      .eq("id", assignment.id);

    setActiveAssignmentId(assignment.id);

    const cpInserts = cpNames.map((name, i) => ({
      patrol_id: newPatrol.id,
      checkpoint_order: i + 1,
      name,
      status: i === 0 ? "active" : "pending",
    }));
    await supabase.from("patrol_checkpoints").insert(cpInserts);

    setPatrol(newPatrol);
    setSeconds(0);
    setStartingAssignment(null);

    const { data: cps } = await supabase
      .from("patrol_checkpoints")
      .select("*")
      .eq("patrol_id", newPatrol.id)
      .order("checkpoint_order");
    setCheckpoints(cps || []);
  }

  useEffect(() => {
    if (paused || !patrol) return;
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [paused, patrol]);

  async function loadActivePatrol() {
    if (!personnel) return;
    const { data } = await supabase
      .from("patrols")
      .select("*")
      .eq("personnel_id", personnel.id)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setPatrol(data);
      if (data.status === "paused") setPaused(true);
      const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000);
      setSeconds(elapsed);
      const [cpsRes, assignRes] = await Promise.all([
        supabase.from("patrol_checkpoints").select("*").eq("patrol_id", data.id).order("checkpoint_order"),
        supabase.from("patrol_assignments").select("id").eq("patrol_id", data.id).maybeSingle(),
      ]);
      setCheckpoints(cpsRes.data || []);
      if (assignRes.data) setActiveAssignmentId(assignRes.data.id);
    }
    setLoading(false);
  }

  async function startNewPatrol() {
    if (!personnel) return;

    const route = availableRoutes.find(r => r.id === selectedRouteId);
    const cpNames = route && route.points.length > 0
      ? route.points.map(p => p.name)
      : defaultCheckpoints;
    const routeName = route ? route.name : "Ana Bina Çevresi";

    const { data: newPatrol, error } = await supabase.from("patrols").insert({
      department_id: personnel.department_id,
      personnel_id: personnel.id,
      route_name: routeName,
      status: "active",
      total_checkpoints: cpNames.length,
      completed_checkpoints: 0,
    }).select().single();

    if (error || !newPatrol) return;

    const cpInserts = cpNames.map((name, i) => ({
      patrol_id: newPatrol.id,
      checkpoint_order: i + 1,
      name,
      status: i === 0 ? "active" : "pending",
    }));

    await supabase.from("patrol_checkpoints").insert(cpInserts);
    setPatrol(newPatrol);
    setSeconds(0);

    const { data: cps } = await supabase
      .from("patrol_checkpoints")
      .select("*")
      .eq("patrol_id", newPatrol.id)
      .order("checkpoint_order");
    setCheckpoints(cps || []);
  }

  async function scanCheckpoint() {
    if (!patrol || !activeCheckpoint) return;
    const now = new Date().toISOString();

    await supabase.from("patrol_checkpoints").update({ status: "completed", scanned_at: now }).eq("id", activeCheckpoint.id);

    const nextCp = checkpoints.find(c => c.checkpoint_order === activeCheckpoint.checkpoint_order + 1);
    if (nextCp) {
      await supabase.from("patrol_checkpoints").update({ status: "active" }).eq("id", nextCp.id);
    }

    const newCompleted = completed + 1;
    await supabase.from("patrols").update({ completed_checkpoints: newCompleted }).eq("id", patrol.id);

    const { data: cps } = await supabase.from("patrol_checkpoints").select("*").eq("patrol_id", patrol.id).order("checkpoint_order");
    setCheckpoints(cps || []);
  }

  async function togglePause() {
    if (!patrol) return;
    const newStatus = paused ? "active" : "paused";
    await supabase.from("patrols").update({ status: newStatus }).eq("id", patrol.id);
    setPaused(!paused);
  }

  async function finishPatrol() {
    if (!patrol) return;
    await supabase.from("patrols").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      duration_seconds: seconds,
    }).eq("id", patrol.id);

    if (activeAssignmentId) {
      await supabase.from("patrol_assignments").update({ status: "completed" }).eq("id", activeAssignmentId);
      setPatrol(null);
      setCheckpoints([]);
      setSeconds(0);
      setPaused(false);
      setActiveAssignmentId(null);
      await loadTodayAssignments();
    } else {
      router.push("/dashboard");
    }
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span></div>;
  }

  if (!patrol && assignments.length > 0) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const statusCfg = {
      pending:   { label: "Bekleniyor",  bg: "bg-gray-100",    text: "text-gray-500",    icon: "schedule",     border: "border-l-gray-200" },
      active:    { label: "Aktif",        bg: "bg-blue-100",    text: "text-blue-700",    icon: "play_circle",  border: "border-l-blue-600" },
      completed: { label: "Tamamlandı",  bg: "bg-emerald-100", text: "text-emerald-700", icon: "check_circle", border: "border-l-emerald-400" },
      missed:    { label: "Geçirildi",   bg: "bg-red-100",     text: "text-red-600",     icon: "cancel",       border: "border-l-red-400" },
    };
    return (
      <div className="bg-[#f8f9ff] min-h-screen pb-24">
        <header className="bg-white shadow-sm sticky top-0 z-50 flex justify-between items-center px-6 h-16">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-blue-800">arrow_back</span>
            </button>
            <h1 className="text-xl font-bold text-blue-800">Devriye Görevleri</h1>
          </div>
          <span className="text-xs font-semibold text-gray-400">
            {now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </header>

        <main className="px-6 pt-5 space-y-4">
          {assignmentRoute && (
            <div className="bg-indigo-50 rounded-2xl p-4 flex items-center gap-3 border border-indigo-100">
              <div className="w-10 h-10 rounded-xl bg-[#3949AB] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Atanmış Rota</p>
                <p className="text-sm font-bold text-indigo-800">{assignmentRoute.name}</p>
                <p className="text-xs text-indigo-400">{assignmentRoute.points.length} kontrol noktası</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {assignments.map(a => {
              const [h, m] = a.scheduled_time.slice(0, 5).split(":").map(Number);
              const slotMin = h * 60 + m;
              const canStart = a.status === "pending" && nowMin >= slotMin - 15;
              const cfg = statusCfg[a.status] ?? statusCfg.pending;
              return (
                <div key={a.id} className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${cfg.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${
                        a.status === "completed" ? "bg-emerald-100" :
                        a.status === "missed"    ? "bg-red-100" :
                        a.status === "active"    ? "bg-blue-100" : "bg-indigo-50"
                      }`}>
                        <span className={`text-base font-bold leading-tight ${
                          a.status === "completed" ? "text-emerald-700" :
                          a.status === "missed"    ? "text-red-600" :
                          a.status === "active"    ? "text-blue-700" : "text-indigo-700"
                        }`}>{a.scheduled_time.slice(0, 5)}</span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{a.scheduled_time.slice(0, 5)} Devriyesi</p>
                        <p className="text-xs text-gray-400 mt-0.5">{assignmentRoute?.name ?? "—"}</p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 ${cfg.bg} ${cfg.text} text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0`}>
                      <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                      {cfg.label}
                    </span>
                  </div>

                  {canStart && (
                    <button
                      onClick={() => startAssignedPatrol(a)}
                      disabled={!!startingAssignment}
                      className="w-full mt-3 py-3.5 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all shadow-sm"
                      style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
                    >
                      {startingAssignment === a.id
                        ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>}
                      {startingAssignment === a.id ? "Başlatılıyor..." : "Devriyeyi Başlat"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-blue-50 rounded-2xl p-4 flex gap-3 border border-blue-100">
            <span className="material-symbols-outlined text-blue-600 text-[20px] flex-shrink-0">info</span>
            <p className="text-xs text-blue-700 font-semibold leading-relaxed">
              Devriyeleri 15 dakika erken başlatabilirsin. Tüm noktaları tamamladıktan sonra devriyeyi bitir.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (!patrol) {
    const selectedRoute = availableRoutes.find(r => r.id === selectedRouteId);
    return (
      <div className="bg-[#f8f9ff] min-h-screen flex flex-col items-center justify-center px-6 gap-6">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-blue-800 text-[40px]">route</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 text-center">Aktif Devriye Yok</h2>
        <p className="text-gray-500 text-center text-sm">Devriye rotasını seçip başlatın.</p>

        {availableRoutes.length > 0 && (
          <div className="w-full space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Rota Seç</p>
            {availableRoutes.map(r => (
              <button key={r.id} onClick={() => setSelectedRouteId(r.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${selectedRouteId === r.id ? "border-blue-700 bg-blue-50" : "border-gray-200 bg-white"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${selectedRouteId === r.id ? "bg-blue-700" : "bg-gray-100"}`}>
                  <span className={`material-symbols-outlined text-[16px] ${selectedRouteId === r.id ? "text-white" : "text-gray-400"}`} style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${selectedRouteId === r.id ? "text-blue-800" : "text-gray-700"}`}>{r.name}</p>
                  <p className="text-xs text-gray-400">{r.points.length} kontrol noktası</p>
                </div>
                {selectedRouteId === r.id && (
                  <span className="material-symbols-outlined text-blue-700 text-[20px]">check_circle</span>
                )}
              </button>
            ))}
          </div>
        )}

        {selectedRoute && selectedRoute.points.length > 0 && (
          <div className="w-full bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Kontrol Noktaları</p>
            <div className="space-y-1.5">
              {selectedRoute.points.map(pt => (
                <div key={pt.point_order} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-blue-700">{pt.point_order}</span>
                  </div>
                  <span className="text-sm text-gray-600">{pt.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={startNewPatrol}
          className="w-full py-4 text-white rounded-2xl text-base font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
          Devriye Başlat
        </button>
        <button onClick={() => router.push("/dashboard")} className="text-blue-800 text-sm font-semibold">Geri Dön</button>
      </div>
    );
  }

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-24 relative">
      <header className="bg-gray-50 shadow-sm sticky top-0 z-50 flex justify-between items-center px-6 h-16 w-full">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/dashboard")} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-blue-800">arrow_back</span>
          </button>
          <h1 className="text-2xl font-semibold text-blue-800">Aktif Devriye</h1>
        </div>
      </header>

      <main className="px-6 pt-4 space-y-6">
        {/* Summary */}
        <section className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mevcut Rota</p>
              <h2 className="text-2xl font-semibold">{patrol.route_name}</h2>
            </div>
            <div className="bg-blue-700 text-white px-4 py-1 rounded-full flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">timer</span>
              <span className="text-sm font-semibold">{formatTime(seconds)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-gray-500">Tamamlanma Oranı</span>
              <span className="text-blue-800">{completed} / {total} Nokta</span>
            </div>
            <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: "linear-gradient(to right, #00BCD4, #3949AB)" }} />
            </div>
          </div>
        </section>

        {/* Motivasyon Kartı */}
        {activeCheckpoint && (() => {
          const tip = patrolTips[(activeCheckpoint.checkpoint_order - 1) % patrolTips.length];
          return (
            <section className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${tip.gradient} p-5 shadow-lg`}>
              <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
              <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5" />
              <div className="relative z-10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-widest text-white/80 ${tip.badgeBg} px-3 py-1 rounded-full`}>
                    {tip.badge}
                  </span>
                  <span className="text-3xl">{tip.emoji}</span>
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg leading-tight">{tip.title}</h4>
                  <p className="text-white/80 text-sm leading-relaxed mt-1">{tip.text}</p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  {patrolTips.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all ${i === (activeCheckpoint.checkpoint_order - 1) % patrolTips.length ? "w-6 bg-white" : "w-2 bg-white/30"}`} />
                  ))}
                </div>
              </div>
            </section>
          );
        })()}

        {/* Hızlı Aksiyonlar */}
        <section className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push(`/olay-bildir?patrol_id=${patrol.id}`)}
            className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-800 text-white font-bold text-sm active:scale-95 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>report</span>
            Olay Bildir
          </button>
          <button
            onClick={() => {}}
            className="relative flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-600 text-white font-bold text-sm active:scale-95 transition-all shadow-sm overflow-hidden"
          >
            <span className="absolute inset-0 rounded-2xl animate-ping bg-red-400 opacity-30" />
            <span className="relative material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>emergency_share</span>
            <span className="relative">SOS</span>
          </button>
        </section>

        {/* Checkpoints */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-semibold">Kontrol Noktaları</h3>
            <span className="text-sm font-semibold text-gray-400">
              {activeCheckpoint ? `Sıradaki: Nokta ${activeCheckpoint.checkpoint_order}` : "Tamamlandı"}
            </span>
          </div>
          <div className="space-y-4">
            {checkpoints.map(cp => (
              <div key={cp.id}>
                {cp.status === "completed" && (
                  <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border-l-4 border-l-[#43A047] shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                      <span className="material-symbols-outlined">check_circle</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-bold text-green-800">Nokta {cp.checkpoint_order}: {cp.name}</p>
                      <p className="text-xs font-semibold text-green-600">{cp.scanned_at ? new Date(cp.scanned_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : ""} tamamlandı</p>
                    </div>
                  </div>
                )}
                {cp.status === "active" && (
                  <div className="flex flex-col gap-4 p-4 bg-white rounded-2xl border-2 border-blue-700 shadow-md scale-[1.02]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center">
                        <span className="material-symbols-outlined">location_on</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-bold text-blue-800">Nokta {cp.checkpoint_order}: {cp.name}</p>
                        <p className="text-xs font-semibold text-gray-500">Hedefe ulaşıldı, lütfen okutun</p>
                      </div>
                    </div>
                    <button onClick={scanCheckpoint}
                      className="w-full py-4 text-white rounded-full font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-200"
                      style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                      <span className="material-symbols-outlined">nfc</span>
                      OKUT (NFC / QR)
                    </button>
                  </div>
                )}
                {cp.status === "pending" && (
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl opacity-60 grayscale">
                    <div className="w-10 h-10 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center">
                      <span className="material-symbols-outlined">radio_button_unchecked</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-medium text-gray-500">Nokta {cp.checkpoint_order}: {cp.name}</p>
                      <p className="text-xs font-semibold text-gray-400">Henüz ulaşılamadı</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom Actions */}
      <div className="sticky bottom-0 w-full bg-white px-6 py-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] border-t border-gray-200 flex gap-4 z-50">
        <button onClick={togglePause} className="flex-1 py-4 rounded-2xl border-2 border-gray-300 text-gray-600 font-bold flex items-center justify-center gap-2 active:scale-95 transition-all">
          <span className="material-symbols-outlined">{paused ? "play_circle" : "pause_circle"}</span>
          {paused ? "Devam Et" : "Duraklat"}
        </button>
        <button onClick={finishPatrol} disabled={!allDone}
          className={`flex-[1.5] py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${allDone ? "bg-green-600 text-white active:scale-95" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
          <span className="material-symbols-outlined">task_alt</span>
          Devriyeyi Bitir
        </button>
      </div>

    </div>
  );
}
