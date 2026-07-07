"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// İş mantığı mobildeki (mobile)/yonetici/talepler/page.tsx ile birebir
// aynı — requests tablosunu ve onay/red akışını mobil ve masaüstü aynı
// kurallarla uygulamalı.

interface RequestRow {
  id: string;
  type: string;
  details: string;
  status: "pending" | "approved" | "rejected";
  rejection_note: string | null;
  created_at: string;
  requester: { full_name: string } | null;
}

const typeLabels: Record<string, string> = {
  unpaid: "Ücretsiz İzin",
  annual: "Yıllık İzin",
  medical: "Doktor Raporu",
  resign: "İstifa",
  giris_destek: "Giriş Desteği",
  other: "Diğer",
};

const typeIcons: Record<string, string> = {
  unpaid: "event_busy",
  annual: "beach_access",
  medical: "medical_information",
  resign: "exit_to_app",
  giris_destek: "lock_reset",
  other: "help_outline",
};

const TABS = [
  { key: "pending", label: "Bekleyen", dot: "bg-orange-500", text: "text-orange-600" },
  { key: "approved", label: "Onaylanan", dot: "bg-emerald-500", text: "text-emerald-600" },
  { key: "rejected", label: "Reddedilen", dot: "bg-red-500", text: "text-red-600" },
] as const;
type TabKey = typeof TABS[number]["key"];

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "az önce";
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

const PAGE_SIZE = 20;

export default function WebGuvenlikTaleplerPage() {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("pending");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rejectSheet, setRejectSheet] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    supabase.from("departments").select("id").eq("slug", "guvenlik").single().then(({ data }) => {
      if (data) setDeptId(data.id);
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!deptId) return;
    setRequests([]);
    setPage(0);
    setHasMore(false);
    load(0, deptId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptId, tab]);

  async function load(pageIndex: number, currentDeptId: string) {
    pageIndex === 0 ? setLoading(true) : setLoadingMore(true);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("requests")
      .select("*, requester:personnel_id(full_name)")
      .eq("department_id", currentDeptId)
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .range(from, to);
    const rows = (data || []) as unknown as RequestRow[];
    setRequests(prev => pageIndex === 0 ? rows : [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setPage(pageIndex);
    pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
  }

  async function approveRequest(id: string) {
    setUpdatingId(id);
    const { error } = await supabase.from("requests").update({ status: "approved" }).eq("id", id);
    if (!error) {
      setRequests(prev => prev.filter(r => r.id !== id));
      showToast("Talep onaylandı", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setUpdatingId(null);
  }

  function openRejectSheet(id: string) {
    setRejectNote("");
    setRejectSheet(id);
  }

  async function rejectRequest(id: string, note: string) {
    setUpdatingId(id);
    const { error } = await supabase.from("requests").update({ status: "rejected", rejection_note: note }).eq("id", id);
    if (!error) {
      setRequests(prev => prev.filter(r => r.id !== id));
      showToast("Talep reddedildi", true);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setUpdatingId(null);
    setRejectSheet(null);
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="font-display text-headline-lg text-on-background">Talepler</h1>
        <p className="text-on-surface-variant">Güvenlik departmanı personel taleplerini inceleyin, onaylayın veya reddedin.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
              tab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${tab === t.key ? "bg-on-primary" : t.dot}`} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <span className="material-symbols-outlined text-outline-variant text-[48px]">inbox</span>
          <p className="text-sm font-semibold text-on-surface-variant">
            {tab === "pending" ? "Bekleyen talep yok" : tab === "approved" ? "Onaylanan talep yok" : "Reddedilen talep yok"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {requests.map(req => (
            <div key={req.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
              <div className={`h-1 w-full ${tab === "pending" ? "bg-orange-400" : tab === "approved" ? "bg-emerald-400" : "bg-red-400"}`} />
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[20px]">{typeIcons[req.type] || "help_outline"}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-on-surface text-sm truncate">{req.requester?.full_name || "Bilinmiyor"}</p>
                      <p className="text-xs font-semibold text-primary mt-0.5">{typeLabels[req.type] || req.type}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-semibold flex-shrink-0 pt-0.5">{timeAgo(req.created_at)}</p>
                </div>

                {req.details && (
                  <p className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl px-3 py-2.5 leading-relaxed">
                    {req.details}
                  </p>
                )}

                {tab === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveRequest(req.id)}
                      disabled={updatingId === req.id}
                      className="flex-1 h-10 bg-emerald-500 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {updatingId === req.id
                        ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[16px]">check</span>}
                      Onayla
                    </button>
                    <button
                      onClick={() => openRejectSheet(req.id)}
                      disabled={updatingId === req.id}
                      className="flex-1 h-10 bg-error/10 text-error text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all border border-error/20 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Reddet
                    </button>
                  </div>
                )}

                {tab !== "pending" && (
                  <div className="space-y-2">
                    {tab === "rejected" && req.rejection_note && (
                      <div className="flex items-start gap-2 bg-error/5 border border-error/20 rounded-xl px-3 py-2.5">
                        <span className="material-symbols-outlined text-error text-[16px] flex-shrink-0 mt-0.5">info</span>
                        <p className="text-xs text-error leading-relaxed">{req.rejection_note}</p>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${tab === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {tab === "approved" ? "✓ Onaylandı" : "✕ Reddedildi"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && hasMore && (
        <button
          onClick={() => deptId && load(page + 1, deptId)}
          disabled={loadingMore}
          className="w-full py-3.5 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 text-sm font-bold text-primary flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          {loadingMore
            ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            : <span className="material-symbols-outlined text-[18px]">expand_more</span>}
          {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
        </button>
      )}

      {!loading && !hasMore && requests.length > 0 && (
        <p className="text-center text-xs text-on-surface-variant font-semibold py-2">
          Tüm kayıtlar gösterildi · {requests.length} talep
        </p>
      )}

      {rejectSheet && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectSheet(null)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="font-display text-headline-sm text-on-surface">Talebi Reddet</h2>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Ret Nedeni *</label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                placeholder="Personele gösterilecek not..."
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-error outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRejectSheet(null)} className="flex-1 py-2.5 rounded-full bg-surface-container-low text-on-surface-variant font-bold text-sm transition-all">
                Vazgeç
              </button>
              <button
                disabled={!rejectNote.trim()}
                onClick={() => rejectRequest(rejectSheet, rejectNote.trim())}
                className="flex-1 py-2.5 rounded-full bg-error text-on-error font-bold text-sm transition-all disabled:opacity-50"
              >
                Reddet
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
