// Supabase v2 session'ı localStorage'da tutar, cookie'de değil.
// Cookie bazlı proxy session kontrolü çalışmıyor.
// Güvenlik: RLS politikaları (DB katmanı) + her sayfadaki useAuth guard'ları.
// Tam proxy desteği için: npm install @supabase/ssr + createServerClient

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(_req: NextRequest) {
  return NextResponse.next();
}
