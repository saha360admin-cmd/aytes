import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Invalid URL", { status: 400 });

  const photoMatch = url.match(/\/incident-photos\/(.+)$/);
  const videoMatch = url.match(/\/incident-videos\/(.+)$/);

  let bucket: string;
  let path: string;

  if (photoMatch) {
    bucket = "incident-photos";
    path = photoMatch[1];
  } else if (videoMatch) {
    bucket = "incident-videos";
    path = videoMatch[1];
  } else {
    return new NextResponse("Invalid path", { status: 400 });
  }

  const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const rangeHeader = req.headers.get("range");
  const fetchHeaders: HeadersInit = {
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  const upstream = await fetch(storageUrl, { headers: fetchHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isDownload = req.nextUrl.searchParams.get("download") === "1";
  const filename = path.split("/").pop() || "file";
  const contentType =
    upstream.headers.get("content-type") ||
    (bucket === "incident-videos" ? "video/mp4" : "image/jpeg");

  const responseHeaders: HeadersInit = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
    "Accept-Ranges": "bytes",
    ...(isDownload && { "Content-Disposition": `attachment; filename="${filename}"` }),
  };

  const contentRange = upstream.headers.get("content-range");
  const contentLength = upstream.headers.get("content-length");
  if (contentRange) responseHeaders["Content-Range"] = contentRange;
  if (contentLength) responseHeaders["Content-Length"] = contentLength;

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
