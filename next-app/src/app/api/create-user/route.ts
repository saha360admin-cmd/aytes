import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  const { phone, password, full_name, position, location_id, department_id, role, avatar_url } =
    await request.json();

  if (!phone || !password || !full_name) {
    return NextResponse.json({ error: "Zorunlu alanlar eksik" }, { status: 400 });
  }

  const email = `${phone.replace(/\s/g, "")}@aytes.app`;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: personnelError } = await supabaseAdmin.from("personnel").insert({
    auth_id: authData.user.id,
    full_name,
    phone,
    email,
    position,
    location_id: location_id || null,
    department_id,
    role: role || "personel",
    status: "active",
    ...(avatar_url ? { avatar_url } : {}),
  });

  if (personnelError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: personnelError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
