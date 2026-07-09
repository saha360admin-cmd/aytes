"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Comm {
  id: string; type: string; priority: string; title: string; content: string;
  target_type: string; location_id: string | null; expires_at: string | null; created_at: string;
  creator: { full_name: string } | null;
  isRead: boolean;
  read_at: string | null;
}

const TYPE_CFG = {
  duyuru:  { label: "Duyuru",  icon: "campaign",   bg: "bg-blue-100",   text: "text-blue-700",   border: "border-l-blue-500" },
  gorev:   { label: "Görev",   icon: "assignment", bg: "bg-amber-100",  text: "text-amber-700",  border: "border-l-amber-500" },
  talimat: { label: "Talimat", icon: "rule",       bg: "bg-purple-100", text: "text-purple-700", border: "border-l-purple-500" },
};

export default function IletisimPersonelPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [comms, setComms] = useState<Comm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Comm | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadComms = useCallback(async () => {
    if (!personnel) return;
    const now = new Date().toISOString();

    // Personele ait iletişimler: tüm personel veya kendi lokasyonu
    const locFilter = personnel.location_id
      ? `target_type.eq.all,and(target_type.eq.location,location_id.eq.${personnel.location_id})`
      : "target_type.eq.all";

    const [commRes, readRes] = await Promise.all([
      supabase.from("communications")
        .select("id, type, priority, title, content, target_type, location_id, expires_at, created_at, creator:personnel!created_by(full_name)")
        .eq("department_id", personnel.department_id)
        .or(locFilter)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("created_at", { ascending: false }),
      supabase.from("communication_reads")
        .select("communication_id, read_at")
        .eq("personnel_id", personnel.id),
    ]);

    const reads = new Map((readRes.data || []).map(r => [r.communication_id, r.read_at]));
    type CommRow = Omit<Comm, "isRead" | "read_at">;
    const list: Comm[] = (commRes.data as unknown as CommRow[] || []).map((c) => ({
      ...c,
      isRead: reads.has(c.id),
      read_at: reads.get(c.id) ?? null,
    }));

    // Okunmamışlar önce, urgent önce
    list.sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setComms(list);
    setLoading(false);
  }, [personnel]);

  useEffect(() => {
    if (!personnel) return;
    loadComms();
  }, [personnel, loadComms]);

  async function markRead(comm: Comm) {
    if (!personnel || comm.isRead) {
      setSelected(comm);
      return;
    }
    setSelected(comm);
  }

  async function confirmRead() {
    if (!personnel || !selected || selected.isRead) return;
    setConfirming(true);
    const { error } = await supabase.from("communication_reads").insert({
      communication_id: selected.id,
      personnel_id: personnel.id,
    });
    if (!error) {
      setComms(p => p.map(c => c.id === selected.id ? { ...c, isRead: true, read_at: new Date().toISOString() } : c));
      setSelected(prev => prev ? { ...prev, isRead: true, read_at: new Date().toISOString() } : null);
    }
    setConfirming(false);
  }

  const unreadCount = comms.filter(c => !c.isRead).length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
      <span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span>
    </div>
  );

  return (
    <div className="bg-[#f8f9ff] min-h-screen pb-24">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white shadow-sm flex items-center gap-3 px-4 h-16">
        <button onClick={() => router.push("/dashboard")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-blue-800">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-blue-800 text-lg leading-tight">İletişim</h1>
          {unreadCount > 0 && <p className="text-xs text-red-500 font-semibold">{unreadCount} okunmamış mesaj</p>}
        </div>
      </header>

      <main className="px-4 pt-4 space-y-3">
        {comms.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3 shadow-sm mt-4">
            <span className="material-symbols-outlined text-gray-300 text-[48px]">forum</span>
            <p className="text-gray-500 font-semibold">Mesaj bulunmuyor</p>
          </div>
        ) : comms.map(c => {
          const cfg = TYPE_CFG[c.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.duyuru;
          return (
            <button key={c.id} onClick={() => markRead(c)}
              className={`w-full bg-white rounded-2xl shadow-sm border-l-4 ${cfg.border} p-4 text-left active:scale-[0.99] transition-all ${!c.isRead ? "ring-1 ring-inset ring-blue-100" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${cfg.bg} ${cfg.text}`}>
                    <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                    {cfg.label}
                  </span>
                  {c.priority === "urgent" && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600">🔴 Acil</span>
                  )}
                  {!c.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-0.5" />
                  )}
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {new Date(c.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                </span>
              </div>
              <p className={`text-sm mt-2 ${!c.isRead ? "font-bold text-gray-800" : "font-semibold text-gray-600"}`}>{c.title}</p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">{c.content}</p>
              {c.isRead && c.read_at && (
                <p className="text-[10px] text-emerald-500 mt-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">done_all</span>
                  {new Date(c.read_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} okundu
                </p>
              )}
            </button>
          );
        })}
      </main>

      {/* ── Mesaj Detay Bottom Sheet ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-5 pb-6 overflow-y-auto flex-1 space-y-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />

              {(() => {
                const cfg = TYPE_CFG[selected.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.duyuru;
                return (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${cfg.bg} ${cfg.text}`}>
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                        {cfg.label}
                      </span>
                      {selected.priority === "urgent" && (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600">🔴 Acil</span>
                      )}
                    </div>

                    <div>
                      <h2 className="text-xl font-bold text-gray-800">{selected.title}</h2>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {selected.creator?.full_name ?? "—"} · {new Date(selected.created_at).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
                    </div>

                    {selected.expires_at && (
                      <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                        <span className="material-symbols-outlined text-amber-500 text-[16px]">schedule</span>
                        <p className="text-xs text-amber-700 font-semibold">
                          Son geçerlilik: {new Date(selected.expires_at).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    )}

                    {selected.isRead ? (
                      <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-4 py-3">
                        <span className="material-symbols-outlined text-emerald-500 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                        <p className="text-sm text-emerald-700 font-semibold">
                          {selected.read_at ? new Date(selected.read_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} okundu olarak işaretlendi
                        </p>
                      </div>
                    ) : (
                      <button onClick={confirmRead} disabled={confirming}
                        className="w-full py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-all"
                        style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
                        {confirming
                          ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                          : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>done_all</span>}
                        {confirming ? "Kaydediliyor..." : "Okudum"}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
