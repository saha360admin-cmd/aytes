"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * Bildirim zili — emergency_alerts'teki realtime desenle aynı mantık
 * (postgres_changes aboneliği + refetch). (mobile)/dashboard'daki
 * "iletisim" ikon+rozet düzeniyle görsel olarak tutarlı olacak şekilde
 * tasarlandı; her sayfanın kendi header'ına eklenebilir.
 */
export default function NotificationBell({ href = "/bildirimler" }: { href?: string }) {
  const { personnel } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!personnel) return;

    async function loadUnread() {
      if (!personnel) return;
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("personnel_id", personnel.id)
        .is("read_at", null);
      setUnread(count || 0);
    }

    loadUnread();

    const channel = supabase
      .channel(`notifications-${personnel.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `personnel_id=eq.${personnel.id}` },
        () => loadUnread()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [personnel]);

  return (
    <Link href={href} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors">
      <span className="material-symbols-outlined text-[20px]">notifications</span>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center px-1">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
