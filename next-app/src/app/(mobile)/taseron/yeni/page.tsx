"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface DepartmentOption { id: string; name: string; }

function TaseronYeniForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { personnel } = useAuth();

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [contractorName, setContractorName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [description, setDescription] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [contractorTicketNo, setContractorTicketNo] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const qIncidentId   = searchParams.get("incident_id") ?? "";
    const qDepartmentId = searchParams.get("department_id") ?? "";
    const qDescription  = searchParams.get("description") ?? "";
    if (qIncidentId)   setIncidentId(qIncidentId);
    if (qDepartmentId) setDepartmentId(qDepartmentId);
    if (qDescription)  setDescription(qDescription);
  }, [searchParams]);

  useEffect(() => {
    supabase.from("departments").select("id, name").order("name")
      .then(({ data }) => setDepartments((data || []) as DepartmentOption[]));
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSubmit() {
    if (!contractorName.trim() || !departmentId || !description.trim()) {
      showToast("Zorunlu alanları doldurun.", false);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      contractor_name: contractorName.trim(),
      department_id: departmentId,
      description: description.trim(),
      status: "open",
      opened_at: new Date().toISOString(),
    };
    if (incidentId.trim())        payload.incident_id          = incidentId.trim();
    if (contractorTicketNo.trim()) payload.contractor_ticket_no = contractorTicketNo.trim();
    if (locationDetail.trim())    payload.location_detail      = locationDetail.trim();
    if (notes.trim())             payload.notes                = notes.trim();
    if (personnel?.id)            payload.created_by           = personnel.id;

    const { error } = await supabase.from("service_requests").insert(payload);
    setSaving(false);
    if (error) {
      showToast("Kayıt oluşturulamadı: " + error.message, false);
    } else {
      router.push("/taseron");
    }
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-8">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-0 right-0 max-w-[430px] mx-auto z-[60] flex justify-center px-4`}>
          <div className={`flex items-center gap-2 px-5 py-3 rounded-full shadow-xl text-sm font-bold text-white ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
            <span className="material-symbols-outlined text-[18px]">{toast.ok ? "check_circle" : "error"}</span>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 h-16 shadow-sm"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/15 active:scale-90 transition-all">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-white text-lg leading-tight">Yeni Taşeron Kaydı</h1>
          <p className="text-white/70 text-xs">Arıza veya destek talebini kayıt al</p>
        </div>
      </header>

      <div className="px-4 pt-5 space-y-4">

        {/* Olay bağlantısı (pre-fill varsa) */}
        {incidentId && (
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 rounded-2xl border border-indigo-100">
            <span className="material-symbols-outlined text-indigo-400 text-[20px]">link</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-indigo-600">Olay ile bağlantılı</p>
              <p className="text-[10px] text-indigo-400 font-mono truncate">{incidentId}</p>
            </div>
          </div>
        )}

        {/* Temel bilgiler */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Temel Bilgiler</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Birim <span className="text-red-500">*</span></label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none">
              <option value="">Birim seçin…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Taşeron / Firma <span className="text-red-500">*</span></label>
            <input type="text" value={contractorName} onChange={e => setContractorName(e.target.value)}
              placeholder="Örn: ABC Teknik Servis"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">Açıklama <span className="text-red-500">*</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Arıza veya destek talebini açıklayın…"
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none resize-none" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">
              Konum <span className="text-xs font-normal text-gray-400">(opsiyonel)</span>
            </label>
            <input type="text" value={locationDetail} onChange={e => setLocationDetail(e.target.value)}
              placeholder="Örn: B Blok, 2. Kat, Oda 204"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
          </div>
        </div>

        {/* Ek bilgiler */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ek Bilgiler</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">
              İş Emri No <span className="text-xs font-normal text-gray-400">(opsiyonel)</span>
            </label>
            <input type="text" value={contractorTicketNo} onChange={e => setContractorTicketNo(e.target.value)}
              placeholder="Taşeronun verdiği iş emri numarası"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700">
              Notlar <span className="text-xs font-normal text-gray-400">(opsiyonel)</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ek notlar…" rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none resize-none" />
          </div>
        </div>

        {/* Butonlar */}
        <div className="flex gap-3 pb-6">
          <button onClick={() => router.back()}
            className="flex-1 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-all">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
            {saving
              ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>save</span>}
            {saving ? "Kaydediliyor…" : "Kaydı Oluştur"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TaseronYeniPage() {
  return <Suspense><TaseronYeniForm /></Suspense>;
}
