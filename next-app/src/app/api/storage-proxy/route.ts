import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Invalid URL", { status: 400 });

  const match = url.match(/\/incident-photos\/(.+)$/);
  if (!match) return new NextResponse("Invalid path", { status: 400 });

  const path = match[1];

  const { data, error } = await supabaseAdmin.storage
    .from("incident-photos")
    .download(path);

  if (error || !data) return new NextResponse("Not found", { status: 404 });

  const buffer = await data.arrayBuffer();
  const contentType = data.type || "image/jpeg";

  const isDownload = req.nextUrl.searchParams.get("download") === "1";
  const filename = path.split("/").pop() || "photo.jpg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      ...(isDownload && { "Content-Disposition": `attachment; filename="${filename}"` }),
    },
  });
}
