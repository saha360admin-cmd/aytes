// Paylaşılan NFC tarama yardımcıları — giris-cikis, beaconlar (admin), devriye-planlama
// (admin) ve devriye (checkpoint doğrulama) sayfalarının hepsi aynı
// CapacitorNfc.startScanning/addListener/timeout/cleanup mantığını kullanıyordu.

const DEFAULT_SCAN_TIMEOUT_MS = 20000;

export function formatTagUid(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, "0")).join(":");
}

export interface ScanNfcTagOptions {
  /** Varsayılan: 20 saniye. */
  timeoutMs?: number;
  alertMessage?: string;
  /**
   * Verilirse, okunan UID bu fonksiyona uymadığı sürece tarama durdurulmaz —
   * kullanıcı farklı bir etiketi denemeye devam edebilir (giris-cikis'in
   * "birden fazla olası etiketten birini bul" akışı için). Verilmezse ilk
   * okunan etiketin UID'si döner (admin ekranlarındaki tekil tarama akışı).
   */
  isMatch?: (uid: string) => boolean;
}

/**
 * Bir NFC taramasını başlatır, eşleşen (veya isMatch verilmemişse ilk) etiketin
 * UID'sini döner. Zaman aşımında veya tarama başlatılamazsa null döner.
 */
export async function scanNfcTagOnce(options?: ScanNfcTagOptions): Promise<string | null> {
  const { CapacitorNfc } = await import("@capgo/capacitor-nfc");

  let settled = false;
  let resolveResult!: (uid: string | null) => void;
  const result = new Promise<string | null>(res => { resolveResult = res; });

  const finish = async (uid: string | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    await listener.remove();
    await CapacitorNfc.stopScanning().catch(() => {});
    resolveResult(uid);
  };

  const timeoutId = setTimeout(() => finish(null), options?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS);

  // Dinleyicinin tam olarak kaydolduğundan emin olmadan taramayı başlatmak
  // (startScanning'i beklemeden çağırmak) etiket olayının kaçırılmasına yol
  // açıyordu — addListener burada mutlaka startScanning'den önce beklenmeli.
  const listener = await CapacitorNfc.addListener("nfcEvent", (event) => {
    if (settled || !event.tag?.id) return;
    const uid = formatTagUid(event.tag.id);
    if (options?.isMatch && !options.isMatch(uid)) return; // farklı etiket dene, taramayı sürdür
    finish(uid);
  });

  try {
    await CapacitorNfc.startScanning({ alertMessage: options?.alertMessage ?? "Telefonunuzu NFC etiketine yaklaştırın" });
  } catch {
    await finish(null);
  }

  return result;
}

/** Taramayı dışarıdan (örn. bileşen unmount olurken) iptal etmek için. */
export async function stopNfcScan(): Promise<void> {
  const { CapacitorNfc } = await import("@capgo/capacitor-nfc");
  await CapacitorNfc.stopScanning().catch(() => {});
}
