import { firebaseConfig, getFirebaseApp } from "./firebaseClient";

async function sendTokenToServer(personnelId: string, token: string, platform: "web" | "android") {
  await fetch("/api/notifications/register-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personnelId, token, platform }),
  }).catch(() => {});
}

async function registerWebPush(personnelId: string) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) return;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return; // Faz 0 tamamlanmadan (VAPID key yok) sessizce atlanır

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const swParams = new URLSearchParams({
      apiKey: firebaseConfig.apiKey ?? "",
      projectId: firebaseConfig.projectId ?? "",
      messagingSenderId: firebaseConfig.messagingSenderId ?? "",
      appId: firebaseConfig.appId ?? "",
    });
    const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${swParams}`);

    const { getMessaging, getToken } = await import("firebase/messaging");
    const messaging = getMessaging(getFirebaseApp());
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (token) await sendTokenToServer(personnelId, token, "web");
  } catch {
    // Bildirim izni/servis worker desteklenmiyor olabilir (ör. eski tarayıcı) — sessizce geç
  }
}

async function registerNativePush(personnelId: string) {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.addListener("registration", token => {
      sendTokenToServer(personnelId, token.value, "android");
    });
    await PushNotifications.addListener("registrationError", () => {});

    await PushNotifications.register();
  } catch {
    // Native push plugin yoksa (ör. dev tarayıcı ortamı) sessizce geç
  }
}

/** Login sonrası bir kez çağrılır — platforma göre native FCM veya web push kaydı yapar. */
export async function registerPushNotifications(personnelId: string) {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    await registerNativePush(personnelId);
  } else {
    await registerWebPush(personnelId);
  }
}
