"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

// İş mantığı mobildeki (mobile)/yonetici/iletisim/page.tsx ile birebir
// aynı — communications/communication_reads tablolarını paylaşıyor.
// Masaüstü sadece güvenlik departmanına özel olduğu için mobildeki
// İdari İşler'e özgü çoklu-departman yayın seçeneği burada yok; hedef
// departman her zaman güvenlik.

interface Location { id: string; name: string; }
interface CommRead { personnel_id: string; read_at: string; reader: { full_name: string } | null; }
interface Comm {
  id: string;
  type: string;
  priority: string;
  title: string;
  content: string;
  target_type: string;
  location_id: string | null;
  expires_at: string | null;
  created_at: string;
  department_id: string;
  creator: { full_name: string } | null;
  location: { name: string } | null;
  reads: { personnel_id: string }[];
}

const TYPE_CFG: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  duyuru: { label: "Duyuru", icon: "campaign", bg: "bg-blue-100", text: "text-blue-700", border: "border-l-blue-500" },
  gorev: { label: "Görev", icon: "assignment", bg: "bg-amber-100", text: "text-amber-700", border: "border-l-amber-500" },
  talimat: { label: "Talimat", icon: "rule", bg: "bg-purple-100", text: "text-purple-700", border: "border-l-purple-500" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatDateLong(dateStr: string) {
  return new Date(dateStr).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const emptyForm = {
  type: "duyuru" as "duyuru" | "gorev" | "talimat",
  priority: "normal" as "normal" | "urgent",
  title: "",
  content: "",
  target: "all" as "all" | "location",
  locationId: "",
  expires: "",
};

export default function WebIletisimPage() {
  const { personnel } = useAuth();
  const [deptId, setDeptId] = useState<string | null>(null);
  const [comms, setComms] = useState<Comm[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailReads, setDetailReads] = useState<CommRead[]>([]);
  const [totalTarget, setTotalTarget] = useState(0);
  const [loadingReads, setLoadingReads] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    load();
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
    if (!dept) { setLoading(false); return; }
    setDeptId(dept.id);

    const [commRes, locRes] = await Promise.all([
      supabase.from("communications")
        .select("id, type, priority, title, content, target_type, location_id, expires_at, created_at, department_id, creator:personnel!created_by(full_name), location:locations(name), reads:communication_reads(personnel_id)")
        .eq("department_id", dept.id)
        .order("created_at", { ascending: false }),
      supabase.from("locations").select("id, name").order("name"),
    ]);
    setComms((commRes.data || []) as unknown as Comm[]);
    setLocations((locRes.data || []) as Location[]);
    setLoading(false);
  }

  async function openDetail(comm: Comm) {
    setDetailId(comm.id);
    setLoadingReads(true);

    let q = supabase.from("personnel").select("id", { count: "exact", head: true })
      .eq("department_id", comm.department_id)
      .eq("status", "active")
      .neq("role", "admin");
    if (comm.target_type === "location" && comm.location_id) {
      q = q.eq("location_id", comm.location_id);
    }
    const { count } = await q;
    setTotalTarget(count ?? 0);

    const { data } = await supabase.from("communication_reads")
      .select("personnel_id, read_at, reader:personnel!personnel_id(full_name)")
      .eq("communication_id", comm.id)
      .order("read_at");
    setDetailReads((data || []) as unknown as CommRead[]);
    setLoadingReads(false);
  }

  function closeDetail() {
    setDetailId(null);
    setDetailReads([]);
  }

  function openCreate() {
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  async function handleSend() {
    if (!deptId || !personnel || !form.title.trim() || !form.content.trim()) {
      showToast("Zorunlu alanları doldurun.", false);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("communications").insert({
      type: form.type,
      priority: form.priority,
      title: form.title.trim(),
      content: form.content.trim(),
      target_type: form.target,
      location_id: form.target === "location" ? form.locationId || null : null,
      department_id: deptId,
      created_by: personnel.id,
      expires_at: form.expires ? new Date(form.expires).toISOString() : null,
    });
    setSaving(false);
    if (error) {
      showToast("Gönderilemedi: " + error.message, false);
    } else {
      setShowForm(false);
      showToast("Mesaj gönderildi", true);
      load();
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("communications").delete().eq("id", id);
    if (error) {
      showToast("Silinemedi: " + error.message, false);
      return;
    }
    setComms(prev => prev.filter(c => c.id !== id));
    if (detailId === id) closeDetail();
    showToast("Silindi", true);
  }

  const detailComm = comms.find(c => c.id === detailId);

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">İletişim</h1>
          <p className="text-on-surface-variant">Duyuru, görev ve talimatları personele yayınlayın, okuma durumunu takip edin.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          Yeni Mesaj
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : comms.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <span className="material-symbols-outlined text-outline-variant text-[48px]">forum</span>
          <p className="text-sm font-semibold text-on-surface-variant">Henüz mesaj gönderilmedi</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {comms.map(c => {
            const cfg = TYPE_CFG[c.type] ?? TYPE_CFG.duyuru;
            const readCount = c.reads?.length ?? 0;
            return (
              <div
                key={c.id}
                onClick={() => openDetail(c)}
                className={`bg-surface-container-lowest rounded-xl shadow-sm border-l-4 ${cfg.border} border border-outline-variant/10 overflow-hidden cursor-pointer hover:shadow-md transition-all`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                      <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${cfg.bg} ${cfg.text}`}>
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                        {cfg.label}
                      </span>
                      {c.priority === "urgent" && (
                        <span className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>priority_high</span>
                          Acil
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-on-surface-variant flex-shrink-0">{formatDate(c.created_at)}</span>
                  </div>
                  <p className="font-bold text-on-surface mt-2 text-sm">{c.title}</p>
                  <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{c.content}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/20">
                    <span className="text-[11px] text-on-surface-variant">
                      {c.target_type === "all" ? "Tüm personel" : c.location?.name ?? "Bölge"}
                    </span>
                    <span className={`text-[11px] font-bold flex items-center gap-1 ${readCount > 0 ? "text-emerald-600" : "text-on-surface-variant"}`}>
                      <span className="material-symbols-outlined text-[13px]">done_all</span>
                      {readCount} okudu
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Yeni Mesaj Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <h2 className="font-display text-headline-sm text-on-surface">Yeni Mesaj</h2>
              <button onClick={() => setShowForm(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Mesaj Tipi</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["duyuru", "gorev", "talimat"] as const).map(t => {
                    const c = TYPE_CFG[t];
                    return (
                      <button
                        key={t}
                        onClick={() => setForm(f => ({ ...f, type: t }))}
                        className={`h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${form.type === t ? `${c.bg} ${c.text}` : "bg-surface-container-low text-on-surface-variant"}`}
                      >
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{c.icon}</span>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Öncelik</label>
                <div className="flex gap-2">
                  {(["normal", "urgent"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setForm(f => ({ ...f, priority: p }))}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        form.priority === p ? (p === "urgent" ? "bg-red-100 text-red-600" : "bg-surface-container-high text-on-surface") : "bg-surface-container-low text-on-surface-variant"
                      }`}
                    >
                      {p === "urgent" ? "🔴 Acil" : "Normal"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Hedef</label>
                <div className="flex gap-2">
                  {(["all", "location"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, target: t }))}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        form.target === t ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant"
                      }`}
                    >
                      {t === "all" ? "Tüm Personel" : "Bölge Seç"}
                    </button>
                  ))}
                </div>
                {form.target === "location" && (
                  <select
                    value={form.locationId}
                    onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}
                    className="w-full mt-2 bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">— Bölge seçin —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Başlık *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Mesaj başlığı"
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">İçerik *</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Mesaj içeriği…"
                  rows={4}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Son Geçerlilik (isteğe bağlı)</label>
                <input
                  type="datetime-local"
                  value={form.expires}
                  onChange={e => setForm(f => ({ ...f, expires: e.target.value }))}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
              <button
                onClick={handleSend}
                disabled={saving || !form.title.trim() || !form.content.trim()}
                className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
              >
                {saving ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detay Modal */}
      {detailComm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDetail} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              {(() => {
                const cfg = TYPE_CFG[detailComm.type] ?? TYPE_CFG.duyuru;
                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${cfg.bg} ${cfg.text}`}>
                          <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                          {cfg.label}
                        </span>
                        {detailComm.priority === "urgent" && (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600">Acil</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(detailComm.id)}
                          title="Sil"
                          className="w-9 h-9 rounded-full bg-error/10 flex items-center justify-center hover:bg-error/20 transition-colors"
                        >
                          <span className="material-symbols-outlined text-error text-[18px]">delete</span>
                        </button>
                        <button onClick={closeDetail} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                    </div>
                    <h2 className="font-display text-headline-sm text-on-surface">{detailComm.title}</h2>
                    <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{detailComm.content}</p>
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-on-surface-variant flex-wrap">
                      <span>{detailComm.creator?.full_name ?? "—"}</span>
                      <span>{formatDateLong(detailComm.created_at)}</span>
                      <span>{detailComm.target_type === "all" ? "Tüm personel" : detailComm.location?.name ?? "Bölge"}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wide">Okuma Durumu</p>
                <span className="text-sm font-bold text-on-surface">{detailReads.length} / {totalTarget}</span>
              </div>
              <div className="w-full bg-surface-container-low h-2 rounded-full mb-4 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${totalTarget > 0 ? (detailReads.length / totalTarget) * 100 : 0}%` }}
                />
              </div>

              {loadingReads ? (
                <div className="flex justify-center py-6">
                  <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                </div>
              ) : detailReads.length === 0 ? (
                <p className="text-xs text-on-surface-variant text-center py-4">Henüz kimse okumadı</p>
              ) : (
                <div className="space-y-2">
                  {detailReads.map(r => (
                    <div key={r.personnel_id} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-emerald-600 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                        </div>
                        <span className="text-sm font-semibold text-emerald-800">{r.reader?.full_name ?? "—"}</span>
                      </div>
                      <span className="text-[10px] text-emerald-600/70">
                        {new Date(r.read_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
