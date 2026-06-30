import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Supabase v2 auth cookie'si "sb-<projectRef>-auth-token" adıyla gelir.
// Cookie varlığı oturum açıldığını gösterir (JWT doğrulaması değil).
// Tam JWT doğrulaması için: npm install @supabase/ssr
function hasAuthCookie(req: NextRequest): boolean {
  return req.cookies.getAll().some(
    c => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authenticated = hasAuthCookie(req);

  if (!authenticated) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/yonetici/:path*",
    "/taseron/:path*",
    "/dashboard/:path*",
    "/vardiyalar/:path*",
    "/olaylar/:path*",
    "/olay-bildir/:path*",
    "/personel/:path*",
  ],
};
