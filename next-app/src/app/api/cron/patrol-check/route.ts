import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureTodayPatrolAssignments } from "@/lib/patrolSlots";
import { notifyPersonnel } from "@/lib/pushNotify";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const REMINDER_WINDOW_MIN = 15;
const DEFAULT_INTERVAL_MIN = 60;
const NOTIFICATION_RETENTION_DAYS = 15;

// Vercel Cron tarafından her 5-10 dakikada bir çağrılır (vercel.json).
// Basitleştirme: gece yarısını aşan devriye planlarında saat hesabı burada
// (mobile)/devriye/page.tsx'teki kadar titiz değil — cross-midnight kenar
// durumu bilinen bir sınırlama, takip eden bir iyileştirme konusu.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dateStr = toDateStr(now);
  const dow = now.getDay();
  const dayTypes = dow === 0 || dow === 6 ? ["weekend", "everyday"] : ["weekday", "everyday"];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  await ensureTodayPatrolAssignments(supabaseAdmin, dateStr, dayTypes);

  const { data: scheds } = await supabaseAdmin
    .from("patrol_schedules")
    .select("route_id, interval_minutes")
    .eq("is_active", true);
  const intervalByRoute = new Map<string, number>();
  (scheds ?? []).forEach(s => {
    if (!intervalByRoute.has(s.route_id)) intervalByRoute.set(s.route_id, s.interval_minutes);
  });

  const { data: pending } = await supabaseAdmin
    .from("patrol_assignments")
    .select("id, personnel_id, route_id, scheduled_time, reminder_sent_at")
    .eq("date", dateStr)
    .eq("status", "pending");

  const dueSoonIds: string[] = [];
  const dueSoonPersonnel = new Set<string>();
  const missedIds: string[] = [];
  const missedPersonnel = new Set<string>();

  for (const a of pending ?? []) {
    const [h, m] = a.scheduled_time.slice(0, 5).split(":").map(Number);
    const slotMin = h * 60 + m;
    const interval = intervalByRoute.get(a.route_id) ?? DEFAULT_INTERVAL_MIN;

    if (nowMin > slotMin + interval) {
      missedIds.push(a.id);
      missedPersonnel.add(a.personnel_id);
    } else if (!a.reminder_sent_at && slotMin - nowMin <= REMINDER_WINDOW_MIN && slotMin - nowMin >= 0) {
      dueSoonIds.push(a.id);
      dueSoonPersonnel.add(a.personnel_id);
    }
  }

  if (missedIds.length > 0) {
    await supabaseAdmin.from("patrol_assignments").update({ status: "missed" }).in("id", missedIds);
    await notifyPersonnel([...missedPersonnel], {
      type: "devriye",
      title: "Devriye kaçırıldı",
      body: "Planlanan bir devriye turunu zamanında başlatmadın.",
    });
  }

  if (dueSoonIds.length > 0) {
    await supabaseAdmin.from("patrol_assignments").update({ reminder_sent_at: now.toISOString() }).in("id", dueSoonIds);
    await notifyPersonnel([...dueSoonPersonnel], {
      type: "devriye",
      title: "Devriye vaktin geldi",
      body: "Yaklaşan bir devriye turun var.",
    });
  }

  // Okunmuş bildirimler zil listesinde sonsuza kadar birikmesin diye
  // NOTIFICATION_RETENTION_DAYS'ten eski, okunmuş satırlar silinir.
  // Okunmamışlar hiç silinmiyor — kullanıcı görmeden kaybolmasın diye.
  const retentionCutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count: deletedNotifications } = await supabaseAdmin
    .from("notifications")
    .delete({ count: "exact" })
    .not("read_at", "is", null)
    .lt("read_at", retentionCutoff);

  return NextResponse.json({
    checked: pending?.length ?? 0,
    reminded: dueSoonPersonnel.size,
    missed: missedPersonnel.size,
    notificationsCleaned: deletedNotifications ?? 0,
  });
}
