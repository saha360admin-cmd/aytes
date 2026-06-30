"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface DepartmentOption { id: string; name: string; }

export default function TaseronYeniPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { personnel } = useAuth();

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [contractorName, setContractorName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [description, setDescription] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [contractorTicketNo, setContractorTicketNo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // URL query param'larından pre-fill
    const qIncidentId = searchParams.get("incident_id") ?? "";
    const qDepartmentId = searchParams.get("department_id") ?? "";
    const qDescription = searchParams.get("description") ?? "";

    if (qIncidentId) setIncidentId(qIncidentId);
    if (qDepartmentId) setDepartmentId(qDepartmentId);
    if (qDescription) setDescription(qDescription);
  }, [searchParams]);

  useEffect(() => {
    supabase
      .from("departments")
      .select("id, name")
      .order("name")
      .then(({ data }) => setDepartments((data || []) as DepartmentOption[]));
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractorName.trim() || !departmentId || !description.trim()) {
      showToast("Lütfen zorunlu alanları doldurun.", false);
      return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      contractor_name: contractorName.trim(),
      department_id: departmentId,
      description: description.trim(),
      status: "open",
      opened_at: new Date().toISOString(),
    };

    if (incidentId.trim()) payload.incident_id = incidentId.trim();
    if (contractorTicketNo.trim()) payload.contractor_ticket_no = contractorTicketNo.trim();
    if (locationDetail.trim()) payload.location_detail = locationDetail.trim();
    if (notes.trim()) payload.notes = notes.trim();
    if (personnel?.id) payload.created_by = personnel.id;

    const { error } = await supabase.from("service_requests").insert(payload);
    setLoading(false);

    if (error) {
      showToast("Kayıt oluşturulamadı: " + error.message, false);
    } else {
      router.push("/taseron");
    }
  }

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
        <div>
          <h1 className="text-xl font-bold text-gray-800">Yeni Taşeron Kaydı</h1>
          <p className="text-sm text-gray-500">Arıza veya destek talebini kayıt altına al</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide border-b border-gray-100 pb-3">
            Temel Bilgiler
          </h2>

          {/* Birim */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">
              Birim <span className="text-red-500">*</span>
            </label>
            <select
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
            >
              <option value="">Birim seçin…</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Taşeron adı */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">
              Taşeron Adı / Firma <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={contractorName}
              onChange={e => setContractorName(e.target.value)}
              placeholder="Örn: ABC Teknik Servis"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Açıklama */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">
              Açıklama <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Arıza veya destek talebini açıklayın…"
              rows={3}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all resize-none"
            />
          </div>

          {/* Konum */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">
              Konum Detayı <span className="text-xs text-gray-400 font-normal">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={locationDetail}
              onChange={e => setLocationDetail(e.target.value)}
              placeholder="Örn: B Blok, 2. Kat, Oda 204"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide border-b border-gray-100 pb-3">
            Ek Bilgiler
          </h2>

          {/* Taşeron bilet no */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">
              Taşeron Bilet / İş Emri No <span className="text-xs text-gray-400 font-normal">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={contractorTicketNo}
              onChange={e => setContractorTicketNo(e.target.value)}
              placeholder="Taşeronun verdiği iş emri numarası"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all"
            />
          </div>

          {/* Notlar */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-600">
              Notlar <span className="text-xs text-gray-400 font-normal">(opsiyonel)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ek notlar veya açıklamalar…"
              rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none transition-all resize-none"
            />
          </div>

          {/* Olay bağlantısı (hidden if prefilled, shown as read-only) */}
          {incidentId && (
            <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <span className="material-symbols-outlined text-indigo-500 text-[18px]">link</span>
              <div>
                <p className="text-xs font-bold text-indigo-600">Olay ile bağlantılı</p>
                <p className="text-[11px] text-indigo-400 font-mono">{incidentId}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/taseron")}
            className="flex-1 py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}
          >
            {loading
              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
            {loading ? "Kaydediliyor…" : "Kaydı Oluştur"}
          </button>
        </div>
      </form>
    </div>
  );
}
