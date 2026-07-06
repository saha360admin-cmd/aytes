import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  const { department_slug, phone, security_code, new_password } = await request.json();

  if (!department_slug || !phone || !security_code || !new_password) {
    return NextResponse.json({ error: "Tüm alanlar gerekli" }, { status: 400 });
  }
  if (new_password.length < 6) {
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı" }, { status: 400 });
  }

  const { data: dept } = await supabaseAdmin
    .from("departments")
    .select("id")
    .eq("slug", department_slug)
    .single();

  if (!dept) {
    return NextResponse.json({ status: "not_found" });
  }

  const { data: person } = await supabaseAdmin
    .from("personnel")
    .select("id, auth_id, security_code")
    .eq("department_id", dept.id)
    .eq("phone", phone)
    .neq("status", "archived")
    .maybeSingle();

  if (!person) {
    return NextResponse.json({ status: "not_found" });
  }

  if (!person.security_code || person.security_code !== security_code || !person.auth_id) {
    return NextResponse.json({ status: "invalid_code" });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(person.auth_id, { password: new_password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: "reset_ok" });
}
