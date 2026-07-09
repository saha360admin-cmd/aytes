"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getDepartmentHeaderTheme } from "@/lib/departmentTheme";

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const STATUS_SORT: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, cancelled: 3 };

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  open:        { label: "Açık",         bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400"   },
  in_progress: { label: "Devam Ediyor", bg: "bg-blue-100",    text: "text-blue-700",    dot: "bg-blue-500"    },
  resolved:    { label: "Çözüldü",      bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  cancelled:   { label: "İptal",        bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-400"    },
};

const TABS = [
  { key: "active",    label: "Aktif"   },
  { key: "resolved",  label: "Çözüldü" },
  { key: "cancelled", label: "İptal"   },
] as const;
type TabKey = typeof TABS[number]["key"];

interface ServiceRequest {
  id: string;
  incident_id: string | null;
  department_id: string;
  contractor_name: string;
  contractor_ticket_no: string | null;
  description: string;
  location_detail: string | null;
  status: "open" | "in_progress" | "resolved" | "cancelled";
  opened_at: string;
  resolved_at: string | null;
  notes: string | null;
  department: { id: string; name: string } | null;
  incident: { id: string; title: string | null; type: string } | null;
  creator: { id: string; full_name: string } | null;
}

export default function TaseronListePage() {
  const router = useRouter();
  const { personnel } = useAuth();
  const headerTheme = getDepartmentHeaderTheme(personnel?.departments?.slug);
  const [tab, setTab] = useState<TabKey>("active");
  const [records, setRecords] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "personel") { router.replace("/dashboard"); return; }
    loadData();
  }, [personnel, router]);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from("service_requests")
      .select(`*, department:departments(id,name), incident:incidents(id,title,type), creator:personnel!created_by(id,full_name)`)
      .order("opened_at", { ascending: false });
    setRecords(
      ((data || []) as ServiceRequest[]).sort(
        (a, b) => (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99)
      )
    );
    setLoading(false);
  }

  const filtered = records.filter(r => {
    if (tab === "active")    return r.status === "open" || r.status === "in_progress";
    if (tab === "resolved")  return r.status === "resolved";
    if (tab === "cancelled") return r.status === "cancelled";
    return true;
  });

  const activeCount = records.filter(r => r.status === "open" || r.status === "in_progress").length;

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: headerTheme.gradient }}>
        <button onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-lg leading-tight">Taşeron Takip</h1>
          <p className="text-white/70 text-xs">
            {activeCount > 0 ? `${activeCount} açık/devam eden kayıt` : "Tüm kayıtlar çözümlendi"}
          </p>
        </div>
        <button onClick={() => router.push("/taseron/rapor")}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[20px]">bar_chart</span>
        </button>
        <button onClick={() => router.push("/taseron/firma/yeni")}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white text-[22px]">add</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex bg-white shadow-sm sticky top-16 z-30">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 text-xs font-bold transition-all relative ${tab === t.key ? "text-[#1A237E]" : "text-gray-400"}`}>
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1A237E] rounded-full" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 px-8 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-gray-300 text-[32px]">engineering</span>
          </div>
          <p className="font-bold text-gray-500">Bu kategoride kayıt yok</p>
        </div>
      ) : (
        <main className="px-4 pt-4 space-y-3 pb-4">
          {filtered.map(req => {
            const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.open;
            const desc = req.description.length > 70 ? req.description.slice(0, 70) + "…" : req.description;
            return (
              <div key={req.id}
                onClick={() => router.push(`/taseron/${req.id}`)}
                className="bg-white rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-all cursor-pointer">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dot}`} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide truncate max-w-[160px]">
                      {req.department?.name ?? "Bilinmiyor"}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${sc.bg} ${sc.text}`}>
                    {sc.label}
                  </span>
                </div>

                <div className="px-4 pb-3">
                  <p className="text-sm font-semibold text-gray-800 leading-snug mb-1">{desc}</p>
                  <div className="flex items-center gap-3 flex-wrap mt-2">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-gray-300 text-[13px]">engineering</span>
                      <span className="text-xs text-gray-500 font-semibold">{req.contractor_name}</span>
                    </div>
                    {req.contractor_ticket_no
                      ? <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-gray-300 text-[13px]">confirmation_number</span>
                          <span className="text-xs font-mono text-gray-500">#{req.contractor_ticket_no}</span>
                        </div>
                      : <span className="text-xs text-gray-300 font-mono">#—</span>
                    }
                    {req.incident && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                        Olay bağlantılı
                      </span>
                    )}
                  </div>
                  {req.location_detail && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="material-symbols-outlined text-gray-300 text-[13px]">location_on</span>
                      <span className="text-xs text-gray-400 truncate">{req.location_detail}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50 bg-gray-50/50">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-gray-300 text-[13px]">calendar_today</span>
                    <span className="text-xs text-gray-400">{formatDate(req.opened_at)}</span>
                  </div>
                  <span className="material-symbols-outlined text-gray-300 text-[18px]">chevron_right</span>
                </div>
              </div>
            );
          })}
        </main>
      )}

      {/* FAB */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto pointer-events-none z-50">
        <div className="flex justify-end pb-[8.5rem] pr-4">
          <button onClick={() => router.push("/taseron/yeni")}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3.5 rounded-full shadow-lg text-white text-sm font-bold active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_circle</span>
            Yeni Kayıt
          </button>
        </div>
      </div>
    </div>
  );
}
