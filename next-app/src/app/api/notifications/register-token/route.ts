import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { personnelId, token, platform } = await req.json();

    if (!personnelId || !token || !platform || !["web", "android"].includes(platform)) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    const { error } = await adminSupabase
      .from("push_tokens")
      .upsert(
        { personnel_id: personnelId, token, platform, last_seen_at: new Date().toISOString() },
        { onConflict: "token" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sunucu hatası";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
