// Supabase Edge Function: generates short-lived Agora RTC tokens.
// AGORA_APP_CERTIFICATE never leaves this function — only the resulting token is returned.
import { createClient } from "npm:@supabase/supabase-js@2";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.5";

const AGORA_APP_ID = Deno.env.get("AGORA_APP_ID") ?? "";
const AGORA_APP_CERTIFICATE = Deno.env.get("AGORA_APP_CERTIFICATE") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const TOKEN_TTL_SECONDS = 3600;

// Real security boundary is the Supabase auth check below, not CORS — Edge Functions
// are also callable directly (curl) by anyone with a valid Supabase JWT regardless of origin.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  // Never accept anonymous callers — validate the caller is a real authenticated user.
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    return json({ error: "Agora sunucu yapılandırması eksik" }, 500);
  }

  let body: { channelName?: unknown; uid?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Geçersiz istek gövdesi" }, 400);
  }

  const { channelName, uid } = body;
  if (typeof channelName !== "string" || !channelName || !Number.isInteger(uid) || (uid as number) <= 0) {
    return json({ error: "channelName ve pozitif tam sayı uid gerekli" }, 400);
  }

  const expireTime = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid as number,
      RtcRole.PUBLISHER,
      expireTime,
      expireTime,
    );
    return json({ token });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Token üretilemedi" }, 500);
  }
});
