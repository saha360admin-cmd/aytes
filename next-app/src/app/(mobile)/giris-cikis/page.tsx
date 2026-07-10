"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const APPLE_COMPANY_ID = "76"; // iBeacon manufacturer data is advertised under Apple's BLE company ID (0x004C = 76)
const SCAN_TIMEOUT_MS = 10000;

// Standard iBeacon manufacturer data layout (after the company-ID key is stripped by the
// plugin): type(1) + length(1) + uuid(16) + major(2) + minor(2) + measured power(1) = 23 bytes.
function parseIBeacon(data: DataView): { uuid: string; major: number; minor: number } | null {
  if (data.byteLength < 23 || data.getUint8(0) !== 0x02 || data.getUint8(1) !== 0x15) return null;
  let hex = "";
  for (let i = 2; i < 18; i++) hex += data.getUint8(i).toString(16).padStart(2, "0");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const major = data.getUint16(18, false);
  const minor = data.getUint16(20, false);
  return { uuid, major, minor };
}

type ScanState = "idle" | "scanning" | "found" | "notfound" | "recording" | "success" | "error" | "unsupported";

interface AttendanceRecord {
  id: string;
  type: "entry" | "exit";
  recorded_at: string;
  verified: boolean;
  rssi: number | null;
}

interface BeaconConfig {
  id: string;
  uuid: string;
  major: number;
  minor: number;
  min_rssi: number;
  name: string;
}

export default function GirisCikisPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [pendingType, setPendingType] = useState<"entry" | "exit" | null>(null);
  const [beacons, setBeacons] = useState<BeaconConfig[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setDetectedRssi] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const scanningRef = useRef(false);

  // Real BLE scanning (needed to read iBeacon UUID/major/minor/RSSI) only works through
  // the native plugin bridge — Web Bluetooth in a plain browser can't passively scan for
  // beacon advertisements at all, so we don't even try there.
  const isNative = Capacitor.isNativePlatform();

  const load = useCallback(async () => {
    if (!personnel) return;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const [bRes, rRes] = await Promise.all([
      supabase.from("beacons")
        .select("id, uuid, major, minor, min_rssi, name")
        .eq("department_id", personnel.department_id)
        .eq("active", true),
      supabase.from("attendance_records")
        .select("id, type, recorded_at, verified, rssi")
        .eq("personnel_id", personnel.id)
        .gte("recorded_at", startOfDay)
        .lt("recorded_at", endOfDay)
        .order("recorded_at", { ascending: false }),
    ]);

    setBeacons(bRes.data || []);
    setTodayRecords(rRes.data || []);
    setLoading(false);

    if (!isNative) setScanState("unsupported");
  }, [personnel, isNative]);

  useEffect(() => { if (personnel) load(); }, [personnel, load]);

  // Hard requirement: stop an in-progress scan if the user navigates away mid-scan.
  useEffect(() => {
    return () => {
      if (scanningRef.current) {
        import("@capacitor-community/bluetooth-le").then(({ BleClient }) => {
          BleClient.stopLEScan().catch(() => {});
        });
      }
    };
  }, []);

  const lastRecord = todayRecords[0] ?? null;
  const nextAction: "entry" | "exit" = lastRecord?.type === "entry" ? "exit" : "entry";

  async function startScan(type: "entry" | "exit") {
    if (!personnel || beacons.length === 0) {
      setErrorMsg("Sistemde tanımlı beacon bulunamadı. Yönetici ile iletişime geçin.");
      setScanState("error");
      return;
    }
    setPendingType(type);
    setScanState("scanning");
    setDetectedRssi(null);
    setErrorMsg("");

    try {
      const { BleClient } = await import("@capacitor-community/bluetooth-le");
      await BleClient.initialize();

      scanningRef.current = true;
      let settled = false;

      const finishScan = async () => {
        scanningRef.current = false;
        try { await BleClient.stopLEScan(); } catch { /* already stopped */ }
      };

      const timeoutId = setTimeout(async () => {
        if (settled) return;
        settled = true;
        await finishScan();
        setScanState("notfound");
      }, SCAN_TIMEOUT_MS);

      await BleClient.requestLEScan({}, async (result) => {
        if (settled) return;
        const appleData = result.manufacturerData?.[APPLE_COMPANY_ID];
        if (!appleData) return;
        const parsed = parseIBeacon(appleData);
        if (!parsed) return;

        const matched = beacons.find(b =>
          b.uuid.toLowerCase() === parsed.uuid.toLowerCase() &&
          b.major === parsed.major &&
          b.minor === parsed.minor
        );
        const rssi = result.rssi ?? -999;
        if (!matched || rssi < matched.min_rssi) return;

        settled = true;
        clearTimeout(timeoutId);
        await finishScan();
        setScanState("found");
        setDetectedRssi(rssi);
        await recordAttendance(type, matched, rssi);
      });
    } catch (err) {
      scanningRef.current = false;
      const e = err as { message?: string } | null;
      setErrorMsg(e?.message || "Bluetooth hatası");
      setScanState("error");
    }
  }

  async function recordAttendance(type: "entry" | "exit", matchedBeacon: BeaconConfig, rssi: number) {
    if (!personnel) return;
    setScanState("recording");

    const { error } = await supabase.from("attendance_records").insert({
      personnel_id: personnel.id,
      department_id: personnel.department_id,
      location_id: personnel.location_id || null,
      type,
      beacon_uuid: matchedBeacon.uuid,
      rssi,
      verified: true,
      recorded_at: new Date().toISOString(),
    });

    if (error) {
      setErrorMsg("Kayıt hatası: " + error.message);
      setScanState("error");
    } else {
      setScanState("success");
      setTimeout(() => {
        setScanState("idle");
        setPendingType(null);
        load();
      }, 2500);
    }
  }

  // iOS / desteklenmeyen cihazlar için manuel kayıt (beacon doğrulaması olmadan)
  async function recordManual(type: "entry" | "exit") {
    if (!personnel) return;
    setScanState("recording");
    const { error } = await supabase.from("attendance_records").insert({
      personnel_id: personnel.id,
      department_id: personnel.department_id,
      location_id: personnel.location_id || null,
      type,
      beacon_uuid: null,
      rssi: null,
      verified: false,
      recorded_at: new Date().toISOString(),
    });
    if (error) { setErrorMsg("Kayıt hatası: " + error.message); setScanState("error"); }
    else {
      setScanState("success");
      setTimeout(() => { setScanState("idle"); load(); }, 2500);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
      <span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span>
    </div>
  );

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white shadow-sm flex items-center gap-3 px-4 h-16">
        <button onClick={() => router.push("/dashboard")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-blue-800">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-blue-800 text-lg">Giriş / Çıkış</h1>
          <p className="text-xs text-gray-400">Bluetooth ile doğrulamalı kayıt</p>
        </div>
      </header>

      <main className="px-5 pt-5 space-y-5">

        {/* Ana buton alanı */}
        <div className="bg-white rounded-3xl shadow-sm p-6 flex flex-col items-center gap-5">

          {/* Durum göstergesi */}
          {scanState === "idle" && (
            <>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center
                ${nextAction === "entry" ? "bg-emerald-100" : "bg-red-100"}`}>
                <span className={`material-symbols-outlined text-[48px]
                  ${nextAction === "entry" ? "text-emerald-600" : "text-red-500"}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}>
                  {nextAction === "entry" ? "login" : "logout"}
                </span>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-800">
                  {nextAction === "entry" ? "İşletmeye Giriş" : "İşletmeden Çıkış"}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {nextAction === "entry"
                    ? "Beacon yakınınızda olduğunda giriş yapın"
                    : "Çıkmadan önce kaydı tamamlayın"}
                </p>
              </div>

              {isNative ? (
                <button
                  onClick={() => startScan(nextAction)}
                  className={`w-full py-5 rounded-2xl text-white text-base font-bold flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg
                    ${nextAction === "entry"
                      ? "shadow-emerald-200"
                      : "shadow-red-200"}`}
                  style={{
                    background: nextAction === "entry"
                      ? "linear-gradient(135deg, #1B5E20, #2E7D32)"
                      : "linear-gradient(135deg, #B71C1C, #C62828)"
                  }}>
                  <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>bluetooth_searching</span>
                  {nextAction === "entry" ? "Giriş Yap" : "Çıkış Yap"}
                </button>
              ) : (
                <div className="w-full space-y-3">
                  <div className="bg-amber-50 rounded-xl p-3 flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-[18px] flex-shrink-0 mt-0.5">warning</span>
                    <p className="text-xs text-amber-700">Beacon taraması yalnızca mobil uygulamada çalışır. Manuel kayıt yapılacak, doğrulamasız işaretlenecek.</p>
                  </div>
                  <button
                    onClick={() => recordManual(nextAction)}
                    className="w-full py-5 rounded-2xl text-white text-base font-bold flex items-center justify-center gap-3 active:scale-95 transition-all"
                    style={{ background: "linear-gradient(135deg, #455A64, #607D8B)" }}>
                    <span className="material-symbols-outlined text-[24px]">edit_note</span>
                    Manuel {nextAction === "entry" ? "Giriş" : "Çıkış"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Taranıyor */}
          {scanState === "scanning" && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-60" />
                <div className="absolute inset-2 rounded-full bg-blue-200 animate-ping opacity-40" style={{ animationDelay: "0.3s" }} />
                <div className="relative w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>bluetooth_searching</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-800">Beacon Aranıyor...</p>
                <p className="text-sm text-gray-400 mt-1">Lütfen cihazı seçin</p>
              </div>
            </div>
          )}

          {/* Kaydediliyor */}
          {scanState === "recording" && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-blue-700 text-[40px]">progress_activity</span>
              </div>
              <p className="text-lg font-bold text-gray-800">Kaydediliyor...</p>
            </div>
          )}

          {/* Başarılı */}
          {scanState === "success" && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center
                ${pendingType === "entry" ? "bg-emerald-100" : "bg-red-100"}`}>
                <span className={`material-symbols-outlined text-[48px]
                  ${pendingType === "entry" ? "text-emerald-600" : "text-red-500"}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-800">
                  {pendingType === "entry" ? "Giriş Kaydedildi!" : "Çıkış Kaydedildi!"}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          )}

          {/* Bulunamadı */}
          {scanState === "notfound" && (
            <div className="flex flex-col items-center gap-5 py-4 w-full">
              <div className="w-24 h-24 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-500 text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>bluetooth_disabled</span>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-800">Beacon Bulunamadı</p>
                <p className="text-sm text-gray-400 mt-1">İşletme girişinde olduğunuzdan emin olun ve tekrar deneyin</p>
              </div>
              <button onClick={() => setScanState("idle")}
                className="w-full py-3.5 rounded-2xl font-bold text-white active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                Tekrar Dene
              </button>
            </div>
          )}

          {/* Hata */}
          {scanState === "error" && (
            <div className="flex flex-col items-center gap-5 py-4 w-full">
              <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-800">Hata Oluştu</p>
                {errorMsg && <p className="text-sm text-red-500 mt-1">{errorMsg}</p>}
              </div>
              <button onClick={() => setScanState("idle")}
                className="w-full py-3.5 rounded-2xl font-bold bg-gray-100 text-gray-700 active:scale-95 transition-all">
                Geri Dön
              </button>
            </div>
          )}

          {/* Desteklenmiyor */}
          {scanState === "unsupported" && (
            <div className="flex flex-col items-center gap-5 py-4 w-full">
              <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-gray-400 text-[48px]">bluetooth_disabled</span>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-800">Beacon Taraması Kullanılamıyor</p>
                <p className="text-sm text-gray-400 mt-1">Doğrulamalı giriş yalnızca AYTES mobil uygulamasında çalışır.</p>
              </div>
              <button onClick={() => recordManual(nextAction)}
                className="w-full py-4 rounded-2xl font-bold text-white active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #455A64, #607D8B)" }}>
                Manuel Kayıt Yap
              </button>
            </div>
          )}
        </div>

        {/* Bugünkü kayıtlar */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Bugünkü Kayıtlar</h3>
          {todayRecords.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px]">history</span>
              <p className="text-gray-400 text-sm">Henüz kayıt yok</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {todayRecords.map((r, i) => (
                <div key={r.id}>
                  {i > 0 && <div className="h-px bg-gray-100 mx-5" />}
                  <div className="flex items-center gap-4 p-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                      ${r.type === "entry" ? "bg-emerald-100" : "bg-red-100"}`}>
                      <span className={`material-symbols-outlined text-[20px]
                        ${r.type === "entry" ? "text-emerald-600" : "text-red-500"}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}>
                        {r.type === "entry" ? "login" : "logout"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">
                        {r.type === "entry" ? "Giriş" : "Çıkış"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTime(r.recorded_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {r.verified ? (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="material-symbols-outlined text-[11px]">verified</span>
                          Doğrulandı
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          Manuel
                        </span>
                      )}
                      {r.rssi && (
                        <span className="text-[10px] text-gray-400">{r.rssi} dBm</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
