"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Patrol, PatrolCheckpoint, PatrolAssignment } from "@/lib/types";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface RoutePointRow { name: string; point_order: number; detail: string | null; qr_token: string | null }
interface AvailableRoute {
  id: string;
  name: string;
  points: RoutePointRow[];
}

export default function KatKontrolPage() {
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
  const [noDuty, setNoDuty] = useState(false);
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [slotBlockedMsg, setSlotBlockedMsg] = useState<string | null>(null);
  const [schedMeta, setSchedMeta] = useState<{ startMin: number; endMin: number; crossMidnight: boolean } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const runningRef = useRef(false);

  const completed = checkpoints.filter(c => c.status === "completed").length;
  const total = checkpoints.length;
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
      .select("id, name, points:patrol_route_points(name, point_order, detail, qr_token)")
      .eq("is_active", true)
      .eq("department_id", personnel.department_id)
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
    let end = endTime
      ? (() => { const [eh, em] = endTime.split(":").map(Number); return eh * 60 + em; })()
      : cur;
    if (endTime && end < cur) end += 24 * 60;
    while (cur <= end) {
      const wrapped = cur % (24 * 60);
      slots.push(`${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`);
      cur += intervalMinutes;
    }
    return slots;
  }

  async function loadTodayAssignments() {
    if (!personnel) return;
    const today = new Date();
    const dow = today.getDay();
    const isWeekend = dow === 0 || dow === 6;

    if (personnel.role === "personel") setNoDuty(true);

    const dateStr = toDateStr(today);
    const dayTypes = isWeekend ? ["weekend", "everyday"] : ["weekday", "everyday"];

    const { data: sa } = await supabase
      .from("shift_assignments")
      .select("shift_code")
      .eq("personnel_id", personnel.id)
      .eq("shift_date", dateStr)
      .eq("status", "published")
      .maybeSingle();

    if (!sa?.shift_code) return;

    const { data: scheds } = await supabase
      .from("patrol_schedules")
      .select("id, start_time, interval_minutes, end_time, route_id")
      .or(`shift_code.eq.${sa.shift_code},shift_code.is.null`)
      .in("day_type", dayTypes)
      .eq("is_active", true);

    if (!scheds || scheds.length === 0) return;

    const routeIds = scheds.map((s: any) => s.route_id);
    const locFilter = personnel.location_id
      ? `location_id.eq.${personnel.location_id},location_id.is.null`
      : "location_id.is.null";

    const { data: routes } = await supabase
      .from("patrol_routes")
      .select("id, name, location_id, patrol_route_points(id, name, point_order, detail, qr_token)")
      .in("id", routeIds)
      .eq("is_active", true)
      .eq("department_id", personnel.department_id)
      .or(locFilter);

    if (!routes || routes.length === 0) return;

    const matchedRoute = routes[0] as any;
    const matchedSched = scheds.find((s: any) => s.route_id === matchedRoute.id) ?? scheds[0] as any;

    setAssignmentRoute({
      id: matchedRoute.id,
      name: matchedRoute.name,
      points: [...(matchedRoute.patrol_route_points || [])].sort((a: any, b: any) => a.point_order - b.point_order),
    });

    await supabase.from("patrol_assignments")
      .delete()
      .eq("personnel_id", personnel.id)
      .eq("date", dateStr)
      .in("status", ["pending", "missed"]);

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

    const { data: existing } = await supabase
      .from("patrol_assignments")
      .select("*")
      .eq("personnel_id", personnel.id)
      .eq("date", dateStr)
      .order("scheduled_time");

    if (!existing) return;

    const nowMin = today.getHours() * 60 + today.getMinutes();
    const [startH, startM] = matchedSched.start_time.slice(0, 5).split(":").map(Number);
    const startMin = startH * 60 + startM;
    const endMin = matchedSched.end_time
      ? (() => { const [eh, em] = matchedSched.end_time.slice(0, 5).split(":").map(Number); return eh * 60 + em; })()
      : startMin;
    const isCrossMidnight = endMin < startMin;
    setSchedMeta({ startMin, endMin, crossMidnight: isCrossMidnight });
    const isPostMidnight = isCrossMidnight && nowMin < startMin && nowMin <= endMin;
    const adjustedNow = isPostMidnight ? nowMin + 24 * 60 : nowMin;
    const missedIds = existing
      .filter(a => {
        const [h, m] = a.scheduled_time.slice(0, 5).split(":").map(Number);
        let slotMin = h * 60 + m;
        if (isCrossMidnight && slotMin < startMin) slotMin += 24 * 60;
        return a.status === "pending" && adjustedNow > slotMin + matchedSched.interval_minutes;
      })
      .map(a => a.id);

    if (missedIds.length > 0) {
      await supabase.from("patrol_assignments").update({ status: "missed" }).in("id", missedIds);
    }

    const finalAssignments = existing.map(a =>
      missedIds.includes(a.id) ? { ...a, status: "missed" as const } : a
    );
    setAssignments(finalAssignments);
    setNoDuty(false);

    const { data: others } = await supabase
      .from("patrol_assignments")
      .select("scheduled_time")
      .eq("route_id", matchedRoute.id)
      .eq("date", dateStr)
      .in("status", ["active", "completed"])
      .neq("personnel_id", personnel.id);
    setOccupiedSlots((others || []).map((o: any) => o.scheduled_time.slice(0, 5)));
  }

  async function startAssignedPatrol(assignment: PatrolAssignment) {
    if (!personnel || !assignmentRoute || assignmentRoute.points.length === 0) return;
    setStartingAssignment(assignment.id);
    setSlotBlockedMsg(null);

    const { data: conflict } = await supabase
      .from("patrol_assignments")
      .select("id")
      .eq("route_id", assignmentRoute.id)
      .eq("date", assignment.date)
      .eq("scheduled_time", assignment.scheduled_time)
      .in("status", ["active", "completed"])
      .neq("personnel_id", personnel.id)
      .maybeSingle();

    if (conflict) {
      setSlotBlockedMsg("Bu saat dilimi başka bir personel tarafından alındı.");
      setStartingAssignment(null);
      await loadTodayAssignments();
      return;
    }

    const { data: newPatrol, error } = await supabase.from("patrols").insert({
      department_id: personnel.department_id,
      personnel_id: personnel.id,
      route_name: assignmentRoute.name,
      status: "active",
      started_at: new Date().toISOString(),
      total_checkpoints: assignmentRoute.points.length,
      completed_checkpoints: 0,
    }).select().single();

    if (error || !newPatrol) { setStartingAssignment(null); return; }

    await supabase.from("patrol_assignments")
      .update({ status: "active", patrol_id: newPatrol.id })
      .eq("id", assignment.id);

    setActiveAssignmentId(assignment.id);

    const cpInserts = assignmentRoute.points.map((p, i) => ({
      patrol_id: newPatrol.id,
      checkpoint_order: i + 1,
      name: p.name,
      detail: p.detail,
      qr_token: p.qr_token,
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
    if (!route || route.points.length === 0) return;

    const { data: newPatrol, error } = await supabase.from("patrols").insert({
      department_id: personnel.department_id,
      personnel_id: personnel.id,
      route_name: route.name,
      status: "active",
      total_checkpoints: route.points.length,
      completed_checkpoints: 0,
    }).select().single();

    if (error || !newPatrol) return;

    const cpInserts = route.points.map((p, i) => ({
      patrol_id: newPatrol.id,
      checkpoint_order: i + 1,
      name: p.name,
      detail: p.detail,
      qr_token: p.qr_token,
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

  async function confirmCheckpoint(rawCode: string): Promise<boolean> {
    if (!patrol || !activeCheckpoint) return false;
    const code = rawCode.trim();

    if (activeCheckpoint.qr_token && code !== activeCheckpoint.qr_token) {
      setScanError("Bu QR kod bu noktaya ait değil.");
      return false;
    }

    setScanError(null);
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
    setScanning(false);
    setManualCode("");
    return true;
  }

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    setCameraError(false);
    setScanError(null);
    runningRef.current = false;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const qr = new Html5Qrcode("qr-reader-region");
      scannerRef.current = qr;
      qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText: string) => {
          if (processingRef.current) return;
          processingRef.current = true;
          confirmCheckpoint(decodedText).then(ok => {
            if (!ok) setTimeout(() => { processingRef.current = false; }, 1500);
          });
        },
        () => {}
      ).then(() => {
        if (cancelled) { try { qr.stop().catch(() => {}); } catch {} return; }
        runningRef.current = true;
      }).catch(() => {
        if (!cancelled) setCameraError(true);
      });
    });

    return () => {
      cancelled = true;
      const qr = scannerRef.current;
      scannerRef.current = null;
      if (!qr) return;
      if (runningRef.current) {
        try {
          qr.stop().then(() => { try { qr.clear(); } catch {} }).catch(() => {});
        } catch { /* html5-qrcode can throw synchronously if scanner already stopped */ }
      } else {
        try { qr.clear(); } catch {}
      }
      runningRef.current = false;
    };
  }, [scanning]);

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

  if (!patrol && noDuty && personnel?.role === "personel") {
    return (
      <div className="bg-[#f8f9ff] min-h-screen flex flex-col items-center justify-center px-6 gap-5">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-gray-400 text-[40px]">event_busy</span>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-700">Bugün Kat Kontrolü Göreviniz Yok</h2>
          <p className="text-sm text-gray-400">Bu vardiyada planlanmış kontrol bulunmuyor.</p>
        </div>
        <button onClick={() => router.push("/dashboard")}
          className="mt-2 px-8 py-3.5 rounded-2xl text-white font-bold active:scale-95 transition-all"
          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
          Panele Dön
        </button>
      </div>
    );
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
            <h1 className="text-xl font-bold text-blue-800">Kat Kontrolü Görevleri</h1>
          </div>
          <span className="text-xs font-semibold text-gray-400">
            {now.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </header>

        <main className="px-6 pt-5 space-y-4">
          {assignmentRoute && (
            <div className="bg-indigo-50 rounded-2xl p-4 flex items-center gap-3 border border-indigo-100">
              <div className="w-10 h-10 rounded-xl bg-[#3949AB] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>cleaning_services</span>
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
              let slotMin = h * 60 + m;
              let adjustedNow = nowMin;
              if (schedMeta?.crossMidnight && slotMin < schedMeta.startMin) {
                slotMin += 24 * 60;
                if (nowMin < schedMeta.startMin && nowMin <= schedMeta.endMin) adjustedNow += 24 * 60;
              }
              const timeStr = a.scheduled_time.slice(0, 5);
              const isOccupied = a.status === "pending" && occupiedSlots.includes(timeStr);
              const canStart = a.status === "pending" && !isOccupied && adjustedNow >= slotMin - 15;
              const cfg = isOccupied
                ? { label: "Meşgul", bg: "bg-orange-100", text: "text-orange-600", icon: "person", border: "border-l-orange-300" }
                : (statusCfg[a.status] ?? statusCfg.pending);
              return (
                <div key={a.id} className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${cfg.border}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 ${
                        isOccupied              ? "bg-orange-50" :
                        a.status === "completed" ? "bg-emerald-100" :
                        a.status === "missed"    ? "bg-red-100" :
                        a.status === "active"    ? "bg-blue-100" : "bg-indigo-50"
                      }`}>
                        <span className={`text-base font-bold leading-tight ${
                          isOccupied              ? "text-orange-500" :
                          a.status === "completed" ? "text-emerald-700" :
                          a.status === "missed"    ? "text-red-600" :
                          a.status === "active"    ? "text-blue-700" : "text-indigo-700"
                        }`}>{timeStr}</span>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{timeStr} Kontrolü</p>
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
                      disabled={!!startingAssignment || !assignmentRoute || assignmentRoute.points.length === 0}
                      className="w-full mt-3 py-3.5 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all shadow-sm"
                      style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
                    >
                      {startingAssignment === a.id
                        ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>}
                      {startingAssignment === a.id ? "Başlatılıyor..." : "Kontrolü Başlat"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {slotBlockedMsg && (
            <div className="bg-orange-50 rounded-2xl p-4 flex gap-3 border border-orange-100">
              <span className="material-symbols-outlined text-orange-500 text-[20px] flex-shrink-0">warning</span>
              <p className="text-xs text-orange-700 font-semibold leading-relaxed">{slotBlockedMsg}</p>
            </div>
          )}

          <div className="bg-blue-50 rounded-2xl p-4 flex gap-3 border border-blue-100">
            <span className="material-symbols-outlined text-blue-600 text-[20px] flex-shrink-0">info</span>
            <p className="text-xs text-blue-700 font-semibold leading-relaxed">
              Kontrolleri 15 dakika erken başlatabilirsin. Tüm noktaları tamamladıktan sonra kontrolü bitir.
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
          <span className="material-symbols-outlined text-blue-800 text-[40px]">cleaning_services</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 text-center">Aktif Kat Kontrolü Yok</h2>
        <p className="text-gray-500 text-center text-sm">Kontrol rotasını seçip başlatın.</p>

        {availableRoutes.length > 0 && (
          <div className="w-full space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center">Rota Seç</p>
            {availableRoutes.map(r => (
              <button key={r.id} onClick={() => setSelectedRouteId(r.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${selectedRouteId === r.id ? "border-blue-700 bg-blue-50" : "border-gray-200 bg-white"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${selectedRouteId === r.id ? "bg-blue-700" : "bg-gray-100"}`}>
                  <span className={`material-symbols-outlined text-[16px] ${selectedRouteId === r.id ? "text-white" : "text-gray-400"}`} style={{ fontVariationSettings: "'FILL' 1" }}>cleaning_services</span>
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
                  <span className="text-sm text-gray-600">{pt.name}{pt.detail ? ` · ${pt.detail}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={startNewPatrol} disabled={!selectedRoute || selectedRoute.points.length === 0}
          className="w-full py-4 text-white rounded-2xl text-base font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
          Kontrolü Başlat
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
          <h1 className="text-2xl font-semibold text-blue-800">Aktif Kat Kontrolü</h1>
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
            onClick={() => {
              const msg = `🚨 ACİL SOS!\n\nGörevli: ${personnel?.full_name || "Temizlik Personeli"}\nSaat: ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}\n\nKat kontrolü sırasında acil yardım gerekiyor!`;
              window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
            }}
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
                        <p className="text-xs font-semibold text-gray-500">{cp.detail ? `${cp.detail} · ` : ""}Hedefe ulaşıldı, QR kodu okutun</p>
                      </div>
                    </div>
                    <button onClick={() => { setScanning(true); setScanError(null); }}
                      className="w-full py-4 text-white rounded-full font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-indigo-200"
                      style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                      <span className="material-symbols-outlined">qr_code_scanner</span>
                      QR Kodu Okut
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
          Kontrolü Bitir
        </button>
      </div>

      {/* QR Tarama Modalı */}
      {scanning && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center px-6">
          <button onClick={() => setScanning(false)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-all">
            <span className="material-symbols-outlined text-white">close</span>
          </button>

          <p className="text-white font-bold mb-4">Nokta QR Kodunu Kameraya Gösterin</p>

          {!cameraError ? (
            <div id="qr-reader-region" className="w-full max-w-[320px] rounded-2xl overflow-hidden" />
          ) : (
            <div className="w-full max-w-[320px] bg-white/10 rounded-2xl p-6 text-center">
              <span className="material-symbols-outlined text-white/60 text-[36px] block mb-2">videocam_off</span>
              <p className="text-white/70 text-sm">Kameraya erişilemedi. Kodu manuel girin.</p>
            </div>
          )}

          {scanError && (
            <p className="text-red-400 text-sm font-semibold mt-4 text-center">{scanError}</p>
          )}

          <div className="w-full max-w-[320px] mt-6 space-y-2">
            <p className="text-white/50 text-xs text-center">Kod okutulamıyor mu? Manuel girin:</p>
            <div className="flex gap-2">
              <input value={manualCode} onChange={e => setManualCode(e.target.value)}
                placeholder="Kod"
                className="flex-1 h-11 rounded-xl px-3 text-sm bg-white/10 text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => confirmCheckpoint(manualCode)} disabled={!manualCode.trim()}
                className="px-4 h-11 rounded-xl bg-blue-700 text-white text-sm font-bold disabled:opacity-40">
                Doğrula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
