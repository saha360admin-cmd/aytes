"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Location { id: string; name: string }
interface CommRead { personnel_id: string; read_at: string; reader: { full_name: string } | null }
interface Comm {
  id: string; type: string; priority: string; title: string; content: string;
  target_type: string; location_id: string | null; expires_at: string | null; created_at: string;
  creator: { full_name: string } | null;
  location: { name: string } | null;
  reads: { personnel_id: string }[];
}

const TYPE_CFG = {
  duyuru:  { label: "Duyuru",  icon: "campaign",      bg: "bg-blue-100",    text: "text-blue-700",    border: "border-l-blue-500" },
  gorev:   { label: "Görev",   icon: "assignment",    bg: "bg-amber-100",   text: "text-amber-700",   border: "border-l-amber-500" },
  talimat: { label: "Talimat", icon: "rule",          bg: "bg-purple-100",  text: "text-purple-700",  border: "border-l-purple-500" },
};

export default function IletisimPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [comms, setComms] = useState<Comm[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailReads, setDetailReads] = useState<CommRead[]>([]);
  const [totalTarget, setTotalTarget] = useState(0);
  const [loadingReads, setLoadingReads] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [fType, setFType] = useState<"duyuru" | "gorev" | "talimat">("duyuru");
  const [fPriority, setFPriority] = useState<"normal" | "urgent">("normal");
  const [fTitle, setFTitle] = useState("");
  const [fContent, setFContent] = useState("");
  const [fTarget, setFTarget] = useState<"all" | "location">("all");
  const [fLocId, setFLocId] = useState("");
  const [fExpires, setFExpires] = useState("");
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadData();
  }, [personnel]);

  async function loadData() {
    const [commRes, locRes] = await Promise.all([
      supabase.from("communications")
        .select("id, type, priority, title, content, target_type, location_id, expires_at, created_at, creator:personnel!created_by(full_name), location:locations(name), reads:communication_reads(personnel_id)")
        .eq("department_id", personnel!.department_id)
        .order("created_at", { ascending: false }),
      supabase.from("locations").select("id, name").order("name"),
    ]);
    setComms((commRes.data || []) as any);
    setLocations(locRes.data || []);
    setLoading(false);
  }

  async function openDetail(comm: Comm) {
    setDetailId(comm.id);
    setLoadingReads(true);

    // Hedef personel sayısını hesapla
    let q = supabase.from("personnel").select("id", { count: "exact", head: true })
      .eq("department_id", personnel!.department_id)
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
    setDetailReads((data || []) as any);
    setLoadingReads(false);
  }

  async function send() {
    if (!fTitle.trim() || !fContent.trim() || !personnel) return;
    setSaving(true);
    const { error } = await supabase.from("communications").insert({
      type: fType,
      priority: fPriority,
      title: fTitle.trim(),
      content: fContent.trim(),
      target_type: fTarget,
      location_id: fTarget === "location" ? fLocId || null : null,
      department_id: personnel.department_id,
      created_by: personnel.id,
      expires_at: fExpires || null,
    });
    if (!error) {
      flash("Mesaj gönderildi", true);
      setShowForm(false);
      resetForm();
      loadData();
    } else flash(error.message, false);
    setSaving(false);
  }

  async function deleteComm(id: string) {
    await supabase.from("communications").delete().eq("id", id);
    setComms(p => p.filter(c => c.id !== id));
    if (detailId === id) setDetailId(null);
    flash("Silindi", true);
  }

  function resetForm() {
    setFType("duyuru"); setFPriority("normal"); setFTitle(""); setFContent("");
    setFTarget("all"); setFLocId(""); setFExpires("");
  }

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  }

  const detailComm = comms.find(c => c.id === detailId);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
      <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
    </div>
  );

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-32">

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">İletişim</h1>
          <p className="text-white/60 text-xs">{comms.length} mesaj</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full text-white text-sm font-bold active:scale-95 transition-all">
          <span className="material-symbols-outlined text-[18px]">add</span>
          Yeni
        </button>
      </header>

      {/* Liste */}
      <main className="px-4 pt-4 space-y-3">
        {comms.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-gray-300 text-[48px]">forum</span>
            <p className="text-gray-500 font-semibold">Henüz mesaj gönderilmedi</p>
          </div>
        ) : comms.map(c => {
          const cfg = TYPE_CFG[c.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.duyuru;
          const readCount = c.reads?.length ?? 0;
          return (
            <div key={c.id} role="button" onClick={() => openDetail(c)}
              className={`bg-white rounded-2xl shadow-sm border-l-4 ${cfg.border} overflow-hidden active:scale-[0.99] transition-all cursor-pointer`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
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
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {new Date(c.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <p className="font-bold text-gray-800 mt-2 text-sm">{c.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.content}</p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <span className="text-[11px] text-gray-400">
                    {c.target_type === "all" ? "Tüm personel" : (c.location as any)?.name ?? "Bölge"}
                  </span>
                  <span className={`text-[11px] font-bold flex items-center gap-1 ${readCount > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    <span className="material-symbols-outlined text-[13px]">done_all</span>
                    {readCount} okudu
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </main>

      {/* ── Detay Bottom Sheet ── */}
      {detailComm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDetailId(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-5 pb-4 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              {(() => {
                const cfg = TYPE_CFG[detailComm.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.duyuru;
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
                      <button onClick={() => deleteComm(detailComm.id)}
                        className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center active:scale-90 transition-all">
                        <span className="material-symbols-outlined text-red-400 text-[18px]">delete</span>
                      </button>
                    </div>
                    <h2 className="text-lg font-bold text-gray-800">{detailComm.title}</h2>
                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{detailComm.content}</p>
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
                      <span>{(detailComm.creator as any)?.full_name ?? "—"}</span>
                      <span>{new Date(detailComm.created_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{detailComm.target_type === "all" ? "Tüm personel" : (detailComm.location as any)?.name}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Okuma durumu */}
            <div className="flex-1 overflow-y-auto px-6 pb-8">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Okuma Durumu</p>
                <span className="text-sm font-bold text-gray-700">{detailReads.length} / {totalTarget}</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 h-2 rounded-full mb-4 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${totalTarget > 0 ? (detailReads.length / totalTarget) * 100 : 0}%` }} />
              </div>

              {loadingReads ? (
                <div className="flex justify-center py-6">
                  <span className="material-symbols-outlined animate-spin text-[#3949AB]">progress_activity</span>
                </div>
              ) : detailReads.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Henüz kimse okumadı</p>
              ) : (
                <div className="space-y-2">
                  {detailReads.map(r => (
                    <div key={r.personnel_id} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-emerald-600 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{(r.reader as any)?.full_name ?? "—"}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">
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

      {/* ── Yeni Mesaj Bottom Sheet ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowForm(false); resetForm(); }} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col">
            <div className="px-6 pt-5 pb-4 overflow-y-auto flex-1 space-y-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">Yeni Mesaj</h3>
                <button onClick={() => { setShowForm(false); resetForm(); }}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">close</span>
                </button>
              </div>

              {/* Tip */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Mesaj Tipi</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["duyuru", "gorev", "talimat"] as const).map(t => {
                    const c = TYPE_CFG[t];
                    return (
                      <button key={t} onClick={() => setFType(t)}
                        className={`h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all active:scale-95 ${fType === t ? `${c.bg} ${c.text}` : "bg-gray-100 text-gray-500"}`}>
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{c.icon}</span>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Öncelik */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Öncelik</label>
                <div className="flex gap-2">
                  {(["normal", "urgent"] as const).map(p => (
                    <button key={p} onClick={() => setFPriority(p)}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${fPriority === p ? (p === "urgent" ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-700") : "bg-gray-100 text-gray-400"}`}>
                      {p === "urgent" ? "🔴 Acil" : "Normal"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hedef */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Hedef</label>
                <div className="flex gap-2">
                  {(["all", "location"] as const).map(t => (
                    <button key={t} onClick={() => setFTarget(t)}
                      className={`flex-1 h-11 rounded-xl text-xs font-bold transition-all active:scale-95 ${fTarget === t ? "text-white" : "bg-gray-100 text-gray-500"}`}
                      style={fTarget === t ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}>
                      {t === "all" ? "Tüm Personel" : "Bölge Seç"}
                    </button>
                  ))}
                </div>
                {fTarget === "location" && (
                  <select value={fLocId} onChange={e => setFLocId(e.target.value)}
                    className="w-full mt-2 h-11 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none appearance-none">
                    <option value="">— Bölge seçin —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
              </div>

              {/* Başlık */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Başlık</label>
                <input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Mesaj başlığı"
                  className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
              </div>

              {/* İçerik */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">İçerik</label>
                <textarea value={fContent} onChange={e => setFContent(e.target.value)} placeholder="Mesaj içeriği..." rows={4}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none resize-none" />
              </div>

              {/* Son Tarih */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Son Geçerlilik (isteğe bağlı)</label>
                <input type="datetime-local" value={fExpires} onChange={e => setFExpires(e.target.value)}
                  className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-[#3949AB] outline-none" />
              </div>

              <div className="flex gap-2 pb-6">
                <button onClick={send} disabled={saving || !fTitle.trim() || !fContent.trim()}
                  className="flex-1 py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                  {saving
                    ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
                  {saving ? "Gönderiliyor..." : "Gönder"}
                </button>
                <button onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-5 py-4 rounded-2xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-all">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
