"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface NotificationRow {
  id: string;
  type: "vardiya" | "devriye" | "olay";
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

const TYPE_ICON: Record<NotificationRow["type"], string> = {
  vardiya: "calendar_month",
  devriye: "route",
  olay: "report_problem",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "az önce";
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

export default function BildirimlerPage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!personnel) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, created_at, read_at")
      .eq("personnel_id", personnel.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(data || []);
    setLoading(false);
  }, [personnel]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  }

  const unreadCount = items.filter(n => !n.read_at).length;

  async function markAllRead() {
    if (!personnel || unreadCount === 0) return;
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("notifications").update({ read_at: now }).eq("personnel_id", personnel.id).is("read_at", null);
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col">
      <header className="w-full sticky top-0 z-40 bg-surface shadow-sm px-6 h-16 flex items-center gap-4">
        <button onClick={() => router.back()} className="active:scale-95 transition-transform p-2 -ml-2 rounded-full hover:bg-surface-container-high">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="text-headline-md font-bold text-primary flex-1">Bildirimler</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-label-md font-bold text-primary px-3 py-1.5 rounded-full hover:bg-primary-container/40 active:scale-95 transition-all whitespace-nowrap"
          >
            Tümünü Okundu İşaretle
          </button>
        )}
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        {loading ? (
          <div className="flex justify-center py-24">
            <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px]">notifications_off</span>
            <p className="text-body-md">Henüz bildirimin yok</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(n => (
              <button
                key={n.id}
                onClick={() => !n.read_at && markRead(n.id)}
                className={`text-left rounded-xl p-4 shadow-sm flex items-start gap-3 transition-colors ${
                  n.read_at ? "bg-surface-container-lowest" : "bg-primary-container/40"
                }`}
              >
                <span className="material-symbols-outlined text-primary text-[22px] flex-shrink-0 mt-0.5">
                  {TYPE_ICON[n.type] ?? "notifications"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-body-md font-bold text-on-surface truncate">{n.title}</p>
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-label-md text-on-surface-variant mt-0.5">{n.body}</p>
                  <p className="text-label-sm text-outline mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
