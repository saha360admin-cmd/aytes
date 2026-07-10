"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Beacon {
  id: string;
  name: string;
  uuid: string;
  major: number;
  minor: number;
  min_rssi: number;
  active: boolean;
  location_id: string | null;
  location?: { name: string } | null;
}

interface Location {
  id: string;
  name: string;
}

const EMPTY_FORM = { name: "", uuid: "", location_id: "", active: true };

export default function BeaconlarPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<"new" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [scanningTag, setScanningTag] = useState(false);

  async function scanTag() {
    setScanningTag(true);
    try {
      const { CapacitorNfc } = await import("@capgo/capacitor-nfc");
      const listener = await CapacitorNfc.addListener("nfcEvent", async (event) => {
        await listener.remove();
        await CapacitorNfc.stopScanning().catch(() => {});
        setScanningTag(false);
        if (event.tag?.id) {
          const uid = event.tag.id.map(b => b.toString(16).padStart(2, "0")).join(":");
          setForm(p => ({ ...p, uuid: uid }));
        }
      });
      await CapacitorNfc.startScanning({ alertMessage: "Kaydedilecek etiketi telefona yaklaştırın" });
    } catch {
      setScanningTag(false);
      setToast("NFC taranamadı — bu cihazda NFC olmayabilir");
      setTimeout(() => setToast(""), 3000);
    }
  }

  const load = useCallback(async () => {
    if (!personnel) return;
    const [bRes, lRes] = await Promise.all([
      supabase.from("beacons")
        .select("id, name, uuid, major, minor, min_rssi, active, location_id, location:locations(name)")
        .eq("department_id", personnel.department_id)
        .order("created_at", { ascending: false }),
      supabase.from("locations")
        .select("id, name")
        .order("name"),
    ]);
    setBeacons((bRes.data || []) as unknown as Beacon[]);
    setLocations(lRes.data || []);
    setLoading(false);
  }, [personnel]);

  useEffect(() => { if (personnel) load(); }, [personnel, load]);

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setSheet("new");
  }

  function openEdit(b: Beacon) {
    setForm({
      name: b.name,
      uuid: b.uuid,
      location_id: b.location_id || "",
      active: b.active,
    });
    setEditId(b.id);
    setSheet("edit");
  }

  async function save() {
    if (!personnel) return;
    if (!form.name.trim() || !form.uuid.trim()) {
      setToast("Ad ve UID zorunlu"); setTimeout(() => setToast(""), 3000); return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      uuid: form.uuid.trim().toLowerCase(),
      // NFC etiketleri için kullanılmıyor — beacons tablosunun eski BLE alanları, şema
      // değişikliği yapmamak için sabit değerlerle dolduruluyor.
      major: 0,
      minor: 0,
      min_rssi: 0,
      location_id: form.location_id || null,
      active: form.active,
      department_id: personnel.department_id,
    };
    const { error } = editId
      ? await supabase.from("beacons").update(payload).eq("id", editId)
      : await supabase.from("beacons").insert(payload);
    if (error) { setToast("Hata: " + error.message); setTimeout(() => setToast(""), 4000); }
    else { setSheet(null); load(); }
    setSaving(false);
  }

  async function toggleActive(b: Beacon) {
    const { error } = await supabase.from("beacons").update({ active: !b.active }).eq("id", b.id);
    if (error) { setToast("Güncellenemedi: " + error.message); setTimeout(() => setToast(""), 3000); return; }
    setBeacons(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x));
  }

  async function deleteBeacon(id: string) {
    const { error } = await supabase.from("beacons").delete().eq("id", id);
    if (error) { setToast("Silinemedi: " + error.message); setTimeout(() => setToast(""), 3000); return; }
    setBeacons(prev => prev.filter(x => x.id !== id));
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
      <span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span>
    </div>
  );

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-white shadow-sm flex items-center gap-3 px-4 h-16">
        <button onClick={() => router.push("/yonetici")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-blue-800">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-blue-800 text-lg">NFC Etiket Yönetimi</h1>
          <p className="text-xs text-gray-400">{beacons.length} etiket tanımlı</p>
        </div>
        <button onClick={openNew}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-800 text-white active:scale-90 transition-all">
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>
      </header>

      <main className="px-4 pt-4 space-y-3">
        {beacons.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3 shadow-sm mt-4">
            <span className="material-symbols-outlined text-gray-300 text-[48px]">nfc</span>
            <p className="text-gray-500 font-semibold">Henüz NFC etiketi eklenmedi</p>
            <button onClick={openNew}
              className="mt-2 px-5 py-2.5 rounded-full text-white text-sm font-bold"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              Etiket Ekle
            </button>
          </div>
        ) : beacons.map(b => (
          <div key={b.id} className={`bg-white rounded-2xl shadow-sm border-l-4 p-4 ${b.active ? "border-l-emerald-500" : "border-l-gray-300"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${b.active ? "bg-emerald-100" : "bg-gray-100"}`}>
                  <span className={`material-symbols-outlined text-[20px] ${b.active ? "text-emerald-600" : "text-gray-400"}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>nfc</span>
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{b.name}</p>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">{b.uuid}</p>
                  {b.location && (
                    <p className="text-[11px] text-blue-600 mt-0.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">location_on</span>
                      {b.location.name}
                    </p>
                  )}
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${b.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {b.active ? "Aktif" : "Pasif"}
              </span>
            </div>

            <div className="flex gap-2 mt-3">
              <button onClick={() => openEdit(b)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 active:scale-95 transition-all">
                Düzenle
              </button>
              <button onClick={() => toggleActive(b)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all ${b.active ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                {b.active ? "Devre Dışı" : "Aktif Et"}
              </button>
              <button onClick={() => deleteBeacon(b.id)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>
        ))}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl z-50">
          {toast}
        </div>
      )}

      {/* ── Form Sheet ── */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-5 pb-8 space-y-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
              <h2 className="text-lg font-bold text-gray-800">{sheet === "new" ? "Yeni NFC Etiketi" : "NFC Etiketi Düzenle"}</h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Etiket Adı *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Örn: Ana Giriş Etiketi"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">NFC UID *</label>
                  <div className="flex gap-2">
                    <input value={form.uuid} onChange={e => setForm(p => ({ ...p, uuid: e.target.value }))}
                      placeholder="04:a1:b2:c3:d4:e5:f6"
                      className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <button type="button" onClick={scanTag} disabled={scanningTag}
                      className="flex-shrink-0 px-4 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                      style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                      <span className={`material-symbols-outlined text-[18px] ${scanningTag ? "animate-pulse" : ""}`}>nfc</span>
                      {scanningTag ? "Bekleniyor..." : "Tara"}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Etiketi telefonla okutmak için &quot;Tara&quot;ya basıp cihazı yaklaştırın</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1.5 block">Lokasyon</label>
                  <select value={form.location_id} onChange={e => setForm(p => ({ ...p, location_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                    <option value="">Lokasyon seçin (opsiyonel)</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>

                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-gray-700">Aktif</p>
                    <p className="text-xs text-gray-400">Devre dışı bırakılan etiket okutulamaz</p>
                  </div>
                  <button onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                    className={`w-12 h-6 rounded-full transition-colors relative ${form.active ? "bg-emerald-500" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.active ? "left-6" : "left-0.5"}`} />
                  </button>
                </div>
              </div>

              <button onClick={save} disabled={saving}
                className="w-full py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all mt-2"
                style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                {saving
                  ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  : <span className="material-symbols-outlined text-[18px]">save</span>}
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
