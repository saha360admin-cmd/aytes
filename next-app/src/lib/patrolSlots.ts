import type { SupabaseClient } from "@supabase/supabase-js";

// (mobile)/devriye/page.tsx ile birebir aynı — bir başlangıç saatinden
// bitişe kadar `intervalMinutes` aralıklarla zaman dilimleri üretir (gece
// yarısını aşan planlar dahil).
export function generateTimeSlots(startTime: string, intervalMinutes: number, endTime: string | null): string[] {
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

/**
 * Bugün yayınlanmış vardiyası olan TÜM personel için (sadece o an /devriye
 * sayfasını açan kişi için değil) gerekli patrol_assignments slotlarını
 * oluşturur — devriye hatırlatma cron'unun mevcut satırlar üzerinden
 * çalışabilmesi için önkoşul.
 *
 * (mobile)/devriye/page.tsx'teki loadTodayAssignments'tan kasıtlı olarak
 * farklı: eski pending/missed satırları SİLMİYOR, sadece eksik slotları
 * ekliyor (ignoreDuplicates). Silme+yeniden-üretme yapılsaydı, hatırlatma
 * tekrarını engelleyen `reminder_sent_at` ve `missed` durumu her cron
 * çalışmasında sıfırlanır, aynı devriye için bildirim tekrar tekrar
 * giderdi. Vardiya günü içinde değişirse eski slotların temizlenmemesi
 * bilinen bir sınırlama — bu senaryo nadir ve ayrı bir iyileştirme konusu.
 */
export async function ensureTodayPatrolAssignments(
  supabase: SupabaseClient,
  dateStr: string,
  dayTypes: string[]
): Promise<void> {
  const { data: shiftRows } = await supabase
    .from("shift_assignments")
    .select("personnel_id, shift_code, personnel:personnel_id(id, department_id, location_id)")
    .eq("shift_date", dateStr)
    .eq("status", "published");

  if (!shiftRows || shiftRows.length === 0) return;

  const { data: scheds } = await supabase
    .from("patrol_schedules")
    .select("id, start_time, interval_minutes, end_time, route_id, shift_code")
    .eq("is_active", true)
    .in("day_type", dayTypes);

  if (!scheds || scheds.length === 0) return;

  const { data: routes } = await supabase
    .from("patrol_routes")
    .select("id, department_id, location_id")
    .eq("is_active", true);

  if (!routes || routes.length === 0) return;

  type Personnel = { id: string; department_id: string; location_id: string | null };
  const upserts: { personnel_id: string; route_id: string; date: string; scheduled_time: string }[] = [];

  for (const row of shiftRows as unknown as { personnel_id: string; shift_code: string; personnel: Personnel | null }[]) {
    const p = row.personnel;
    if (!p) continue;

    const matchedScheds = scheds.filter(s => s.shift_code === null || s.shift_code.split(",").includes(row.shift_code));
    if (matchedScheds.length === 0) continue;

    const candidateRouteIds = new Set(matchedScheds.map(s => s.route_id));
    const matchedRoute = routes.find(
      r => candidateRouteIds.has(r.id) && r.department_id === p.department_id && (r.location_id === p.location_id || r.location_id === null)
    );
    if (!matchedRoute) continue;

    // Aynı vardiya koduna ve rotaya birden fazla zaman planı bağlı olabilir
    // (örn. "13:00-14:00" ve "19:00-20:00" ikisi de Vardiya 2) — hepsinin
    // slotları üretilmeli, sadece ilk eşleşen değil.
    const schedsForRoute = matchedScheds.filter(s => s.route_id === matchedRoute.id);
    for (const sched of (schedsForRoute.length > 0 ? schedsForRoute : [matchedScheds[0]])) {
      const slots = generateTimeSlots(sched.start_time, sched.interval_minutes, sched.end_time);
      slots.forEach(time => upserts.push({ personnel_id: p.id, route_id: matchedRoute.id, date: dateStr, scheduled_time: time }));
    }
  }

  if (upserts.length > 0) {
    await supabase.from("patrol_assignments").upsert(upserts, { onConflict: "personnel_id,date,scheduled_time", ignoreDuplicates: true });
  }
}
