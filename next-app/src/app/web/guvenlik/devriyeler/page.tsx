"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";

// Rota/kontrol noktası/zaman planı iş mantığı mobildeki
// (mobile)/yonetici/devriye-planlama/page.tsx ile birebir aynı — aynı
// patrol_routes/patrol_route_points/patrol_schedules tablolarını
// paylaştıkları için mobil ve masaüstü aynı kuralları uygulamalı.

const DAY_TYPES = [
  { id: "weekday", label: "Hafta İçi" },
  { id: "weekend", label: "Hafta Sonu" },
  { id: "everyday", label: "Her Gün" },
] as const;
const DAY_LABEL: Record<string, string> = { weekday: "Hafta İçi", weekend: "Hafta Sonu", everyday: "Her Gün" };
const INTERVALS = [30, 60, 90, 120, 180, 240];
const SHIFT_CODES = ["1", "2", "3", "4", "5", "6", "7", "8"];

interface Location { id: string; name: string; }
interface RoutePoint { id: string; name: string; point_order: number; nfc_uid: string | null; qr_token: string | null; }
interface Schedule {
  id: string;
  day_type: "weekday" | "weekend" | "everyday";
  start_time: string;
  interval_minutes: number;
  end_time: string | null;
  is_active: boolean;
  shift_code: string | null;
}
interface PatrolRoute {
  id: string;
  name: string;
  location_id: string | null;
  is_active: boolean;
  points: RoutePoint[];
  schedules: Schedule[];
}

export default function WebGuvenlikDevriyelerPage() {
  const { personnel, loading } = useAuth();
  const router = useRouter();
  const slug = personnel?.departments?.slug;
  const canEdit = slug === "guvenlik";
  const canView = canEdit || slug === "idari";

  // İdari İşler bu sayfayı Güvenlik'e geçerek görüntüleyebilir ama devriye
  // oluşturamaz/düzenleyemez — sadece noktaları, atılmayan devriyeleri ve
  // ihlal kayıtlarını izler (IdariDevriyeTakipView). Güvenlik yöneticisinin
  // tam CRUD yetkisi (GuvenlikDevriyelerView) değişmeden kalır.
  useEffect(() => {
    if (!loading && personnel && !canView) router.replace("/web/dashboard");
  }, [loading, personnel, canView, router]);

  if (loading || !personnel || !canView) {
    return (
      <div className="flex justify-center py-24">
        <span className="material-symbols-outlined animate-spin text-[40px] text-primary">progress_activity</span>
      </div>
    );
  }

  return canEdit ? <GuvenlikDevriyelerView /> : <IdariDevriyeTakipView />;
}

function GuvenlikDevriyelerView() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-display text-headline-lg text-on-background">Devriye Yönetimi</h1>
        <p className="text-on-surface-variant">Güvenlik departmanının devriye rotalarını tanımlayın. Devriye raporu için Raporlama sayfasına bakın.</p>
      </div>

      <PatrolRoutesSection />
    </div>
  );
}

// ───────────────────────── Devriye Rotaları (route/checkpoint/schedule CRUD) ─────────────────────────

function PatrolRoutesSection() {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [locFilter, setLocFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState("");
  const [newRouteLocId, setNewRouteLocId] = useState("");
  const [savingRoute, setSavingRoute] = useState(false);

  const [addingPointTo, setAddingPointTo] = useState<string | null>(null);
  const [newPointName, setNewPointName] = useState("");
  const [savingPoint, setSavingPoint] = useState(false);

  const [editingSched, setEditingSched] = useState<{ routeId: string; sched: Schedule | null } | null>(null);
  const [schedDayType, setSchedDayType] = useState<"weekday" | "weekend" | "everyday">("weekday");
  const [schedStart, setSchedStart] = useState("08:00");
  const [schedInterval, setSchedInterval] = useState(60);
  const [schedEnd, setSchedEnd] = useState("");
  const [schedShiftCodes, setSchedShiftCodes] = useState<string[]>([]);
  const [savingSched, setSavingSched] = useState(false);

  const [deleteRouteConfirm, setDeleteRouteConfirm] = useState<PatrolRoute | null>(null);
  const [deletingRoute, setDeletingRoute] = useState(false);

  const [qrModal, setQrModal] = useState<RoutePoint | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!qrModal?.qr_token) { setQrDataUrl(""); return; }
    QRCode.toDataURL(qrModal.qr_token, { width: 280, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [qrModal]);

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }
    setDeptId(dept.id);

    const [locRes, routeRes] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("patrol_routes").select(`
        id, name, location_id, is_active,
        points:patrol_route_points(id, name, point_order, nfc_uid, qr_token),
        schedules:patrol_schedules(id, day_type, start_time, interval_minutes, end_time, is_active, shift_code)
      `).eq("department_id", dept.id).order("created_at", { ascending: false }),
    ]);
    setLocations((locRes.data || []) as Location[]);
    setRoutes(((routeRes.data || []) as PatrolRoute[]).map(r => ({
      ...r,
      points: [...(r.points || [])].sort((a: RoutePoint, b: RoutePoint) => a.point_order - b.point_order),
      schedules: r.schedules || [],
    })));
    setLoading(false);
  }

  async function createRoute() {
    if (!newRouteName.trim() || !deptId) return;
    setSavingRoute(true);
    const { data, error } = await supabase.from("patrol_routes")
      .insert({ name: newRouteName.trim(), location_id: newRouteLocId || null, department_id: deptId })
      .select("id, name, location_id, is_active").single();
    if (!error && data) {
      setRoutes(p => [{ ...data, points: [], schedules: [] }, ...p]);
      setExpandedId(data.id);
      setShowNewRoute(false);
      setNewRouteName("");
      setNewRouteLocId("");
      flash("Rota oluşturuldu", true);
    } else flash(error?.message ?? "Hata", false);
    setSavingRoute(false);
  }

  async function addPoint(routeId: string) {
    if (!newPointName.trim()) return;
    setSavingPoint(true);
    const route = routes.find(r => r.id === routeId);
    const { data, error } = await supabase.from("patrol_route_points")
      .insert({ route_id: routeId, name: newPointName.trim(), point_order: (route?.points.length ?? 0) + 1 })
      .select("id, name, point_order, nfc_uid, qr_token").single();
    if (!error && data) {
      setRoutes(p => p.map(r => r.id === routeId ? { ...r, points: [...r.points, data] } : r));
      setNewPointName("");
      setAddingPointTo(null);
      flash("Nokta eklendi", true);
    } else flash(error?.message ?? "Hata", false);
    setSavingPoint(false);
  }

  async function deletePoint(routeId: string, pointId: string) {
    await supabase.from("patrol_route_points").delete().eq("id", pointId);
    setRoutes(p => p.map(r => r.id === routeId
      ? { ...r, points: r.points.filter(pt => pt.id !== pointId).map((pt, i) => ({ ...pt, point_order: i + 1 })) }
      : r));
  }

  // NFC ataması fiziksel bir etikete dokunmayı gerektirdiği için mobilden
  // yapılıyor; QR token ise sadece bir metin üretip görsele çevirmek, bu
  // yüzden web'den de üretilebiliyor — nokta ilk açıldığında yoksa oluşturulur.
  async function ensureQrAndOpen(routeId: string, pt: RoutePoint) {
    if (pt.qr_token) { setQrModal(pt); return; }
    const token = crypto.randomUUID();
    const { data, error } = await supabase.from("patrol_route_points")
      .update({ qr_token: token }).eq("id", pt.id)
      .select("id, name, point_order, nfc_uid, qr_token").single();
    if (!error && data) {
      setRoutes(p => p.map(r => r.id === routeId ? { ...r, points: r.points.map(x => x.id === pt.id ? data : x) } : r));
      setQrModal(data);
    } else {
      flash(error?.message ?? "QR kod oluşturulamadı", false);
    }
  }

  function printQr(point: RoutePoint) {
    if (!qrDataUrl) return;
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`
      <html><head><title>${point.name}</title></head>
      <body style="text-align:center;font-family:sans-serif;padding:32px;">
        <h2 style="margin-bottom:4px;">${point.name}</h2>
        <img src="${qrDataUrl}" style="width:260px;height:260px;margin-top:16px;" />
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  function downloadQr(point: RoutePoint) {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${point.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  }

  function openSchedForm(routeId: string, sched: Schedule | null) {
    setEditingSched({ routeId, sched });
    if (sched) {
      setSchedDayType(sched.day_type);
      setSchedStart(sched.start_time.slice(0, 5));
      setSchedInterval(sched.interval_minutes);
      setSchedEnd(sched.end_time ? sched.end_time.slice(0, 5) : "");
      setSchedShiftCodes(sched.shift_code ? sched.shift_code.split(",") : []);
    } else {
      setSchedDayType("weekday");
      setSchedStart("08:00");
      setSchedInterval(60);
      setSchedEnd("");
      setSchedShiftCodes([]);
    }
  }

  async function saveSchedule() {
    if (!editingSched) return;
    const { routeId, sched } = editingSched;
    setSavingSched(true);
    const payload = { day_type: schedDayType, start_time: schedStart, interval_minutes: schedInterval, end_time: schedEnd || null, is_active: true, shift_code: schedShiftCodes.length > 0 ? schedShiftCodes.join(",") : null };

    if (sched) {
      const { data, error } = await supabase.from("patrol_schedules").update(payload).eq("id", sched.id)
        .select("id, day_type, start_time, interval_minutes, end_time, is_active, shift_code").single();
      if (!error && data) {
        setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: r.schedules.map(s => s.id === sched.id ? data : s) } : r));
        flash("Plan güncellendi", true);
      } else flash(error?.message ?? "Hata", false);
    } else {
      const { data, error } = await supabase.from("patrol_schedules").insert({ route_id: routeId, ...payload })
        .select("id, day_type, start_time, interval_minutes, end_time, is_active, shift_code").single();
      if (!error && data) {
        setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: [...r.schedules, data] } : r));
        flash("Plan kaydedildi", true);
      } else flash(error?.message ?? "Hata", false);
    }
    setEditingSched(null);
    setSavingSched(false);
  }

  async function deleteSchedule(routeId: string, schedId: string) {
    await supabase.from("patrol_schedules").delete().eq("id", schedId);
    setRoutes(p => p.map(r => r.id === routeId ? { ...r, schedules: r.schedules.filter(s => s.id !== schedId) } : r));
  }

  async function toggleRoute(routeId: string, current: boolean) {
    await supabase.from("patrol_routes").update({ is_active: !current }).eq("id", routeId);
    setRoutes(p => p.map(r => r.id === routeId ? { ...r, is_active: !current } : r));
  }

  async function confirmDeleteRoute() {
    if (!deleteRouteConfirm) return;
    setDeletingRoute(true);
    await supabase.from("patrol_routes").delete().eq("id", deleteRouteConfirm.id);
    setRoutes(p => p.filter(r => r.id !== deleteRouteConfirm.id));
    if (expandedId === deleteRouteConfirm.id) setExpandedId(null);
    setDeletingRoute(false);
    setDeleteRouteConfirm(null);
    flash("Rota silindi", true);
  }

  const filtered = locFilter === "all" ? routes : routes.filter(r => r.location_id === locFilter);
  const activeCount = routes.filter(r => r.is_active).length;

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1 flex-1 max-w-xs">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Bölgeye Göre Filtrele</label>
            <select
              value={locFilter}
              onChange={e => setLocFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Tüm Bölgeler</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowNewRoute(true)}
            className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Yeni Rota
          </button>
        </div>
      </section>

      <p className="text-sm text-on-surface-variant">{filtered.length} rota · {activeCount} aktif</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[32px]">route</span>
          </div>
          <p className="font-bold text-on-surface">Henüz rota oluşturulmadı</p>
          <p className="text-sm text-on-surface-variant">&quot;Yeni Rota&quot; butonuna basarak başlayın</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(route => {
            const isOpen = expandedId === route.id;
            const loc = locations.find(l => l.id === route.location_id);
            return (
              <div key={route.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isOpen ? null : route.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-container-low transition-colors"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${route.is_active ? "bg-secondary/10" : "bg-surface-container-high"}`}>
                    <span className={`material-symbols-outlined text-[22px] ${route.is_active ? "text-secondary" : "text-on-surface-variant"}`}>route</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-bold text-on-surface text-sm truncate">{route.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {loc?.name ?? "Bölge yok"} · {route.points.length} nokta · {route.schedules.length} plan
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${route.is_active ? "bg-secondary/10 text-secondary" : "bg-surface-container-high text-on-surface-variant"}`}>
                    {route.is_active ? "Aktif" : "Pasif"}
                  </span>
                  <span className={`material-symbols-outlined text-outline transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                </button>

                {isOpen && (
                  <div className="border-t border-outline-variant/20">
                    <div className="px-5 pt-4 pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Kontrol Noktaları</p>
                        <button
                          onClick={() => { setAddingPointTo(route.id); setNewPointName(""); }}
                          className="h-8 px-3 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Nokta Ekle
                        </button>
                      </div>

                      {route.points.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic text-center py-3">Henüz nokta eklenmedi</p>
                      ) : (
                        <div className="space-y-2">
                          {route.points.map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-3 py-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-[11px] font-bold text-primary">{pt.point_order}</span>
                              </div>
                              <span className="flex-1 text-sm font-semibold text-on-surface">{pt.name}</span>
                              <span
                                title={pt.nfc_uid ? undefined : "NFC etiketi mobil uygulamadan atanır"}
                                className={`px-2.5 h-7 rounded-full flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${
                                  pt.nfc_uid ? "bg-emerald-500/10 text-emerald-600" : "bg-on-surface-variant/10 text-on-surface-variant"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[13px]">nfc</span>
                                {pt.nfc_uid ? "Atandı" : "Atanmadı"}
                              </span>
                              <button
                                onClick={() => ensureQrAndOpen(route.id, pt)}
                                title={pt.qr_token ? "QR Kodu Görüntüle" : "QR Kod Oluştur"}
                                className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center transition-all flex-shrink-0"
                              >
                                <span className="material-symbols-outlined text-indigo-600 text-[16px]">qr_code_2</span>
                              </button>
                              <button
                                onClick={() => deletePoint(route.id, pt.id)}
                                className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center transition-all"
                              >
                                <span className="material-symbols-outlined text-error text-[16px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {addingPointTo === route.id && (
                        <div className="mt-3 flex gap-2">
                          <input
                            autoFocus
                            value={newPointName}
                            onChange={e => setNewPointName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addPoint(route.id)}
                            placeholder="Nokta adı (örn: Ana Giriş)"
                            className="flex-1 bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                          />
                          <button
                            onClick={() => addPoint(route.id)}
                            disabled={savingPoint || !newPointName.trim()}
                            className="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold disabled:opacity-50 transition-all flex-shrink-0"
                          >
                            {savingPoint ? "..." : "Ekle"}
                          </button>
                          <button
                            onClick={() => setAddingPointTo(null)}
                            className="px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface-variant text-sm font-bold flex-shrink-0"
                          >
                            İptal
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="px-5 pt-3 pb-4 border-t border-outline-variant/20">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Zaman Planları</p>
                        <button
                          onClick={() => openSchedForm(route.id, null)}
                          className="h-8 px-3 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Plan Ekle
                        </button>
                      </div>

                      {route.schedules.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic text-center py-3">Henüz plan eklenmedi</p>
                      ) : (
                        <div className="space-y-2">
                          {route.schedules.map(s => (
                            <div
                              key={s.id}
                              onClick={() => openSchedForm(route.id, s)}
                              className="w-full flex items-center gap-3 bg-primary/5 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-primary/10 transition-colors"
                            >
                              <div className="w-9 h-9 rounded-xl bg-surface-container-lowest flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-on-surface">{DAY_LABEL[s.day_type]}</p>
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  {s.start_time.slice(0, 5)} başlar · her{" "}
                                  {s.interval_minutes >= 60 ? `${s.interval_minutes / 60} saat` : `${s.interval_minutes} dk`}
                                  {s.end_time ? ` · ${s.end_time.slice(0, 5)}'e kadar` : ""}
                                  {s.shift_code ? ` · Vardiya ${s.shift_code.split(",").join(", ")}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10px] font-bold text-primary bg-surface-container-lowest px-2 py-1 rounded-full">Düzenle</span>
                                <button
                                  onClick={e => { e.stopPropagation(); deleteSchedule(route.id, s.id); }}
                                  className="w-7 h-7 rounded-full bg-surface-container-lowest flex items-center justify-center transition-all"
                                >
                                  <span className="material-symbols-outlined text-error text-[14px]">delete</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 px-5 pb-4">
                      <button
                        onClick={() => toggleRoute(route.id, route.is_active)}
                        className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all ${route.is_active ? "bg-surface-container-low text-on-surface-variant" : "bg-secondary/10 text-secondary"}`}
                      >
                        {route.is_active ? "Pasife Al" : "Aktife Al"}
                      </button>
                      <button
                        onClick={() => setDeleteRouteConfirm(route)}
                        className="flex-1 h-10 rounded-xl bg-error/10 text-error text-sm font-bold transition-all"
                      >
                        Rotayı Sil
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNewRoute && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNewRoute(false)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display text-headline-sm text-on-surface">Yeni Rota Oluştur</h2>
              <button onClick={() => setShowNewRoute(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Rota Adı</label>
              <input
                autoFocus
                value={newRouteName}
                onChange={e => setNewRouteName(e.target.value)}
                placeholder="Örn: Ataşehir A Bölgesi Devriyesi"
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Bölge</label>
              <select
                value={newRouteLocId}
                onChange={e => setNewRouteLocId(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="">— Bölge seçin —</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
            <button
              onClick={createRoute}
              disabled={savingRoute || !newRouteName.trim()}
              className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
            >
              {savingRoute ? "Oluşturuluyor..." : "Rotayı Oluştur"}
            </button>
          </div>
        </div>
      )}

      {editingSched && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingSched(null)} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <h2 className="font-display text-headline-sm text-on-surface">{editingSched.sched ? "Planı Düzenle" : "Yeni Plan Ekle"}</h2>
              <button onClick={() => setEditingSched(null)} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Hangi Günler</label>
                <div className="flex gap-2">
                  {DAY_TYPES.map(dt => (
                    <button
                      key={dt.id}
                      onClick={() => setSchedDayType(dt.id)}
                      className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${schedDayType === dt.id ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"}`}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Başlangıç</label>
                  <input
                    type="time"
                    value={schedStart}
                    onChange={e => setSchedStart(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Bitiş (isteğe bağlı)</label>
                  <input
                    type="time"
                    value={schedEnd}
                    onChange={e => setSchedEnd(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Devriye Aralığı</label>
                <div className="grid grid-cols-3 gap-2">
                  {INTERVALS.map(iv => (
                    <button
                      key={iv}
                      onClick={() => setSchedInterval(iv)}
                      className={`h-10 rounded-xl text-sm font-bold transition-all ${schedInterval === iv ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"}`}
                    >
                      {iv < 60 ? `${iv} dk` : `${iv / 60} saat`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Hedef Vardiya (isteğe bağlı, birden fazla seçilebilir)</label>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    onClick={() => setSchedShiftCodes([])}
                    className={`h-10 rounded-xl text-sm font-bold transition-all ${schedShiftCodes.length === 0 ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"}`}
                  >
                    Hepsi
                  </button>
                  {SHIFT_CODES.map(v => {
                    const selected = schedShiftCodes.includes(v);
                    return (
                      <button
                        key={v}
                        onClick={() => setSchedShiftCodes(p => selected ? p.filter(c => c !== v) : [...p, v])}
                        className={`h-10 rounded-xl text-sm font-bold transition-all ${selected ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"}`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">info</span>
                <p className="text-xs text-primary font-semibold leading-relaxed">
                  {DAY_LABEL[schedDayType]}, {schedStart} başlar · Her {schedInterval < 60 ? `${schedInterval} dk'da` : `${schedInterval / 60} saatte`} bir devriye
                  {schedEnd ? ` · ${schedEnd}'e kadar` : ""}
                  {schedShiftCodes.length > 0 ? ` · Vardiya ${schedShiftCodes.join(", ")}` : " · Tüm vardiyalar"}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0 flex gap-2">
              <button
                onClick={saveSchedule}
                disabled={savingSched}
                className="flex-1 bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
              >
                {savingSched ? "Kaydediliyor..." : editingSched.sched ? "Güncelle" : "Planı Kaydet"}
              </button>
              <button
                onClick={() => setEditingSched(null)}
                className="px-6 py-3 rounded-full bg-surface-container-low text-on-surface-variant font-bold text-sm transition-all"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRouteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteRouteConfirm(null)} />
          <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-error text-[24px]">delete</span>
              </div>
              <div>
                <p className="font-bold text-on-surface">Rotayı Sil</p>
                <p className="text-sm text-on-surface-variant">&quot;{deleteRouteConfirm.name}&quot; ve tüm kontrol noktaları/planları silinecek. Onaylıyor musunuz?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteRouteConfirm(null)} className="flex-1 py-2.5 rounded-full bg-surface-container-low text-on-surface-variant font-bold text-sm transition-all">
                İptal
              </button>
              <button onClick={confirmDeleteRoute} disabled={deletingRoute} className="flex-1 py-2.5 rounded-full bg-error text-on-error font-bold text-sm transition-all disabled:opacity-60">
                {deletingRoute ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setQrModal(null)} />
          <div className="relative w-full max-w-[340px] bg-surface-container-lowest rounded-3xl shadow-2xl p-6 space-y-4 text-center">
            <button onClick={() => setQrModal(null)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center active:scale-90 transition-all">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">close</span>
            </button>
            <h3 className="text-lg font-bold text-on-surface">{qrModal.name}</h3>
            <div className="flex items-center justify-center py-2">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR Kod" className="w-56 h-56 rounded-xl border border-outline-variant/20" />
                : <span className="material-symbols-outlined animate-spin text-primary text-[32px]">progress_activity</span>}
            </div>
            <p className="text-xs text-on-surface-variant">Bu QR kodu yazdırıp lokasyona yapıştırın. Personel devriyede bu kodu okutarak noktayı doğrular — NFC etiketi de aynı noktada ayrıca kullanılabilir.</p>
            <div className="flex gap-2">
              <button onClick={() => printQr(qrModal)} disabled={!qrDataUrl}
                className="flex-1 h-11 rounded-xl bg-primary text-on-primary text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[16px]">print</span>
                Yazdır
              </button>
              <button onClick={() => downloadQr(qrModal)} disabled={!qrDataUrl}
                className="flex-1 h-11 rounded-xl bg-surface-container-low text-on-surface-variant text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-[16px]">download</span>
                İndir
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full shadow-lg flex items-center gap-2 ${toast.ok ? "bg-on-surface text-surface" : "bg-error text-on-error"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          <span className="text-sm font-semibold">{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

function IdariDevriyeTakipView() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-display text-headline-lg text-on-background">Devriye Takibi</h1>
        <p className="text-on-surface-variant">Güvenlik departmanının devriye noktalarını salt okunur görüntüleyin. Devriye raporu için Raporlama sayfasına bakın.</p>
      </div>

      <IdariDevriyeNoktalariSection />
    </div>
  );
}

function IdariDevriyeNoktalariSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [locFilter, setLocFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }

    const [locRes, routeRes] = await Promise.all([
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("patrol_routes").select(`
        id, name, location_id, is_active,
        points:patrol_route_points(id, name, point_order, nfc_uid, qr_token),
        schedules:patrol_schedules(id, day_type, start_time, interval_minutes, end_time, is_active, shift_code)
      `).eq("department_id", dept.id).order("created_at", { ascending: false }),
    ]);
    setLocations((locRes.data || []) as Location[]);
    setRoutes(((routeRes.data || []) as PatrolRoute[]).map(r => ({
      ...r,
      points: [...(r.points || [])].sort((a: RoutePoint, b: RoutePoint) => a.point_order - b.point_order),
      schedules: r.schedules || [],
    })));
    setLoading(false);
  }

  const filtered = locFilter === "all" ? routes : routes.filter(r => r.location_id === locFilter);
  const activeCount = routes.filter(r => r.is_active).length;

  return (
    <div className="space-y-6">
      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="space-y-1 max-w-xs">
          <label className="text-xs font-semibold text-on-surface-variant ml-1">Bölgeye Göre Filtrele</label>
          <select
            value={locFilter}
            onChange={e => setLocFilter(e.target.value)}
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
          >
            <option value="all">Tüm Bölgeler</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </section>

      <p className="text-sm text-on-surface-variant">{filtered.length} rota · {activeCount} aktif</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[32px]">route</span>
          </div>
          <p className="font-bold text-on-surface">Henüz rota tanımlanmadı</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(route => {
            const isOpen = expandedId === route.id;
            const loc = locations.find(l => l.id === route.location_id);
            return (
              <div key={route.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <button
                  onClick={() => setExpandedId(isOpen ? null : route.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-container-low transition-colors"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${route.is_active ? "bg-secondary/10" : "bg-surface-container-high"}`}>
                    <span className={`material-symbols-outlined text-[22px] ${route.is_active ? "text-secondary" : "text-on-surface-variant"}`}>route</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-bold text-on-surface text-sm truncate">{route.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {loc?.name ?? "Bölge yok"} · {route.points.length} nokta · {route.schedules.length} plan
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${route.is_active ? "bg-secondary/10 text-secondary" : "bg-surface-container-high text-on-surface-variant"}`}>
                    {route.is_active ? "Aktif" : "Pasif"}
                  </span>
                  <span className={`material-symbols-outlined text-outline transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                </button>

                {isOpen && (
                  <div className="border-t border-outline-variant/20">
                    <div className="px-5 pt-4 pb-3">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Kontrol Noktaları</p>
                      {route.points.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic text-center py-3">Nokta tanımlanmadı</p>
                      ) : (
                        <div className="space-y-2">
                          {route.points.map(pt => (
                            <div key={pt.id} className="flex items-center gap-3 bg-surface-container-low rounded-xl px-3 py-2.5">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span className="text-[11px] font-bold text-primary">{pt.point_order}</span>
                              </div>
                              <span className="flex-1 text-sm font-semibold text-on-surface">{pt.name}</span>
                              <span className={`px-2.5 h-7 rounded-full flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${
                                pt.nfc_uid ? "bg-emerald-500/10 text-emerald-600" : "bg-on-surface-variant/10 text-on-surface-variant"
                              }`}>
                                <span className="material-symbols-outlined text-[13px]">nfc</span>
                                {pt.nfc_uid ? "Atandı" : "Atanmadı"}
                              </span>
                              <span className={`px-2.5 h-7 rounded-full flex items-center gap-1 text-[10px] font-bold flex-shrink-0 ${
                                pt.qr_token ? "bg-emerald-500/10 text-emerald-600" : "bg-on-surface-variant/10 text-on-surface-variant"
                              }`}>
                                <span className="material-symbols-outlined text-[13px]">qr_code_2</span>
                                {pt.qr_token ? "Atandı" : "Atanmadı"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="px-5 pt-3 pb-4 border-t border-outline-variant/20">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Zaman Planları</p>
                      {route.schedules.length === 0 ? (
                        <p className="text-xs text-on-surface-variant italic text-center py-3">Plan tanımlanmadı</p>
                      ) : (
                        <div className="space-y-2">
                          {route.schedules.map(s => (
                            <div key={s.id} className="flex items-center gap-3 bg-primary/5 rounded-xl px-3 py-2.5">
                              <div className="w-9 h-9 rounded-xl bg-surface-container-lowest flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-on-surface">{DAY_LABEL[s.day_type]}</p>
                                <p className="text-xs text-on-surface-variant mt-0.5">
                                  {s.start_time.slice(0, 5)} başlar · her{" "}
                                  {s.interval_minutes >= 60 ? `${s.interval_minutes / 60} saat` : `${s.interval_minutes} dk`}
                                  {s.end_time ? ` · ${s.end_time.slice(0, 5)}'e kadar` : ""}
                                  {s.shift_code ? ` · Vardiya ${s.shift_code.split(",").join(", ")}` : ""}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
