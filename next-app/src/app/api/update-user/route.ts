import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
  const { auth_id, phone, password } = await request.json();

  if (!auth_id) {
    return NextResponse.json({ error: "auth_id eksik" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (phone)    updates.email    = `${phone.replace(/\s/g, "")}@aytes.app`;
  if (password) updates.password = password;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_id, updates);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
