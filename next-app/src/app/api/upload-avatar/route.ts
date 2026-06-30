import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const personnelId = formData.get("personnelId") as string | null;

    if (!file || !personnelId) {
      return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `personnel/${personnelId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data, error } = await adminSupabase.storage
      .from("avatars")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = adminSupabase.storage.from("avatars").getPublicUrl(data.path);
    const proxyUrl = `/api/storage-proxy?url=${encodeURIComponent(urlData.publicUrl)}`;

    await adminSupabase
      .from("personnel")
      .update({ avatar_url: proxyUrl })
      .eq("id", personnelId);

    return NextResponse.json({ avatar_url: proxyUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Sunucu hatası" }, { status: 500 });
  }
}
