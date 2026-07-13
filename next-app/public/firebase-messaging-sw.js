// Firebase Cloud Messaging arkaplan bildirimleri için service worker.
// Next.js build sistemi dışında, düz bir statik dosya olarak sunulur — bu
// yüzden config değerlerini process.env üzerinden okuyamıyor. Bunun yerine
// registerWebPush() (src/lib/pushRegister.ts) bu dosyayı query string'e
// firebaseConfig'i ekleyerek register eder, biz de burada self.location.search'ten okuruz.
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? "AYTES", {
    body: body ?? "",
    icon: "/globe.svg",
    data: payload.data,
  });
});
