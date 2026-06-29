import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Mevcut personnel kaydına Supabase auth hesabı oluşturur veya mevcut hesabı bağlar
export async function POST(request: Request) {
  const { personnel_id, phone, password } = await request.json();

  if (!personnel_id || !phone || !password) {
    return NextResponse.json({ error: "personnel_id, phone ve password zorunlu" }, { status: 400 });
  }

  const email = `${phone.replace(/\s/g, "")}@aytes.app`;

  // Personnel kaydında auth_id var mı?
  const { data: existing } = await supabaseAdmin
    .from("personnel")
    .select("auth_id")
    .eq("id", personnel_id)
    .single();

  if (existing?.auth_id) {
    // Zaten bağlı — sadece şifre güncelle
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.auth_id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, action: "updated" });
  }

  // Yeni auth kullanıcısı oluşturmayı dene
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    // Email zaten kayıtlı → mevcut auth kullanıcısını bul ve bağla
    const isEmailExists =
      authError.message?.toLowerCase().includes("already") ||
      authError.message?.toLowerCase().includes("registered") ||
      (authError as any).code === "user_already_exists";

    if (isEmailExists) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const found = listData?.users?.find((u) => u.email === email);
      if (found) {
        // Şifresini güncelle ve personnel'a bağla
        await supabaseAdmin.auth.admin.updateUserById(found.id, { password });
        await supabaseAdmin.from("personnel").update({ auth_id: found.id, email }).eq("id", personnel_id);
        return NextResponse.json({ success: true, action: "linked" });
      }
    }

    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Personnel kaydına auth_id ve email bağla
  const { error: updateError } = await supabaseAdmin
    .from("personnel")
    .update({ auth_id: authData.user.id, email })
    .eq("id", personnel_id);

  if (updateError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, action: "created" });
}
