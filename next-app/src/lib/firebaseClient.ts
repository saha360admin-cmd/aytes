import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";

// Firebase Console > Project settings > General > "Your apps" > Web app
// altındaki config değerleri — Faz 0'da alınıp .env.local'e eklenmesi
// gereken NEXT_PUBLIC_* değişkenler.
export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}
