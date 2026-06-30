"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const STATUS_SORT: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, cancelled: 3 };

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  open:        { label: "Açık",          bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-400" },
  in_progress: { label: "Devam Ediyor",  bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500"  },
  resolved:    { label: "Çözüldü",       bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500" },
  cancelled:   { label: "İptal",         bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-400"  },
};

interface Department { id: string; name: string; }
interface IncidentInfo { id: string; title: string | null; type: string; }
interface CreatorInfo { id: string; full_name: string; }

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
  created_by: string | null;
  notes: string | null;
  department: Department | null;
  incident: IncidentInfo | null;
  creator: CreatorInfo | null;
}

interface DepartmentOption { id: string; name: string; }

export default function TaseronListePage() {
  const router = useRouter();
  const [records, setRecords] = useState<ServiceRequest[]>([]);
  const [filtered, setFiltered] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [recordsRes, deptsRes] = await Promise.all([
      supabase
        .from("service_requests")
        .select(`
          *,
          department:departments(id, name),
          incident:incidents(id, title, type),
          creator:personnel!created_by(id, full_name)
        `)
        .order("opened_at", { ascending: false }),
      supabase.from("departments").select("id, name").order("name"),
    ]);

    const data = (recordsRes.data || []) as ServiceRequest[];
    setRecords(data);
    setDepartments((deptsRes.data || []) as DepartmentOption[]);
    applyFilters(data, filterStatus, filterDept, filterDateFrom, filterDateTo);
    setLoading(false);
  }

  function applyFilters(
    data: ServiceRequest[],
    status: string,
    dept: string,
    dateFrom: string,
    dateTo: string,
  ) {
    let result = [...data];

    if (status !== "all") result = result.filter(r => r.status === status);
    if (dept !== "all") result = result.filter(r => r.department_id === dept);
    if (dateFrom) result = result.filter(r => r.opened_at >= dateFrom);
    if (dateTo) {
      const toEnd = dateTo + "T23:59:59";
      result = result.filter(r => r.opened_at <= toEnd);
    }

    result.sort((a, b) => (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99));
    setFiltered(result);
  }

  useEffect(() => {
    applyFilters(records, filterStatus, filterDept, filterDateFrom, filterDateTo);
  }, [filterStatus, filterDept, filterDateFrom, filterDateTo, records]);

  const openCount = records.filter(r => r.status === "open" || r.status === "in_progress").length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Sayfa başlığı */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Taşeron Takip</h1>
          <p className="text-sm text-gray-500 mt-1">
            {openCount > 0
              ? `${openCount} açık/devam eden kayıt`
              : "Tüm kayıtlar çözümlendi"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/web/taseron/rapor")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">bar_chart</span>
            Rapor
          </button>
          <button
            onClick={() => router.push("/web/taseron/yeni")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95 shadow-sm"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Yeni Taşeron Kaydı
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400">Durum</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
          >
            <option value="all">Tümü</option>
            <option value="open">Açık</option>
            <option value="in_progress">Devam Ediyor</option>
            <option value="resolved">Çözüldü</option>
            <option value="cancelled">İptal</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400">Birim</label>
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
          >
            <option value="all">Tüm Birimler</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400">Başlangıç Tarihi</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-400">Bitiş Tarihi</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-indigo-600 text-[40px]">progress_activity</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-gray-300 text-[52px]">engineering</span>
          <p className="text-sm font-semibold text-gray-400">Kayıt bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const statusCfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.open;
            const desc = req.description.length > 60
              ? req.description.slice(0, 60) + "…"
              : req.description;

            return (
              <div
                key={req.id}
                onClick={() => router.push(`/web/taseron/${req.id}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  {/* Sol: birim + açıklama */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusCfg.dot}`} />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide truncate">
                        {req.department?.name ?? "Bilinmiyor"}
                      </span>
                      {req.incident && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 flex-shrink-0">
                          Olay bağlantılı
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 leading-snug">{desc}</p>
                    {req.location_detail && (
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">location_on</span>
                        {req.location_detail}
                      </p>
                    )}
                  </div>

                  {/* Sağ: taşeron + ticket + durum + tarih */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                      {statusCfg.label}
                    </span>
                    <p className="text-sm font-bold text-gray-700">{req.contractor_name}</p>
                    <p className="text-xs text-gray-400 font-mono">
                      #{req.contractor_ticket_no ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(req.opened_at)}</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    Kaydeden: {req.creator?.full_name ?? "Bilinmiyor"}
                  </p>
                  <span className="text-xs text-indigo-500 font-semibold group-hover:underline flex items-center gap-1">
                    Detay
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </span>
                </div>
              </div>
            );
          })}

          <p className="text-center text-xs text-gray-400 font-semibold py-4">
            {filtered.length} kayıt gösteriliyor
          </p>
        </div>
      )}
    </div>
  );
}
