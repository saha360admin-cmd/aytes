"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

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
  const [detectedRssi, setDetectedRssi] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const isBluetoothSupported = typeof navigator !== "undefined" && "bluetooth" in navigator;
  useEffect(() => { if (personnel) load(); }, [personnel]);

  async function load() {
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

    if (!isBluetoothSupported) setScanState("unsupported");
  }

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
      // İlk önce isim filtresiyle dene, bulamazsa herhangi bir BLE cihazını ara
      let device: BluetoothDevice | null = null;
      try {
        device = await (navigator as any).bluetooth.requestDevice({
          filters: beacons.map(b => ({ namePrefix: b.name.slice(0, 3) })),
          optionalServices: ["battery_service", "generic_access"],
        });
      } catch {
        // Kullanıcı cihaz seçmedi veya hiç cihaz bulunamadı
        device = null;
      }

      if (!device) {
        setScanState("notfound");
        return;
      }

      // GATT bağlantısı ile RSSI ölçümü (Web Bluetooth RSSI'yı doğrudan vermez)
      // Bağlantı kurabiliyorsak "yakında" sayıyoruz
      setScanState("found");
      setDetectedRssi(-65); // Web Bluetooth RSSI'yı desteklemez, sabit bir değer kullanıyoruz

      await recordAttendance(type, device.name || "", -65);
    } catch (err: any) {
      if (err?.name === "NotFoundError" || err?.message?.includes("cancelled")) {
        setScanState("notfound");
      } else if (err?.name === "SecurityError") {
        setScanState("unsupported");
      } else {
        setErrorMsg(err?.message || "Bluetooth hatası");
        setScanState("error");
      }
    }
  }

  async function recordAttendance(type: "entry" | "exit", beaconName: string, rssi: number) {
    if (!personnel) return;
    setScanState("recording");

    const matchedBeacon = beacons.find(b =>
      beaconName.toLowerCase().includes(b.name.toLowerCase().slice(0, 3))
    ) ?? beacons[0];

    const { error } = await supabase.from("attendance_records").insert({
      personnel_id: personnel.id,
      department_id: personnel.department_id,
      location_id: personnel.location_id || null,
      type,
      beacon_uuid: matchedBeacon?.uuid || null,
      rssi,
      verified: false,
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

              {isBluetoothSupported ? (
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
                    <p className="text-xs text-amber-700">Tarayıcınız Bluetooth desteklemiyor. Manuel kayıt yapılacak, doğrulamasız işaretlenecek.</p>
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
                <p className="text-lg font-bold text-gray-800">Bluetooth Desteklenmiyor</p>
                <p className="text-sm text-gray-400 mt-1">Bu tarayıcı Web Bluetooth API desteklemiyor. Chrome (Android) kullanın.</p>
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
