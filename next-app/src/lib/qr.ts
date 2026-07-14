// Paylaşılan QR tarama yardımcıları — (mobile)/kat-kontrol/page.tsx'teki
// çalışan Html5Qrcode başlatma/durdurma mantığının (satır ~378-422) tekrar
// kullanılabilir hali. kat-kontrol'ün kendi kodu değiştirilmedi; bu sadece
// devriye ve giriş-çıkış'ın kullanacağı ayrı bir kopya.

export interface QrScanHandle {
  stop: () => Promise<void>;
}

export interface StartQrScanOptions {
  /** Html5Qrcode'un video/canvas'ı içine yerleştireceği boş <div id="..."> */
  regionId: string;
  onDecode: (text: string) => void;
  onCameraError?: () => void;
}

/**
 * Kamerayı başlatıp sürekli QR taramaya başlar; her başarılı okumada
 * `onDecode` çağrılır (arayan taramayı durdurup durdurmeyeceğine kendi
 * karar verir — kat-kontrol'deki gibi yanlış eşleşmede tarama devam eder).
 * Kamera açılamazsa (izin yok/cihazda kamera yok) `onCameraError` çağrılır.
 */
export async function startQrScan(options: StartQrScanOptions): Promise<QrScanHandle> {
  const { Html5Qrcode } = await import("html5-qrcode");
  const qr = new Html5Qrcode(options.regionId);
  let running = false;

  try {
    await qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 240 },
      (decodedText: string) => options.onDecode(decodedText),
      () => {} // kare başına "kod bulunamadı" hataları — normal, yok sayılır
    );
    running = true;
  } catch {
    options.onCameraError?.();
  }

  return {
    stop: async () => {
      if (!running) {
        try { qr.clear(); } catch {}
        return;
      }
      try {
        await qr.stop();
        try { qr.clear(); } catch {}
      } catch {
        // html5-qrcode zaten durmuşsa senkron olarak fırlatabilir
      }
    },
  };
}
