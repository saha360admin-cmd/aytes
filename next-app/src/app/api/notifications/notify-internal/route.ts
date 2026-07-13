import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyPersonnel, type NotificationType } from "@/lib/pushNotify";

const VALID_TYPES: NotificationType[] = ["vardiya", "devriye", "olay"];

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Client-side aksiyonlardan (vardiya yayınlama, olay bildirme) sonra
// çağrılan iç route — Firebase servis hesabı bilgileri sadece sunucuda
// kalsın diye notifyPersonnel() burada, API route içinde çalıştırılır.
//
// Hedef ya doğrudan `personnelIds` (gönderen zaten kimin bildirileceğini
// biliyor — ör. vardiya değişen kişiler) ya da `departmentIds` (olay
// bildirme gibi çapraz-departman durumlarda, hedef departmanların
// admin/supervisor'ları) olarak verilir. departmentIds tercih edilme
// nedeni: personnel tablosunun RLS'i client'ı kendi departmanıyla
// sınırlıyor, bu yüzden başka departmanların personelini client-side
// sorgulayamıyoruz — çözüm burada, service-role ile yapılıyor.
export async function POST(req: NextRequest) {
  try {
    const { personnelIds, departmentIds, type, title, body, data } = await req.json();

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Geçersiz type" }, { status: 400 });
    }
    if (!title || !body) {
      return NextResponse.json({ error: "Eksik parametre: title/body" }, { status: 400 });
    }

    let targetIds: string[];
    if (Array.isArray(personnelIds) && personnelIds.length > 0) {
      targetIds = personnelIds;
    } else if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      const { data: rows, error } = await supabaseAdmin
        .from("personnel")
        .select("id")
        .in("department_id", departmentIds)
        .in("role", ["admin", "supervisor"])
        .eq("status", "active");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      targetIds = (rows ?? []).map(r => r.id);
    } else {
      return NextResponse.json({ error: "Eksik parametre: personnelIds veya departmentIds" }, { status: 400 });
    }

    if (targetIds.length === 0) return NextResponse.json({ success: true, notified: 0 });

    await notifyPersonnel(targetIds, { type, title, body, data });

    return NextResponse.json({ success: true, notified: targetIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
