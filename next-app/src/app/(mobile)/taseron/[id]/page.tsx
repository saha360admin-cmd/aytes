"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { getDepartmentHeaderTheme } from "@/lib/departmentTheme";

const TR_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  open:        { label: "Açık",         bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200"  },
  in_progress: { label: "Devam Ediyor", bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200"   },
  resolved:    { label: "Çözüldü",      bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200"},
  cancelled:   { label: "İptal",        bg: "bg-gray-100",    text: "text-gray-500",    border: "border-gray-200"   },
};

type StatusValue = "open" | "in_progress" | "resolved" | "cancelled";

interface ServiceRequest {
  id: string;
  incident_id: string | null;
  department_id: string;
  contractor_name: string;
  contractor_ticket_no: string | null;
  description: string;
  location_detail: string | null;
  status: StatusValue;
  opened_at: string;
  resolved_at: string | null;
  notes: string | null;
  department: { id: string; name: string } | null;
  incident: { id: string; title: string | null; type: string } | null;
  creator: { id: string; full_name: string } | null;
}

export default function MobileTaseronDetayPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { personnel } = useAuth();
  const headerTheme = getDepartmentHeaderTheme(personnel?.departments?.slug);

  const [record, setRecord] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [editTicketNo, setEditTicketNo] = useState("");
  const [editStatus, setEditStatus] = useState<StatusValue>("open");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    if (!id) return;
    supabase
      .from("service_requests")
      .select(`*, department:departments(id,name), incident:incidents(id,title,type), creator:personnel!created_by(id,full_name)`)
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setLoading(false); return; }
        const r = data as ServiceRequest;
        setRecord(r);
        setEditTicketNo(r.contractor_ticket_no ?? "");
        setEditStatus(r.status);
        setEditNotes(r.notes ?? "");
        setLoading(false);
      });
  }, [id]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      contractor_ticket_no: editTicketNo.trim() || null,
      status: editStatus,
      notes: editNotes.trim() || null,
    };
    if (editStatus === "resolved" && record.status !== "resolved") {
      updates.resolved_at = new Date().toISOString();
    } else if (editStatus !== "resolved") {
      updates.resolved_at = null;
    }
    const { error } = await supabase.from("service_requests").update(updates).eq("id", id);
    setSaving(false);
    if (error) {
      showToast("Güncelleme başarısız: " + error.message, false);
    } else {
      showToast("Kayıt güncellendi.", true);
      setRecord(prev => prev ? { ...prev, ...updates } as ServiceRequest : prev);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
        <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f0f2ff] px-8">
        <span className="material-symbols-outlined text-gray-300 text-[52px]">search_off</span>
        <p className="font-bold text-gray-500">Kayıt bulunamadı</p>
        <button onClick={() => router.push("/taseron")}
          className="text-sm text-[#3949AB] font-bold underline">Listeye Dön</button>
      </div>
    );
  }

  const sc = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.open;

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-8">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-0 right-0 max-w-[430px] mx-auto z-[60] flex justify-center px-4">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-full shadow-xl text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
            <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: headerTheme.gradient }}>
        <button onClick={() => router.push("/taseron")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-lg leading-tight">Taşeron Kaydı</h1>
          <p className="text-white/60 text-[10px] font-mono truncate">{record.id}</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${sc.bg} ${sc.text}`}>
          {sc.label}
        </span>
      </header>

      <div className="px-4 pt-5 space-y-4">

        {/* Kayıt bilgileri */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Kayıt Bilgileri</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Birim</p>
              <p className="text-sm font-semibold text-gray-800">{record.department?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Taşeron / Firma</p>
              <p className="text-sm font-semibold text-gray-800">{record.contractor_name}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 mb-1">Açıklama</p>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl px-4 py-3">{record.description}</p>
          </div>

          {record.location_detail && (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-gray-300 text-[15px]">location_on</span>
              <p className="text-sm text-gray-600">{record.location_detail}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Açılış Tarihi</p>
              <p className="text-xs text-gray-700">{formatDate(record.opened_at)}</p>
            </div>
            {record.resolved_at && (
              <div>
                <p className="text-xs font-bold text-gray-400 mb-1">Kapanış Tarihi</p>
                <p className="text-xs text-gray-700">{formatDate(record.resolved_at)}</p>
              </div>
            )}
          </div>

          {record.incident && (
            <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <span className="material-symbols-outlined text-indigo-400 text-[16px]">link</span>
              <p className="text-sm font-semibold text-indigo-700">
                {record.incident.title || record.incident.type}
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-400 mb-1">Kaydeden</p>
            <p className="text-sm text-gray-600">{record.creator?.full_name ?? "Bilinmiyor"}</p>
          </div>
        </div>

        {/* Güncelleme formu */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Güncelle</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">İş Emri No</label>
            <input type="text" value={editTicketNo} onChange={e => setEditTicketNo(e.target.value)}
              placeholder="Taşeronun verdiği iş emri numarası"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Durum</label>
            <div className="grid grid-cols-2 gap-2">
              {(["open","in_progress","resolved","cancelled"] as StatusValue[]).map(s => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setEditStatus(s)}
                    className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                      editStatus === s
                        ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                        : "bg-gray-50 border-gray-200 text-gray-400"
                    }`}>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            {editStatus === "resolved" && record.status !== "resolved" && (
              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">info</span>
                Çözüm tarihi otomatik atanacak.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Notlar</label>
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
              placeholder="Yapılan işlemler, açıklamalar…" rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none resize-none" />
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex gap-3 pb-6">
          <button onClick={() => router.push("/taseron")}
            className="flex-1 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-all">
            Geri Dön
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            {saving
              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
