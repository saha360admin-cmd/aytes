"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

// ─── Rotalar tab types (preserved from original) ───────────────────────────
interface Location { id: string; name: string }
interface RoutePoint { id: string; name: string; point_order: number }
interface Schedule {
  id: string;
  day_type: "weekday" | "weekend" | "everyday";
  start_time: string;
  interval_minutes: number;
  end_time: string | null;
  is_active: boolean;
}
interface PatrolRoute {
  id: string; name: string; location_id: string | null;
  is_active: boolean; points: RoutePoint[]; schedules: Schedule[];
}

// ─── Planlar tab types ──────────────────────────────────────────────────────
interface Department { id: string; name: string }
interface PatrolPlan {
  id: string;
  department_id: string;
  name: string;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  repeat_type: "daily" | "weekly";
  repeat_days: number[] | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  department: { name: string } | null;
}

// ─── Atama tab types ────────────────────────────────────────────────────────
interface PatrolAssignment {
  id: string;
  plan_id: string;
  department_id: string;
  personnel_id: string;
  assigned_date: string;
  status: "assigned" | "started" | "completed" | "missed";
  patrol_id: string | null;
  personnel: { id: string; full_name: string } | null;
}

// ─── Takip tab types ────────────────────────────────────────────────────────
interface TrackingAssignment {
  id: string;
  plan_id: string;
  department_id: string;
  personnel_id: string;
  assigned_date: string;
  status: "assigned" | "started" | "completed" | "missed";
  patrol_id: string | null;
  plan: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    department_id: string;
    department: { name: string } | null;
  } | null;
  personnel: { id: string; full_name: string } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const DAY_TYPES = [
  { id: "weekday",  label: "Hafta İçi" },
  { id: "weekend",  label: "Hafta Sonu" },
  { id: "everyday", label: "Her Gün" },
] as const;

const INTERVALS = [30, 60, 90, 120, 180, 240];
const DAY_LABEL: Record<string, string> = { weekday: "Hafta İçi", weekend: "Hafta Sonu", everyday: "Her Gün" };

const ISO_DAYS = [
  { iso: 1, label: "Pzt" },
  { iso: 2, label: "Sal" },
  { iso: 3, label: "Çar" },
  { iso: 4, label: "Per" },
  { iso: 5, label: "Cum" },
  { iso: 6, label: "Cmt" },
  { iso: 7, label: "Paz" },
];

function getISOWeekday(d: Date) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getMondayOfWeek(d: Date) {
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const diff = day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return monday;
}

function timeToMin(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function shiftCovers(shiftStart: string, shiftEnd: string, planStart: string, planEnd: string) {
  let ss = timeToMin(shiftStart), se = timeToMin(shiftEnd);
  let ps = timeToMin(planStart), pe = timeToMin(planEnd);
  if (se < ss) se += 1440;
  if (pe < ps) pe += 1440;
  if (ps < ss) { ps += 1440; pe += 1440; }
  return ps >= ss && pe <= se;
}

function repeatLabel(plan: PatrolPlan) {
  if (plan.repeat_type === "daily") return "Her Gün";
  if (!plan.repeat_days || plan.repeat_days.length === 0) return "Haftalık";
  if (plan.repeat_days.length === 5 && ![6,7].some(d => plan.repeat_days!.includes(d))) return "Hafta İçi";
  if (plan.repeat_days.length === 2 && plan.repeat_days.includes(6) && plan.repeat_days.includes(7)) return "Hafta Sonu";
  const labels = plan.repeat_days.map(d => ISO_DAYS.find(x => x.iso === d)?.label ?? "").join(", ");
  return `Her ${labels}`;
}

// ─── Status badge helper ────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
export default function DevriyePlanlama() {
  const router = useRouter();
  const { personnel } = useAuth();

  const [activeTab, setActiveTab] = useState<"planlar" | "atama" | "takip" | "rotalar">("planlar");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
  }, [personnel]);

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 1: PLANLAR state
  // ─────────────────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [plans, setPlans] = useState<PatrolPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // Plan form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PatrolPlan | null>(null);
  const [planDeptId, setPlanDeptId] = useState("");
  const [planName, setPlanName] = useState("");
  const [planStart, setPlanStart] = useState("08:00");
  const [planEnd, setPlanEnd] = useState("17:00");
  const [planInterval, setPlanInterval] = useState(60);
  const [planRepeatType, setPlanRepeatType] = useState<"daily" | "weekly">("daily");
  const [planRepeatDays, setPlanRepeatDays] = useState<number[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!personnel) return;
    loadPlans();
    loadDepartments();
  }, [personnel]);

  async function loadDepartments() {
    const { data } = await supabase.from("departments").select("id, name").order("name");
    setDepartments(data || []);
  }

  async function loadPlans() {
    setPlansLoading(true);
    const { data } = await supabase
      .from("patrol_plans")
      .select("*, department:departments(name)")
      .order("created_at", { ascending: false });
    setPlans((data || []) as PatrolPlan[]);
    setPlansLoading(false);
  }

  function openNewPlanForm() {
    setEditingPlan(null);
    setPlanDeptId(departments[0]?.id ?? "");
    setPlanName("");
    setPlanStart("08:00");
    setPlanEnd("17:00");
    setPlanInterval(60);
    setPlanRepeatType("daily");
    setPlanRepeatDays([]);
    setShowPlanForm(true);
  }

  function openEditPlanForm(plan: PatrolPlan) {
    setEditingPlan(plan);
    setPlanDeptId(plan.department_id);
    setPlanName(plan.name);
    setPlanStart(plan.start_time.slice(0, 5));
    setPlanEnd(plan.end_time.slice(0, 5));
    setPlanInterval(plan.interval_minutes);
    setPlanRepeatType(plan.repeat_type);
    setPlanRepeatDays(plan.repeat_days ?? []);
    setShowPlanForm(true);
  }

  function toggleRepeatDay(iso: number) {
    setPlanRepeatDays(prev =>
      prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso]
    );
  }

  async function savePlan() {
    if (!planName.trim() || !planDeptId || !personnel) return;
    setSavingPlan(true);
    const payload = {
      department_id: planDeptId,
      name: planName.trim(),
      start_time: planStart,
      end_time: planEnd,
      interval_minutes: planInterval,
      repeat_type: planRepeatType,
      repeat_days: planRepeatType === "weekly" ? planRepeatDays : null,
      is_active: true,
    };

    if (editingPlan) {
      const { data, error } = await supabase
        .from("patrol_plans")
        .update(payload)
        .eq("id", editingPlan.id)
        .select("*, department:departments(name)")
        .single();
      if (!error && data) {
        setPlans(prev => prev.map(p => p.id === editingPlan.id ? data as PatrolPlan : p));
        flash("Plan güncellendi", true);
      } else flash(error?.message ?? "Hata", false);
    } else {
      const { data, error } = await supabase
        .from("patrol_plans")
        .insert({ ...payload, created_by: personnel.id })
        .select("*, department:departments(name)")
        .single();
      if (!error && data) {
        setPlans(prev => [data as PatrolPlan, ...prev]);
        flash("Plan oluşturuldu", true);
      } else flash(error?.message ?? "Hata", false);
    }

    setSavingPlan(false);
    setShowPlanForm(false);
  }

  async function togglePlanActive(plan: PatrolPlan) {
    await supabase.from("patrol_plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p));
    flash(plan.is_active ? "Plan pasife alındı" : "Plan aktife alındı", true);
  }

  async function deletePlan(planId: string) {
    setDeletingPlanId(planId);
    const { error } = await supabase.from("patrol_plans").delete().eq("id", planId);
    if (!error) {
      setPlans(prev => prev.filter(p => p.id !== planId));
      flash("Plan silindi", true);
    } else flash(error.message, false);
    setDeletingPlanId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 2: ATAMA state
  // ─────────────────────────────────────────────────────────────────────────
  const [atamaDate, setAtamaDate] = useState(toDateStr(new Date()));
  const [assignments, setAssignments] = useState<PatrolAssignment[]>([]);
  const [atamaLoading, setAtamaLoading] = useState(false);

  // Personnel picker
  const [showPersonnelPicker, setShowPersonnelPicker] = useState(false);
  const [pickerPlan, setPickerPlan] = useState<PatrolPlan | null>(null);
  const [eligiblePersonnel, setEligiblePersonnel] = useState<{ id: string; full_name: string }[]>([]);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [autoAssigningPlanId, setAutoAssigningPlanId] = useState<string | null>(null);
  const [autoAssigningAll, setAutoAssigningAll] = useState(false);

  useEffect(() => {
    if (activeTab === "atama") loadAtamaData();
  }, [activeTab, atamaDate]);

  async function loadAtamaData() {
    setAtamaLoading(true);
    const { data } = await supabase
      .from("patrol_assignments")
      .select("*, personnel:personnel(id, full_name)")
      .eq("assigned_date", atamaDate);
    setAssignments((data || []) as PatrolAssignment[]);
    setAtamaLoading(false);
  }

  function getActivePlansForDate(date: string): PatrolPlan[] {
    const d = new Date(date + "T12:00:00");
    const isoDay = getISOWeekday(d);
    return plans.filter(plan => {
      if (!plan.is_active) return false;
      if (plan.repeat_type === "daily") return true;
      return plan.repeat_days && plan.repeat_days.includes(isoDay);
    });
  }

  async function openPersonnelPicker(plan: PatrolPlan) {
    setPickerPlan(plan);
    setShowPersonnelPicker(true);
    setLoadingEligible(true);
    setEligiblePersonnel([]);

    const { data: personnelData } = await supabase
      .from("personnel")
      .select("id, full_name")
      .eq("department_id", plan.department_id)
      .neq("status", "archived");

    const deptPersonnel = personnelData || [];
    let eligible = deptPersonnel;

    if (deptPersonnel.length > 0) {
      const personnelIds = deptPersonnel.map((p: any) => p.id);
      const { data: shiftAssignData } = await supabase
        .from("shift_assignments")
        .select("personnel_id, shift_code")
        .eq("shift_date", atamaDate)
        .eq("status", "published")
        .in("personnel_id", personnelIds);

      const shiftAssigns = shiftAssignData || [];
      if (shiftAssigns.length > 0) {
        const codes = [...new Set(shiftAssigns.map((s: any) => s.shift_code))];
        const { data: shiftTypes } = await supabase
          .from("shift_types")
          .select("code, start_time, end_time")
          .eq("department_id", plan.department_id)
          .in("code", codes);

        const shiftTypeMap = Object.fromEntries((shiftTypes || []).map((st: any) => [st.code, st]));
        const eligibleIds = new Set(
          shiftAssigns
            .filter((sa: any) => {
              const st = shiftTypeMap[sa.shift_code];
              if (!st) return false;
              return shiftCovers(st.start_time, st.end_time, plan.start_time, plan.end_time);
            })
            .map((sa: any) => sa.personnel_id)
        );
        eligible = deptPersonnel.filter((p: any) => eligibleIds.has(p.id));
      } else {
        eligible = [];
      }
    }

    setEligiblePersonnel(eligible as { id: string; full_name: string }[]);
    setLoadingEligible(false);
  }

  async function assignPersonnel(personnelId: string) {
    if (!pickerPlan || !personnel) return;
    setSavingAssignment(true);

    // Remove existing assignment for this plan+date if any
    await supabase
      .from("patrol_assignments")
      .delete()
      .eq("plan_id", pickerPlan.id)
      .eq("assigned_date", atamaDate);

    const { data, error } = await supabase
      .from("patrol_assignments")
      .insert({
        plan_id: pickerPlan.id,
        department_id: pickerPlan.department_id,
        personnel_id: personnelId,
        assigned_date: atamaDate,
        status: "assigned",
        assigned_by: personnel.id,
      })
      .select("*, personnel:personnel(id, full_name)")
      .single();

    if (!error && data) {
      setAssignments(prev => {
        const filtered = prev.filter(a => !(a.plan_id === pickerPlan.id && a.assigned_date === atamaDate));
        return [...filtered, data as PatrolAssignment];
      });
      flash("Atama yapıldı", true);
    } else {
      flash(error?.message ?? "Hata", false);
    }

    setSavingAssignment(false);
    setShowPersonnelPicker(false);
    setPickerPlan(null);
  }

  // Helper: resolve eligible personnel for a plan on a given date
  async function resolveEligible(plan: PatrolPlan, date: string): Promise<{ id: string; full_name: string }[]> {
    const { data: personnelData } = await supabase
      .from("personnel")
      .select("id, full_name")
      .eq("department_id", plan.department_id)
      .neq("status", "archived");

    const deptPersonnel = personnelData || [];
    if (deptPersonnel.length === 0) return [];

    const personnelIds = deptPersonnel.map((p: any) => p.id);
    const { data: shiftAssignData } = await supabase
      .from("shift_assignments")
      .select("personnel_id, shift_code")
      .eq("shift_date", date)
      .eq("status", "published")
      .in("personnel_id", personnelIds);

    const shiftAssigns = shiftAssignData || [];
    if (shiftAssigns.length === 0) return [];

    const codes = [...new Set(shiftAssigns.map((s: any) => s.shift_code))];
    const { data: shiftTypes } = await supabase
      .from("shift_types")
      .select("code, start_time, end_time")
      .eq("department_id", plan.department_id)
      .in("code", codes);

    const shiftTypeMap = Object.fromEntries((shiftTypes || []).map((st: any) => [st.code, st]));
    const eligibleIds = new Set(
      shiftAssigns
        .filter((sa: any) => {
          const st = shiftTypeMap[sa.shift_code];
          if (!st) return false;
          return shiftCovers(st.start_time, st.end_time, plan.start_time, plan.end_time);
        })
        .map((sa: any) => sa.personnel_id)
    );

    return deptPersonnel.filter((p: any) => eligibleIds.has(p.id)) as { id: string; full_name: string }[];
  }

  async function autoAssignPlan(plan: PatrolPlan) {
    if (!personnel) return;
    setAutoAssigningPlanId(plan.id);

    const eligible = await resolveEligible(plan, atamaDate);
    if (eligible.length === 0) {
      flash("Uygun personel bulunamadı, manuel atayın", false);
      setAutoAssigningPlanId(null);
      return;
    }

    // Prioritize: not yet assigned to another plan today
    const assignedPersonnelIds = new Set(assignments.map(a => a.personnel_id));
    const unbusy = eligible.filter(p => !assignedPersonnelIds.has(p.id));
    const chosen = unbusy.length > 0
      ? unbusy[Math.floor(Math.random() * unbusy.length)]
      : eligible[Math.floor(Math.random() * eligible.length)];

    // Remove existing assignment if any
    await supabase
      .from("patrol_assignments")
      .delete()
      .eq("plan_id", plan.id)
      .eq("assigned_date", atamaDate);

    const { data, error } = await supabase
      .from("patrol_assignments")
      .insert({
        plan_id: plan.id,
        department_id: plan.department_id,
        personnel_id: chosen.id,
        assigned_date: atamaDate,
        status: "assigned",
        assigned_by: personnel.id,
      })
      .select("*, personnel:personnel(id, full_name)")
      .single();

    if (!error && data) {
      setAssignments(prev => {
        const filtered = prev.filter(a => !(a.plan_id === plan.id && a.assigned_date === atamaDate));
        return [...filtered, data as PatrolAssignment];
      });
      flash(`${chosen.full_name} otomatik atandı`, true);
    } else {
      flash(error?.message ?? "Hata", false);
    }

    setAutoAssigningPlanId(null);
  }

  async function autoAssignAll() {
    if (!personnel) return;
    setAutoAssigningAll(true);

    const activePlans = getActivePlansForDate(atamaDate);
    const unassignedPlans = activePlans.filter(plan =>
      !assignments.some(a => a.plan_id === plan.id && a.assigned_date === atamaDate)
    );

    if (unassignedPlans.length === 0) {
      flash("Tüm planlar zaten atanmış", true);
      setAutoAssigningAll(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const newAssignments: PatrolAssignment[] = [];

    // Track assigned personnel this session to avoid double-booking
    const sessionAssignedIds = new Set(assignments.map(a => a.personnel_id));

    for (const plan of unassignedPlans) {
      const eligible = await resolveEligible(plan, atamaDate);
      const unbusy = eligible.filter(p => !sessionAssignedIds.has(p.id));
      const chosen = unbusy.length > 0
        ? unbusy[Math.floor(Math.random() * unbusy.length)]
        : eligible.length > 0
          ? eligible[Math.floor(Math.random() * eligible.length)]
          : null;

      if (!chosen) {
        failCount++;
        continue;
      }

      const { data, error } = await supabase
        .from("patrol_assignments")
        .insert({
          plan_id: plan.id,
          department_id: plan.department_id,
          personnel_id: chosen.id,
          assigned_date: atamaDate,
          status: "assigned",
          assigned_by: personnel.id,
        })
        .select("*, personnel:personnel(id, full_name)")
        .single();

      if (!error && data) {
        newAssignments.push(data as PatrolAssignment);
        sessionAssignedIds.add(chosen.id);
        successCount++;
      } else {
        failCount++;
      }
    }

    if (newAssignments.length > 0) {
      setAssignments(prev => {
        const planIds = new Set(newAssignments.map(a => a.plan_id));
        const filtered = prev.filter(a => !planIds.has(a.plan_id));
        return [...filtered, ...newAssignments];
      });
    }

    const msg = failCount === 0
      ? `${successCount} plan atandı`
      : `${successCount} plan atandı, ${failCount} plan için uygun personel bulunamadı`;
    flash(msg, failCount === 0);
    setAutoAssigningAll(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 3: TAKİP state
  // ─────────────────────────────────────────────────────────────────────────
  const today = new Date();
  const mondayStr = toDateStr(getMondayOfWeek(today));
  const todayStr = toDateStr(today);

  const [takipFrom, setTakipFrom] = useState(mondayStr);
  const [takipTo, setTakipTo] = useState(todayStr);
  const [takipDept, setTakipDept] = useState("all");
  const [trackingData, setTrackingData] = useState<TrackingAssignment[]>([]);
  const [takipLoading, setTakipLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "takip") loadTakipData();
  }, [activeTab, takipFrom, takipTo]);

  async function loadTakipData() {
    setTakipLoading(true);
    const { data } = await supabase
      .from("patrol_assignments")
      .select("*, plan:patrol_plans(id, name, start_time, end_time, department_id, department:departments(name)), personnel:personnel(id, full_name)")
      .gte("assigned_date", takipFrom)
      .lte("assigned_date", takipTo)
      .order("assigned_date", { ascending: false });

    const items = (data || []) as TrackingAssignment[];

    // Auto-mark missed
    const toMiss = items.filter(a =>
      a.status === "assigned" &&
      a.assigned_date < todayStr &&
      a.patrol_id === null
    );
    if (toMiss.length > 0) {
      await supabase
        .from("patrol_assignments")
        .update({ status: "missed" })
        .in("id", toMiss.map(a => a.id));
      toMiss.forEach(a => { a.status = "missed"; });
    }

    setTrackingData(items);
    setTakipLoading(false);
  }

  const filteredTracking = takipDept === "all"
    ? trackingData
    : trackingData.filter(a => a.plan?.department_id === takipDept);

  const completedCount = filteredTracking.filter(a => a.status === "completed").length;
  const missedCount = filteredTracking.filter(a => a.status === "missed").length;

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 4: ROTALAR state (preserved from original)
  // ─────────────────────────────────────────────────────────────────────────
  const [locations, setLocations]     = useState<Location[]>([]);
  const [routes, setRoutes]           = useState<PatrolRoute[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [selectedLoc, setSelectedLoc] = useState<string>("all");
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [showLocPicker, setShowLocPicker] = useState(false);

  const [showNewRoute, setShowNewRoute]   = useState(false);
  const [newRouteName, setNewRouteName]   = useState("");
  const [newRouteLocId, setNewRouteLocId] = useState("");
  const [savingRoute, setSavingRoute]     = useState(false);

  const [addingPointTo, setAddingPointTo] = useState<string | null>(null);
  const [newPointName, setNewPointName]   = useState("");
  const [savingPoint, setSavingPoint]     = useState(false);

  const [editingSched, setEditingSched]       = useState<{ routeId: string; sched: Schedule | null } | null>(null);
  const [schedDayType, setSchedDayType]       = useState<"weekday"|"weekend"|"everyday">("weekday");
  const [schedStart, setSchedStart]           = useState("08:00");
  const [schedInterval, setSchedInterval]     = useState(60);
  const [schedEnd, setSchedEnd]               = useState("");
  const [savingSched, setSavingSched]         = useState(false);

  useEffect(() => {
    if (activeTab === "rotalar" && routesLoading) loadRotalarData();
  }, [activeTab]);

  async function loadRotalarData() {
    setRoutesLoading(true);
    const [locRes, routeRes] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("patrol_routes").select(`
        id, name, location_id, is_active,
        points:patrol_route_points(id, name, point_order),
        schedules:patrol_schedules(id, day_type, start_time, interval_minutes, end_time, is_active)
      `).order("created_at", { ascending: false }),
    ]);
    setLocations(locRes.data || []);
    setRoutes((routeRes.data || []).map((r: any) => ({
      ...r,
      points: [...(r.points || [])].sort((a: RoutePoint, b: RoutePoint) => a.point_order - b.point_order),
      schedules: r.schedules || [],
    })));
    setRoutesLoading(false);
  }

  async function createRoute() {
    if (!newRouteName.trim() || !personnel) return;
    setSavingRoute(true);
    const { data, error } = await supabase.from("patrol_routes")
      .insert({ name: newRouteName.trim(), location_id: newRouteLocId || null, department_id: personnel.department_id, created_by: personnel.id })
      .select("id, name, location_id, is_active").single();
    if (!error && data) {
      const nr: PatrolRoute = { ...data, points: [], schedules: [] };
      setRoutes(p => [nr, ...p]);
      setExpandedId(nr.id);
      setShowNewRoute(false); setNewRouteName(""); setNewRouteLocId("");
      flash("Rota oluşturuldu", true);
    } else flash(error?.message ?? "Hata", false);
    setSavingRoute(false);
  }

  async function addPoint(routeId: string) {
    if (!newPointName.trim()) return;
    setSavingPoint(true);
    const route = routes.find(r => r.id === routeId);
    const { data, error } = await supabase.from("patrol_route_points")
      .insert({ route_id: routeId, name: newPointName.trim(), point_order: (route?.points.length ?? 0) + 1 })
      .select("id, name, point_order").single();
    if (!error && data) {
      setRoutes(p => p.map(r => r.id === routeId ? { ...r, points: [...r.points, data] } : r));
      setNewPointName(""); setAddingPointTo(null);
      flash("Nokta eklendi", true);
    }
    setSavingPoint(false);
  }

  async function deletePoint(routeId: string, pointId: string) {
    await supabase.from("patrol_route_points").delete().eq("id", pointId);
    setRoutes(p => p.map(r => r.id === routeId
      ? { ...r, points: r.points.filter(pt => pt.id !== pointId).map((pt, i) => ({ ...pt, point_order: i + 1 })) }
      : r));
  }

  function openSchedForm(routeId: string, sched: Schedule | null) {
    setEditingSched({ routeId, sched });
    if (sched) {
      setSchedDayType(sched.day_type);
      setSchedStart(sched.start_time.slice(0, 5));
      setSchedInterval(sched.interval_minutes);
      setSchedEnd(sched.end_time ? sched.end_time.slice(0, 5) : "");
    } else {
      setSchedDayType("weekday"); setSchedStart("08:00"); setSchedInterval(60); setSchedEnd("");
    }
  }

  async function saveSchedule() {
    if (!editingSched) return;
    const { routeId, sched } = editingSched;
    setSavingSched(true);
    const payload = { day_type: schedDayType, start_time: schedStart, interval_minutes: schedInterval, end_time: schedEnd || null, is_active: true };

    if (sched) {
      const { data, error } = await supabase.from("patrol_schedules").update(payload).eq("id", sched.id).select("id, day_type, start_time, interval_minutes, end_time, is_active").single();
      if (!error && data) {
        setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: r.schedules.map(s => s.id === sched.id ? data : s) } : r));
        flash("Plan güncellendi", true);
      } else flash(error?.message ?? "Hata", false);
    } else {
      const { data, error } = await supabase.from("patrol_schedules")
        .insert({ route_id: routeId, ...payload })
        .select("id, day_type, start_time, interval_minutes, end_time, is_active").single();
      if (!error && data) {
        setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: [...r.schedules, data] } : r));
        flash("Plan kaydedildi", true);
      } else flash(error?.message ?? "Hata", false);
    }
    setEditingSched(null);
    setSavingSched(false);
  }

  async function deleteSchedule(routeId: string, schedId: string) {
    await supabase.from("patrol_schedules").delete().eq("id", schedId);
    setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: r.schedules.filter(s => s.id !== schedId) } : r));
  }

  async function toggleRoute(routeId: string, current: boolean) {
    await supabase.from("patrol_routes").update({ is_active: !current }).eq("id", routeId);
    setRoutes(p => p.map(r => r.id === routeId ? { ...r, is_active: !current } : r));
  }

  async function deleteRoute(routeId: string) {
    await supabase.from("patrol_routes").delete().eq("id", routeId);
    setRoutes(p => p.filter(r => r.id !== routeId));
    if (expandedId === routeId) setExpandedId(null);
    flash("Rota silindi", true);
  }

  const selectedLocName = selectedLoc === "all" ? "Tüm Bölgeler" : (locations.find(l => l.id === selectedLoc)?.name ?? "Bölge");
  const filteredRoutes = selectedLoc === "all" ? routes : routes.filter(r => r.location_id === selectedLoc);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "planlar", label: "Planlar" },
    { id: "atama",   label: "Atama" },
    { id: "takip",   label: "Takip" },
    { id: "rotalar", label: "Rotalar" },
  ] as const;

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">Devriye Planlaması</h1>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="sticky top-16 z-30 bg-white shadow-sm">
        <div className="flex">
          {tabs.map(tab => (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3.5 text-xs font-bold transition-all relative ${activeTab === tab.id ? "text-[#3949AB]" : "text-gray-400"}`}>
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════ TAB 1: PLANLAR ══════════════ */}
      {activeTab === "planlar" && (
        <div className="px-4 pt-4 space-y-3">
          {plansLoading ? (
            <div className="flex justify-center py-12">
              <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
            </div>
          ) : plans.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 shadow-sm">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[#3949AB] text-[36px]">event_note</span>
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-700">Henüz plan oluşturulmadı</p>
                <p className="text-xs text-gray-400 mt-1">Yeni Plan butonuna basarak başlayın</p>
              </div>
            </div>
          ) : plans.map(plan => (
            <div key={plan.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${plan.is_active ? "bg-indigo-100" : "bg-gray-100"}`}>
                    <span className={`material-symbols-outlined text-[22px] ${plan.is_active ? "text-[#3949AB]" : "text-gray-400"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>calendar_clock</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800 text-sm">{plan.name}</p>
                      <span className={`rounded-full text-[10px] font-bold px-2 py-0.5 ${plan.is_active ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                        {plan.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{plan.department?.name ?? "Bilinmiyor"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {plan.start_time.slice(0,5)} – {plan.end_time.slice(0,5)} · Her {plan.interval_minutes < 60 ? `${plan.interval_minutes} dk` : `${plan.interval_minutes/60} saat`}
                    </p>
                    <p className="text-xs text-indigo-600 font-semibold mt-0.5">{repeatLabel(plan)}</p>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openEditPlanForm(plan)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-[#3949AB] text-xs font-bold active:scale-95 transition-all">
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Düzenle
                  </button>
                  <button onClick={() => togglePlanActive(plan)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all ${plan.is_active ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}>
                    <span className="material-symbols-outlined text-[14px]">{plan.is_active ? "power_off" : "power"}</span>
                    {plan.is_active ? "Pasife Al" : "Aktife Al"}
                  </button>
                  <button onClick={() => deletePlan(plan.id)} disabled={deletingPlanId === plan.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold active:scale-95 transition-all disabled:opacity-50 ml-auto">
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ TAB 2: ATAMA ══════════════ */}
      {activeTab === "atama" && (
        <div className="px-4 pt-4 space-y-4">
          {/* Date picker + Tümünü Otomatik Ata */}
          <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_today</span>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tarih</p>
              <input type="date" value={atamaDate} onChange={e => setAtamaDate(e.target.value)}
                className="text-sm font-bold text-gray-800 bg-transparent outline-none w-full" />
            </div>
            <button
              onClick={autoAssignAll}
              disabled={autoAssigningAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold active:scale-95 transition-all disabled:opacity-60 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              {autoAssigningAll
                ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                : <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_mode</span>}
              {autoAssigningAll ? "..." : "Tümünü Ata"}
            </button>
          </div>

          {atamaLoading ? (
            <div className="flex justify-center py-8">
              <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
            </div>
          ) : (() => {
            const activePlans = getActivePlansForDate(atamaDate);
            if (activePlans.length === 0) {
              return (
                <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3 shadow-sm">
                  <span className="material-symbols-outlined text-gray-300 text-[40px]">event_busy</span>
                  <p className="text-sm font-bold text-gray-500">Bu tarihte aktif plan yok</p>
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {activePlans.map(plan => {
                  const asgn = assignments.find(a => a.plan_id === plan.id);
                  const isAutoAssigning = autoAssigningPlanId === plan.id;
                  return (
                    <div key={plan.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-[#3949AB] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-800 text-sm">{plan.name}</p>
                            <p className="text-xs text-gray-400">{plan.department?.name ?? ""} · {plan.start_time.slice(0,5)} – {plan.end_time.slice(0,5)}</p>
                          </div>
                        </div>

                        <div className="mt-3">
                          {/* Assignment status */}
                          <div className="mb-3">
                            {asgn ? (
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                                  <span className="material-symbols-outlined text-[#3949AB] text-[14px]">person</span>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-gray-700">{asgn.personnel?.full_name ?? "—"}</p>
                                  <StatusBadge status={asgn.status} />
                                </div>
                              </div>
                            ) : (
                              <span className="rounded-full text-xs font-bold px-2.5 py-1 bg-gray-100 text-gray-500">Atanmadı</span>
                            )}
                          </div>
                          {/* Action buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => autoAssignPlan(plan)}
                              disabled={isAutoAssigning || autoAssigningAll}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-50 text-[#3949AB] text-xs font-bold active:scale-95 transition-all disabled:opacity-50">
                              {isAutoAssigning
                                ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                                : <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_mode</span>}
                              {isAutoAssigning ? "Atanıyor..." : "Otomatik Ata"}
                            </button>
                            <button
                              onClick={() => openPersonnelPicker(plan)}
                              disabled={isAutoAssigning || autoAssigningAll}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                              <span className="material-symbols-outlined text-[14px]">person_add</span>
                              {asgn ? "Değiştir" : "Manuel Ata"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══════════════ TAB 3: TAKİP ══════════════ */}
      {activeTab === "takip" && (
        <div className="px-4 pt-4 space-y-4">
          {/* Date range */}
          <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Başlangıç</label>
                <input type="date" value={takipFrom} onChange={e => setTakipFrom(e.target.value)}
                  className="w-full h-10 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[#3949AB]" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Bitiş</label>
                <input type="date" value={takipTo} onChange={e => setTakipTo(e.target.value)}
                  className="w-full h-10 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[#3949AB]" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Birim</label>
              <div className="relative">
                <select value={takipDept} onChange={e => setTakipDept(e.target.value)}
                  className="w-full h-10 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm outline-none appearance-none focus:ring-2 focus:ring-[#3949AB]">
                  <option value="all">Tüm Birimler</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">task_alt</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tamamlanan</p>
                <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-[20px]">cancel</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kaçırılan</p>
                <p className="text-2xl font-bold text-red-600">{missedCount}</p>
              </div>
            </div>
          </div>

          {takipLoading ? (
            <div className="flex justify-center py-8">
              <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
            </div>
          ) : filteredTracking.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3 shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[40px]">search_off</span>
              <p className="text-sm font-bold text-gray-500">Bu aralıkta kayıt yok</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTracking.map(a => (
                <div key={a.id} className="bg-white rounded-2xl shadow-sm px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#3949AB] text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{a.plan?.name ?? "—"}</p>
                      <p className="text-xs text-gray-400">
                        {a.plan?.department?.name ?? ""} · {a.plan?.start_time?.slice(0,5) ?? ""} – {a.plan?.end_time?.slice(0,5) ?? ""}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(a.assigned_date + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" })}
                        {" · "}{a.personnel?.full_name ?? "Atanmadı"}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB 4: ROTALAR ══════════════ */}
      {activeTab === "rotalar" && (
        <div>
          {/* Bölge Seçici Butonu */}
          <div className="px-4 pt-4 pb-2">
            <div role="button" onClick={() => setShowLocPicker(true)}
              className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3.5 shadow-sm active:scale-[0.98] transition-all cursor-pointer select-none">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                  <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bölge Filtresi</p>
                  <p className="text-sm font-bold text-gray-800">{selectedLocName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLoc !== "all" && (
                  <button onClick={e => { e.stopPropagation(); setSelectedLoc("all"); }}
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-gray-400 text-[14px]">close</span>
                  </button>
                )}
                <span className="material-symbols-outlined text-gray-300 text-[22px]">expand_more</span>
              </div>
            </div>
          </div>

          {/* Rota Kartları */}
          <div className="px-4 pt-2 space-y-3">
            {routesLoading ? (
              <div className="flex justify-center py-12">
                <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-4 shadow-sm mt-2">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#3949AB] text-[36px]">route</span>
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-700">Henüz rota oluşturulmadı</p>
                  <p className="text-xs text-gray-400 mt-1">Aşağıdaki butona basarak başlayın</p>
                </div>
              </div>
            ) : filteredRoutes.map(route => {
              const isOpen = expandedId === route.id;
              const loc = locations.find(l => l.id === route.location_id);
              return (
                <div key={route.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedId(isOpen ? null : route.id)}
                    className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${route.is_active ? "bg-teal-100" : "bg-gray-100"}`}>
                      <span className={`material-symbols-outlined text-[22px] ${route.is_active ? "text-teal-600" : "text-gray-400"}`} style={{ fontVariationSettings: "'FILL' 1" }}>route</span>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-bold text-gray-800 text-sm truncate">{route.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {loc?.name ?? "Bölge yok"} · {route.points.length} nokta · {route.schedules.length} plan
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${route.is_active ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                        {route.is_active ? "Aktif" : "Pasif"}
                      </span>
                      <span className={`material-symbols-outlined text-gray-300 text-[22px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100">
                      {/* Kontrol Noktaları */}
                      <div className="px-4 pt-4 pb-3">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Kontrol Noktaları</p>
                          <button onClick={() => { setAddingPointTo(route.id); setNewPointName(""); }}
                            className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            Nokta Ekle
                          </button>
                        </div>
                        {route.points.length === 0
                          ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz nokta eklenmedi</p>
                          : (
                            <div className="space-y-2">
                              {route.points.map(pt => (
                                <div key={pt.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-3">
                                  <div className="w-7 h-7 rounded-full bg-[#3949AB]/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[11px] font-bold text-[#3949AB]">{pt.point_order}</span>
                                  </div>
                                  <span className="flex-1 text-sm font-semibold text-gray-700">{pt.name}</span>
                                  <button onClick={() => deletePoint(route.id, pt.id)}
                                    className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center active:scale-90 transition-all">
                                    <span className="material-symbols-outlined text-red-400 text-[16px]">delete</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        {addingPointTo === route.id && (
                          <div className="mt-3 flex gap-2">
                            <input autoFocus value={newPointName}
                              onChange={e => setNewPointName(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && addPoint(route.id)}
                              placeholder="Nokta adı (örn: Ana Giriş)"
                              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
                            <button onClick={() => addPoint(route.id)} disabled={savingPoint || !newPointName.trim()}
                              className="px-4 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all flex-shrink-0"
                              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                              {savingPoint ? "..." : "Ekle"}
                            </button>
                            <button onClick={() => setAddingPointTo(null)}
                              className="px-3 py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-bold flex-shrink-0">
                              İptal
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Zaman Planları */}
                      <div className="px-4 pt-3 pb-4 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Zaman Planları</p>
                          <button onClick={() => openSchedForm(route.id, null)}
                            className="h-8 px-3 rounded-full bg-indigo-50 text-[#3949AB] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all">
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            Plan Ekle
                          </button>
                        </div>
                        {route.schedules.length === 0
                          ? <p className="text-xs text-gray-400 italic text-center py-3">Henüz plan eklenmedi</p>
                          : (
                            <div className="space-y-2">
                              {route.schedules.map(s => (
                                <div key={s.id} role="button" onClick={() => openSchedForm(route.id, s)}
                                  className="w-full flex items-center gap-3 bg-indigo-50 rounded-xl px-3 py-3 active:bg-indigo-100 transition-colors cursor-pointer select-none">
                                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-[#3949AB] text-[18px]">schedule</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-700">{DAY_LABEL[s.day_type]}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {s.start_time.slice(0, 5)} başlar · her{" "}
                                      {s.interval_minutes >= 60 ? `${s.interval_minutes / 60} saat` : `${s.interval_minutes} dk`}
                                      {s.end_time ? ` · ${s.end_time.slice(0, 5)}'e kadar` : ""}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[10px] font-bold text-[#3949AB] bg-white px-2 py-1 rounded-full">Düzenle</span>
                                    <button onClick={e => { e.stopPropagation(); deleteSchedule(route.id, s.id); }}
                                      className="w-7 h-7 rounded-full bg-white flex items-center justify-center active:scale-90 transition-all">
                                      <span className="material-symbols-outlined text-red-400 text-[14px]">delete</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      {/* Rota Aksiyonları */}
                      <div className="flex gap-2 px-4 pb-4">
                        <button onClick={() => toggleRoute(route.id, route.is_active)}
                          className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${route.is_active ? "bg-gray-100 text-gray-600" : "bg-teal-100 text-teal-700"}`}>
                          {route.is_active ? "Pasife Al" : "Aktife Al"}
                        </button>
                        <button onClick={() => deleteRoute(route.id)}
                          className="flex-1 h-11 rounded-xl bg-red-50 text-red-600 text-sm font-bold active:scale-95 transition-all">
                          Rotayı Sil
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* FAB — Yeni Rota */}
          <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
            <div className="flex justify-end pb-[8.5rem] pr-4">
              <button onClick={() => setShowNewRoute(true)}
                className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
                Yeni Rota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ FAB Yeni Plan (Planlar tab) ══ */}
      {activeTab === "planlar" && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
          <div className="flex justify-end pb-[8.5rem] pr-4">
            <button onClick={openNewPlanForm}
              className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
              Yeni Plan
            </button>
          </div>
        </div>
      )}

      {/* ══════════ BOTTOM SHEETS ══════════ */}

      {/* Plan Form Bottom Sheet */}
      {showPlanForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPlanForm(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl">
            <div className="px-6 pt-5 pb-4 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">
                  {editingPlan ? "Planı Düzenle" : "Yeni Plan Oluştur"}
                </h3>
                <button onClick={() => setShowPlanForm(false)}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
                </button>
              </div>

              {/* Department */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Birim</label>
                <div className="relative">
                  <select value={planDeptId} onChange={e => setPlanDeptId(e.target.value)}
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none appearance-none">
                    <option value="">— Birim seçin —</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Plan name */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Plan Adı</label>
                <input value={planName} onChange={e => setPlanName(e.target.value)}
                  placeholder="Örn: Gece Devriyesi"
                  className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Başlangıç</label>
                  <input type="time" value={planStart} onChange={e => setPlanStart(e.target.value)}
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Bitiş</label>
                  <input type="time" value={planEnd} onChange={e => setPlanEnd(e.target.value)}
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                </div>
              </div>

              {/* Interval */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Devriye Aralığı</label>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVALS.map(iv => (
                    <button key={iv} onClick={() => setPlanInterval(iv)}
                      className={`h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${planInterval === iv ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={planInterval === iv ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {iv < 60 ? `${iv} dk` : `${iv/60} saat`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Repeat type */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Tekrar</label>
                <div className="flex gap-3">
                  {(["daily", "weekly"] as const).map(rt => (
                    <button key={rt} onClick={() => setPlanRepeatType(rt)}
                      className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all active:scale-95 ${planRepeatType === rt ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={planRepeatType === rt ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {rt === "daily" ? "Her Gün" : "Haftalık"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day-of-week multi select */}
              {planRepeatType === "weekly" && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Günler</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {ISO_DAYS.map(d => (
                      <button key={d.iso} onClick={() => toggleRepeatDay(d.iso)}
                        className={`h-10 px-3 rounded-xl text-xs font-bold transition-all active:scale-95 ${planRepeatDays.includes(d.iso) ? "text-white" : "bg-gray-100 text-gray-500"}`}
                        style={planRepeatDays.includes(d.iso) ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pb-6">
                <button onClick={savePlan} disabled={savingPlan || !planName.trim() || !planDeptId}
                  className="flex-1 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                  {savingPlan
                    ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
                  {savingPlan ? "Kaydediliyor..." : (editingPlan ? "Güncelle" : "Planı Kaydet")}
                </button>
                <button onClick={() => setShowPlanForm(false)}
                  className="py-4 px-5 rounded-2xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-all">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Personnel Picker Bottom Sheet */}
      {showPersonnelPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowPersonnelPicker(false); setPickerPlan(null); }} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl">
            <div className="px-6 pt-5 pb-2">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-gray-800">Personel Seç</h3>
                <button onClick={() => { setShowPersonnelPicker(false); setPickerPlan(null); }}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                {pickerPlan?.name} · {pickerPlan?.start_time?.slice(0,5)} – {pickerPlan?.end_time?.slice(0,5)} · {atamaDate}
              </p>
            </div>
            <div className="px-4 pb-8 max-h-[60vh] overflow-y-auto space-y-2">
              {loadingEligible ? (
                <div className="flex justify-center py-8">
                  <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
                </div>
              ) : eligiblePersonnel.length === 0 ? (
                <div className="bg-amber-50 rounded-2xl p-6 flex flex-col items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-[36px]">person_off</span>
                  <p className="text-sm font-bold text-amber-700 text-center">Bu saat diliminde uygun personel yok</p>
                  <p className="text-xs text-amber-600 text-center">Vardiya atamalarını kontrol edin</p>
                </div>
              ) : eligiblePersonnel.map(p => (
                <button key={p.id}
                  onClick={() => assignPersonnel(p.id)}
                  disabled={savingAssignment}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-gray-50 hover:bg-indigo-50 active:scale-[0.98] transition-all disabled:opacity-50">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#3949AB] text-[20px]">person</span>
                  </div>
                  <p className="flex-1 text-sm font-bold text-gray-700 text-left">{p.full_name}</p>
                  <span className="material-symbols-outlined text-gray-300 text-[20px]">chevron_right</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bölge Seçici Bottom Sheet (Rotalar) */}
      {showLocPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLocPicker(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 relative">
              <div className="w-10 h-1 bg-gray-200 rounded-full absolute top-3 left-1/2 -translate-x-1/2" />
              <h3 className="text-base font-bold text-gray-800 mt-2">Bölge Seç</h3>
              <button onClick={() => setShowLocPicker(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all mt-2">
                <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
              </button>
            </div>
            <div className="px-4 pb-8 space-y-2 max-h-[60vh] overflow-y-auto">
              {[{ id: "all", name: "Tüm Bölgeler" }, ...locations].map(loc => (
                <button key={loc.id}
                  onClick={() => { setSelectedLoc(loc.id); setShowLocPicker(false); }}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] ${selectedLoc === loc.id ? "text-white" : "bg-gray-50 text-gray-700"}`}
                  style={selectedLoc === loc.id ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedLoc === loc.id ? "bg-white/20" : "bg-white"}`}>
                    <span className={`material-symbols-outlined text-[18px] ${selectedLoc === loc.id ? "text-white" : "text-[#3949AB]"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                      {loc.id === "all" ? "layers" : "location_on"}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-sm">{loc.name}</p>
                    {loc.id !== "all" && (
                      <p className={`text-xs mt-0.5 ${selectedLoc === loc.id ? "text-white/70" : "text-gray-400"}`}>
                        {routes.filter(r => r.location_id === loc.id).length} rota
                      </p>
                    )}
                  </div>
                  {selectedLoc === loc.id && (
                    <span className="material-symbols-outlined text-white text-[20px]">check_circle</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Plan Ekle / Düzenle Bottom Sheet (Rotalar tab) */}
      {editingSched && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingSched(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl">
            <div className="px-6 pt-5 pb-4 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">
                  {editingSched.sched ? "Planı Düzenle" : "Yeni Plan Ekle"}
                </h3>
                <button onClick={() => setEditingSched(null)}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
                </button>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Hangi Günler</label>
                <div className="flex gap-2">
                  {DAY_TYPES.map(dt => (
                    <button key={dt.id} onClick={() => setSchedDayType(dt.id)}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${schedDayType === dt.id ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={schedDayType === dt.id ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Başlangıç</label>
                  <input type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)}
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Bitiş (isteğe bağlı)</label>
                  <input type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)}
                    className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Devriye Aralığı</label>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVALS.map(iv => (
                    <button key={iv} onClick={() => setSchedInterval(iv)}
                      className={`h-12 rounded-xl text-sm font-bold transition-all active:scale-95 ${schedInterval === iv ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={schedInterval === iv ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {iv < 60 ? `${iv} dk` : `${iv / 60} saat`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-50 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="material-symbols-outlined text-[#3949AB] text-[20px]">info</span>
                <p className="text-xs text-[#3949AB] font-semibold leading-relaxed">
                  {DAY_LABEL[schedDayType]}, {schedStart} başlar · Her {schedInterval < 60 ? `${schedInterval} dk'da` : `${schedInterval / 60} saatte`} bir devriye
                  {schedEnd ? ` · ${schedEnd}'e kadar` : ""}
                </p>
              </div>

              <div className="flex gap-2 pb-6">
                <button onClick={saveSchedule} disabled={savingSched}
                  className="flex-1 h-13 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                  {savingSched
                    ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
                  {savingSched ? "Kaydediliyor..." : (editingSched.sched ? "Güncelle" : "Planı Kaydet")}
                </button>
                <button onClick={() => setEditingSched(null)}
                  className="py-4 px-5 rounded-2xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-all">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Yeni Rota Bottom Sheet */}
      {showNewRoute && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewRoute(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">Yeni Rota Oluştur</h3>
              <button onClick={() => setShowNewRoute(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-all">
                <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rota Adı</label>
              <input autoFocus value={newRouteName} onChange={e => setNewRouteName(e.target.value)}
                placeholder="Örn: Ataşehir A Bölgesi Devriyesi"
                className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Bölge</label>
              <div className="relative">
                <select value={newRouteLocId} onChange={e => setNewRouteLocId(e.target.value)}
                  className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none appearance-none">
                  <option value="">— Bölge seçin —</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] pointer-events-none">expand_more</span>
              </div>
            </div>

            <button onClick={createRoute} disabled={savingRoute || !newRouteName.trim()}
              className="w-full py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              {savingRoute
                ? <span className="material-symbols-outlined animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>}
              {savingRoute ? "Oluşturuluyor..." : "Rotayı Oluştur"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
