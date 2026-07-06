"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface Request {
  id: string;
  type: string;
  details: string;
  status: "pending" | "approved" | "rejected";
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
  { key: "pending",  label: "Bekleyen",  color: "text-orange-600",  bg: "bg-orange-500" },
  { key: "approved", label: "Onaylanan", color: "text-emerald-600", bg: "bg-emerald-500" },
  { key: "rejected", label: "Reddedilen",color: "text-red-600",     bg: "bg-red-500" },
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

export default function TaleplerPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [tab, setTab] = useState<TabKey>("pending");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    setRequests([]);
    setPage(0);
    setHasMore(false);
    load(0);
  }, [personnel, tab]);

  async function load(pageIndex: number) {
    if (!personnel) return;
    pageIndex === 0 ? setLoading(true) : setLoadingMore(true);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("requests")
      .select("*, requester:personnel_id(full_name)")
      .eq("department_id", personnel.department_id)
      .eq("status", tab)
      .order("created_at", { ascending: false })
      .range(from, to);
    const rows = (data || []) as Request[];
    setRequests(prev => pageIndex === 0 ? rows : [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setPage(pageIndex);
    pageIndex === 0 ? setLoading(false) : setLoadingMore(false);
  }

  function loadMore() { load(page + 1); }

  async function handleAction(id: string, status: "approved" | "rejected") {
    setUpdatingId(id);
    const { error } = await supabase.from("requests").update({ status }).eq("id", id);
    if (!error) {
      setRequests(prev => prev.filter(r => r.id !== id));
      showToast(status === "approved" ? "Talep onaylandı" : "Talep reddedildi", !error);
    } else {
      showToast("İşlem başarısız: " + error.message, false);
    }
    setUpdatingId(null);
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const counts: Record<TabKey, number> = { pending: 0, approved: 0, rejected: 0 };
  requests.forEach(r => { if (r.status in counts) counts[r.status as TabKey]++; });

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-8">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-white/15 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-white text-[22px]">arrow_back</span>
        </button>
        <div>
          <h1 className="font-bold text-white text-lg leading-tight">Talepler</h1>
          <p className="text-white/60 text-xs">Tüm personel talepleri</p>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex bg-white shadow-sm border-b border-gray-100 sticky top-16 z-30">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 text-xs font-bold transition-all relative ${tab === t.key ? t.color : "text-gray-400"}`}>
            {t.label}
            {tab === t.key && <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${t.bg}`} />}
          </button>
        ))}
      </div>

      <main className="px-4 pt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[36px]">progress_activity</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 flex flex-col items-center gap-3 shadow-sm mt-4">
            <span className="material-symbols-outlined text-gray-200 text-[52px]">inbox</span>
            <p className="text-sm font-semibold text-gray-400">
              {tab === "pending" ? "Bekleyen talep yok" : tab === "approved" ? "Onaylanan talep yok" : "Reddedilen talep yok"}
            </p>
          </div>
        ) : (
          requests.map(req => (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Üst şerit */}
              <div className={`h-1 w-full ${tab === "pending" ? "bg-orange-400" : tab === "approved" ? "bg-emerald-400" : "bg-red-400"}`} />
              <div className="p-4">
                {/* Başlık satırı */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#3949AB] text-[20px]">{typeIcons[req.type] || "help_outline"}</span>
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{req.requester?.full_name || "Bilinmiyor"}</p>
                      <p className="text-xs font-semibold text-[#3949AB] mt-0.5">{typeLabels[req.type] || req.type}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 font-semibold flex-shrink-0 pt-0.5">{timeAgo(req.created_at)}</p>
                </div>

                {/* Açıklama */}
                {req.details && (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
                    {req.details}
                  </p>
                )}

                {/* Onay/red butonları (sadece pending) */}
                {tab === "pending" && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleAction(req.id, "approved")}
                      disabled={updatingId === req.id}
                      className="flex-1 h-10 bg-emerald-500 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
                      {updatingId === req.id
                        ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                        : <span className="material-symbols-outlined text-[16px]">check</span>}
                      Onayla
                    </button>
                    <button
                      onClick={() => handleAction(req.id, "rejected")}
                      disabled={updatingId === req.id}
                      className="flex-1 h-10 bg-red-50 text-red-600 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all border border-red-200 disabled:opacity-50">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Reddet
                    </button>
                  </div>
                )}

                {/* Durum rozeti (approved/rejected) */}
                {tab !== "pending" && (
                  <div className="flex justify-end mt-1">
                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${tab === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {tab === "approved" ? "✓ Onaylandı" : "✕ Reddedildi"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Daha Fazla Yükle */}
        {!loading && hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-3.5 bg-white rounded-2xl shadow-sm text-sm font-bold text-[#3949AB] flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
            {loadingMore
              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[18px]">expand_more</span>}
            {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
          </button>
        )}

        {/* Liste sonu */}
        {!loading && !hasMore && requests.length > 0 && (
          <p className="text-center text-xs text-gray-400 font-semibold py-4">
            Tüm kayıtlar gösterildi · {requests.length} talep
          </p>
        )}
      </main>
    </div>
  );
}
