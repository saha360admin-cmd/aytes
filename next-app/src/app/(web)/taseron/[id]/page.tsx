"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open:        { label: "Açık",          bg: "bg-amber-100",  text: "text-amber-700" },
  in_progress: { label: "Devam Ediyor",  bg: "bg-blue-100",   text: "text-blue-700"  },
  resolved:    { label: "Çözüldü",       bg: "bg-green-100",  text: "text-green-700" },
  cancelled:   { label: "İptal",         bg: "bg-gray-100",   text: "text-gray-500"  },
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

type StatusValue = "open" | "in_progress" | "resolved" | "cancelled";

export default function TaseronDetayPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Düzenlenebilir alanlar
  const [editTicketNo, setEditTicketNo] = useState("");
  const [editStatus, setEditStatus] = useState<StatusValue>("open");
  const [editNotes, setEditNotes] = useState("");

  useEffect(() => {
    if (!id) return;
    supabase
      .from("service_requests")
      .select(`
        *,
        department:departments(id, name),
        incident:incidents(id, title, type),
        creator:personnel!created_by(id, full_name)
      `)
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoading(false);
          return;
        }
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
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave() {
    if (!record) return;
    setSaving(true);

    const updates: Record<string, unknown> = {
      contractor_ticket_no: editTicketNo.trim() || null,
      status: editStatus,
      notes: editNotes.trim() || null,
    };

    // Status "resolved" seçildiyse resolved_at otomatik set et
    if (editStatus === "resolved" && record.status !== "resolved") {
      updates.resolved_at = new Date().toISOString();
    } else if (editStatus !== "resolved") {
      updates.resolved_at = null;
    }

    const { error } = await supabase
      .from("service_requests")
      .update(updates)
      .eq("id", id);

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
      <div className="flex justify-center py-20">
        <span className="material-symbols-outlined animate-spin text-indigo-600 text-[40px]">progress_activity</span>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <span className="material-symbols-outlined text-gray-300 text-[52px] block mb-3">search_off</span>
        <p className="text-gray-500 font-semibold">Kayıt bulunamadı.</p>
        <button onClick={() => router.push("/taseron")} className="mt-4 text-sm text-indigo-600 font-bold underline">
          Listeye Dön
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.open;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
          {toast.msg}
        </div>
      )}

      {/* Sayfa başlığı */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/taseron")}
          className="p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-gray-500"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">Taşeron Kaydı Detayı</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{record.id}</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Kayıt detayları */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide border-b border-gray-100 pb-3 mb-4">
          Kayıt Bilgileri
        </h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Konum</p>
              <p className="text-sm text-gray-700 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-gray-400">location_on</span>
                {record.location_detail}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Açılış Tarihi</p>
              <p className="text-sm text-gray-700">{formatDate(record.opened_at)}</p>
            </div>
            {record.resolved_at && (
              <div>
                <p className="text-xs font-bold text-gray-400 mb-1">Kapanış Tarihi</p>
                <p className="text-sm text-gray-700">{formatDate(record.resolved_at)}</p>
              </div>
            )}
          </div>

          {record.incident && (
            <div>
              <p className="text-xs font-bold text-gray-400 mb-1">Bağlı Olay</p>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                <span className="material-symbols-outlined text-indigo-500 text-[16px]">link</span>
                <p className="text-sm font-semibold text-indigo-700">
                  {record.incident.title || record.incident.type}
                </p>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-gray-400 mb-1">Kaydeden</p>
            <p className="text-sm text-gray-700">{record.creator?.full_name ?? "Bilinmiyor"}</p>
          </div>
        </div>
      </div>

      {/* Düzenleme formu */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
        <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide border-b border-gray-100 pb-3 mb-4">
          Güncelle
        </h2>

        <div className="space-y-4">
          {/* Taşeron bilet no */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">Taşeron Bilet / İş Emri No</label>
            <input
              type="text"
              value={editTicketNo}
              onChange={e => setEditTicketNo(e.target.value)}
              placeholder="Taşeronun verdiği iş emri numarası"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Durum */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">Durum</label>
            <select
              value={editStatus}
              onChange={e => setEditStatus(e.target.value as StatusValue)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
            >
              <option value="open">Açık</option>
              <option value="in_progress">Devam Ediyor</option>
              <option value="resolved">Çözüldü</option>
              <option value="cancelled">İptal</option>
            </select>
            {editStatus === "resolved" && record.status !== "resolved" && (
              <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">info</span>
                Çözüm tarihi otomatik olarak şu an atanacak.
              </p>
            )}
          </div>

          {/* Notlar */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">Notlar</label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Yapılan işlemler, açıklamalar…"
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all resize-none"
            />
          </div>
        </div>
      </div>

      {/* Butonlar */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push("/taseron")}
          className="flex-1 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Geri Dön
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
        >
          {saving
            ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
          {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
        </button>
      </div>
    </div>
  );
}
