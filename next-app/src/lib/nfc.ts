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

  return new Promise((resolve) => {
    let settled = false;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    const finish = async (uid: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      await listenerHandle?.remove();
      await CapacitorNfc.stopScanning().catch(() => {});
      resolve(uid);
    };

    const timeoutId = setTimeout(() => finish(null), options?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS);

    CapacitorNfc.addListener("nfcEvent", (event) => {
      if (settled || !event.tag?.id) return;
      const uid = formatTagUid(event.tag.id);
      if (options?.isMatch && !options.isMatch(uid)) return; // farklı etiket dene, taramayı sürdür
      finish(uid);
    }).then(handle => {
      listenerHandle = handle;
    });

    CapacitorNfc.startScanning({ alertMessage: options?.alertMessage ?? "Telefonunuzu NFC etiketine yaklaştırın" })
      .catch(() => finish(null));
  });
}

/** Taramayı dışarıdan (örn. bileşen unmount olurken) iptal etmek için. */
export async function stopNfcScan(): Promise<void> {
  const { CapacitorNfc } = await import("@capgo/capacitor-nfc");
  await CapacitorNfc.stopScanning().catch(() => {});
}
