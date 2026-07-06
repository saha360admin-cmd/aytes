import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  const { department_slug, phone } = await request.json();

  if (!department_slug || !phone) {
    return NextResponse.json({ error: "Departman ve telefon numarası gerekli" }, { status: 400 });
  }

  const { data: dept } = await supabaseAdmin
    .from("departments")
    .select("id, name")
    .eq("slug", department_slug)
    .single();

  if (!dept) {
    return NextResponse.json({ error: "Departman bulunamadı" }, { status: 400 });
  }

  const { data: person } = await supabaseAdmin
    .from("personnel")
    .select("id, full_name")
    .eq("department_id", dept.id)
    .eq("phone", phone)
    .neq("status", "archived")
    .maybeSingle();

  if (!person) {
    return NextResponse.json({ found: false });
  }

  // Talep kendi departmanının yöneticisine düşer (İdari İşler'e değil)
  await supabaseAdmin.from("requests").insert({
    personnel_id: person.id,
    department_id: dept.id,
    type: "giris_destek",
    details: `${person.full_name} (${dept.name}) · ${phone} — giriş/şifre desteği istiyor`,
    status: "pending",
  });

  return NextResponse.json({ found: true });
}
