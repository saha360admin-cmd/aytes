"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Patrol, PatrolCheckpoint } from "@/lib/types";

const defaultCheckpoints = [
  "Ana Giriş", "Otopark A1", "B Blok Girişi", "Arka Bahçe",
  "Depo Bölgesi", "C Blok Yanı", "Teknik Oda", "Ana Giriş (Dönüş)",
];

interface AvailableRoute {
  id: string;
  name: string;
  points: { name: string; point_order: number }[];
}

interface PatrolPlanRef {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  interval_minutes: number;
}

interface MyAssignment {
  id: string;
  plan_id: string;
  assigned_date: string;
  status: "assigned" | "started" | "completed" | "missed";
  patrol_id: string | null;
  plan: PatrolPlanRef | null;
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

function timeToMin(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function calcCheckpoints(startTime: string, endTime: string, intervalMin: number): number {
  let ps = timeToMin(startTime), pe = timeToMin(endTime);
  if (pe < ps) pe += 1440;
  return Math.floor((pe - ps) / intervalMin) + 1;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    assigned:  { label: "Atandı",     cls: "bg-amber-100 text-amber-700" },
    started:   { label: "Başladı",    cls: "bg-blue-100 text-blue-700" },
    completed: { label: "Tamamlandı", cls: "bg-emerald-100 text-emerald-700" },
    missed:    { label: "Kaçırıldı",  cls: "bg-red-100 text-red-700" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`rounded-full text-xs font-bold px-2.5 py-1 ${cls}`}>{label}</span>;
}

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

  // My assignments for today
  const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([]);
  const [startingAssignmentId, setStartingAssignmentId] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const completed = checkpoints.filter(c => c.status === "completed").length;
  const total = checkpoints.length || defaultCheckpoints.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const activeCheckpoint = checkpoints.find(c => c.status === "active");
  const allDone = checkpoints.length > 0 && checkpoints.every(c => c.status === "completed");

  useEffect(() => {
    if (!personnel) return;
    loadActivePatrol();
    loadAvailableRoutes();
    loadMyAssignments();
  }, [personnel]);

  async function loadMyAssignments() {
    if (!personnel) return;
    const { data } = await supabase
      .from("patrol_assignments")
      .select("*, plan:plan_id(id, name, start_time, end_time, interval_minutes)")
      .eq("personnel_id", personnel.id)
      .eq("assigned_date", todayStr)
      .in("status", ["assigned", "started"]);
    setMyAssignments((data || []) as MyAssignment[]);
  }

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
      const { data: cps } = await supabase
        .from("patrol_checkpoints")
        .select("*")
        .eq("patrol_id", data.id)
        .order("checkpoint_order");
      setCheckpoints(cps || []);
    }
    setLoading(false);
  }

  async function startFromAssignment(assignment: MyAssignment) {
    if (!personnel || !assignment.plan) return;
    setStartingAssignmentId(assignment.id);

    const plan = assignment.plan;
    const totalCps = calcCheckpoints(plan.start_time, plan.end_time, plan.interval_minutes);

    const { data: newPatrol, error } = await supabase.from("patrols").insert({
      department_id: personnel.department_id,
      personnel_id: personnel.id,
      route_name: plan.name,
      status: "active",
      started_at: new Date().toISOString(),
      total_checkpoints: totalCps,
      completed_checkpoints: 0,
    }).select("*").single();

    if (error || !newPatrol) {
      setStartingAssignmentId(null);
      return;
    }

    await supabase.from("patrol_assignments").update({
      patrol_id: newPatrol.id,
      status: "started",
    }).eq("id", assignment.id);

    // update local assignment state
    setMyAssignments(prev => prev.map(a =>
      a.id === assignment.id ? { ...a, status: "started", patrol_id: newPatrol.id } : a
    ));

    setPatrol(newPatrol);
    setSeconds(0);
    setCheckpoints([]);
    setStartingAssignmentId(null);
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

    // Also mark assignment as completed if exists
    const relatedAssignment = myAssignments.find(a => a.patrol_id === patrol.id);
    if (relatedAssignment) {
      await supabase.from("patrol_assignments").update({ status: "completed" }).eq("id", relatedAssignment.id);
    }

    router.push("/dashboard");
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

  if (!patrol) {
    const selectedRoute = availableRoutes.find(r => r.id === selectedRouteId);
    return (
      <div className="bg-[#f0f2ff] min-h-screen pb-10">

        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
          style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
          <button onClick={() => router.push("/dashboard")}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-white text-lg leading-tight">Devriye</h1>
          </div>
        </header>

        <div className="px-4 pt-4 space-y-4">

          {/* ── Bugünkü Atamalarım ── */}
          {myAssignments.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Bugünkü Atamalarım</p>
              <div className="space-y-3">
                {myAssignments.map(asgn => (
                  <div key={asgn.id} className="bg-white rounded-2xl shadow-sm px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                        <span className="material-symbols-outlined text-white text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 text-sm">{asgn.plan?.name ?? "Devriye"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {asgn.plan?.start_time?.slice(0, 5) ?? ""} – {asgn.plan?.end_time?.slice(0, 5) ?? ""}
                        </p>
                        <div className="mt-1.5">
                          <StatusBadge status={asgn.status} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      {asgn.status === "assigned" && (
                        <button
                          onClick={() => startFromAssignment(asgn)}
                          disabled={startingAssignmentId === asgn.id}
                          className="w-full py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                          {startingAssignmentId === asgn.id
                            ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                            : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>}
                          {startingAssignmentId === asgn.id ? "Başlatılıyor..." : "Devriyi Başlat"}
                        </button>
                      )}
                      {asgn.status === "started" && (
                        <button
                          onClick={() => router.push("/devriye")}
                          className="w-full py-3 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                          style={{ background: "linear-gradient(135deg, #1B5E20, #388E3C)" }}>
                          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                          Devam Et
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Manuel Devriye Başlatma ── */}
          <div className="bg-white rounded-2xl shadow-sm px-4 py-6 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-800 text-[36px]">route</span>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-900">Manuel Devriye</h2>
              <p className="text-gray-500 text-sm mt-1">Rota seçip hızlıca başlat</p>
            </div>

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
              <div className="w-full bg-gray-50 rounded-2xl p-4 border border-gray-100">
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
          </div>

          <button onClick={() => router.push("/dashboard")} className="w-full text-center text-blue-800 text-sm font-semibold py-2">Geri Dön</button>
        </div>
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
