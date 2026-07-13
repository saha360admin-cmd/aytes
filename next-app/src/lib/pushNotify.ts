import { createClient } from "@supabase/supabase-js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function firebaseApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env dosyalarında \n literal string olarak saklanır, gerçek satır
      // sonuna çevrilmesi gerekir.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export type NotificationType = "vardiya" | "devriye" | "olay";

export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * personnelIds içindeki her kişi için bir `notifications` satırı yazar
 * (push izni olmasa/reddedilmiş olsa bile uygulama içi geçmişte kalır) ve
 * kayıtlı push_tokens'a FCM üzerinden bildirim gönderir. Geçersiz/silinmiş
 * token'lar (registration-token-not-registered) push_tokens'tan temizlenir.
 */
export async function notifyPersonnel(personnelIds: string[], payload: NotifyPayload): Promise<void> {
  const ids = [...new Set(personnelIds)].filter(Boolean);
  if (ids.length === 0) return;

  const { type, title, body, data } = payload;

  const { error: insertError } = await supabaseAdmin.from("notifications").insert(
    ids.map(personnel_id => ({ personnel_id, type, title, body, data: data ?? null }))
  );
  if (insertError) throw new Error(insertError.message);

  const { data: tokenRows } = await supabaseAdmin
    .from("push_tokens")
    .select("token")
    .in("personnel_id", ids);

  const tokens = (tokenRows ?? []).map(r => r.token);
  if (tokens.length === 0) return;

  const messaging = getMessaging(firebaseApp());
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { type, ...(data ?? {}) },
  });

  const deadTokens = res.responses
    .map((r, i) => ({ r, token: tokens[i] }))
    .filter(({ r }) => !r.success && r.error?.code === "messaging/registration-token-not-registered")
    .map(({ token }) => token);

  if (deadTokens.length > 0) {
    await supabaseAdmin.from("push_tokens").delete().in("token", deadTokens);
  }
}
