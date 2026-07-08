"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";

// İş mantığı mobildeki (mobile)/taseron/{yeni,[id]}/page.tsx ve
// (mobile)/taseron/firma/{,yeni}/page.tsx ile birebir aynı —
// service_requests/contractors tablolarını mobil ve masaüstü aynı
// kurallarla okuyup yazmalı.

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toTitleCase(str: string): string {
  return str.toLocaleLowerCase("tr-TR").replace(/(^|\s)\S/g, c => c.toLocaleUpperCase("tr-TR"));
}

function formatDateLong(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type StatusValue = "open" | "in_progress" | "resolved" | "cancelled";

const STATUS_SORT: Record<StatusValue, number> = { open: 0, in_progress: 1, resolved: 2, cancelled: 3 };

const STATUS_CONFIG: Record<StatusValue, { label: string; bg: string; text: string; border: string }> = {
  open: { label: "Açık", bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  in_progress: { label: "Devam Ediyor", bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  resolved: { label: "Çözüldü", bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  cancelled: { label: "İptal", bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
};

const TABS = [
  { key: "active", label: "Aktif" },
  { key: "resolved", label: "Çözüldü" },
  { key: "cancelled", label: "İptal" },
  { key: "all", label: "Hepsi" },
] as const;
type TabKey = typeof TABS[number]["key"];

const SECTIONS = [
  { key: "kayitlar", label: "Kayıtlar", icon: "assignment" },
  { key: "firmalar", label: "Firmalar", icon: "business" },
] as const;
type SectionKey = typeof SECTIONS[number]["key"];

interface SelectOption { id: string; name: string; }

interface ServiceRequestRow {
  id: string;
  department_id: string;
  contractor_name: string;
  contractor_ticket_no: string | null;
  description: string;
  location_detail: string | null;
  status: StatusValue;
  opened_at: string;
  department: { id: string; name: string } | null;
}

interface ServiceRequestDetail {
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

const emptyCreateForm = {
  departmentId: "",
  contractorId: "",
  locationId: "",
  description: "",
  contractorTicketNo: "",
  notes: "",
  incidentId: "",
};

function WebTaseronPageInner() {
  const searchParams = useSearchParams();
  const [section, setSection] = useState<SectionKey>("kayitlar");

  const qIncidentId = searchParams.get("incident_id") ?? "";
  const qDepartmentId = searchParams.get("department_id") ?? "";
  const qDescription = searchParams.get("description") ?? "";
  const prefill = useMemo(
    () => (qIncidentId || qDepartmentId || qDescription
      ? { incidentId: qIncidentId, departmentId: qDepartmentId, description: qDescription }
      : null),
    [qIncidentId, qDepartmentId, qDescription]
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">Taşeron Takip</h1>
          <p className="text-on-surface-variant">Arıza/destek kayıtlarını oluşturun, sonuçlandırın ve taşeron firmaları yönetin.</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
                section === s.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {section === "kayitlar" ? <ServiceRequestsSection prefill={prefill} /> : <ContractorsSection />}
    </div>
  );
}

export default function WebTaseronPage() {
  return (
    <Suspense>
      <WebTaseronPageInner />
    </Suspense>
  );
}

// ───────────────────────── Kayıtlar (service_requests: liste + oluştur + detay) ─────────────────────────

interface ServiceRequestsPrefill { incidentId: string; departmentId: string; description: string; }

function ServiceRequestsSection({ prefill }: { prefill: ServiceRequestsPrefill | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [records, setRecords] = useState<ServiceRequestRow[]>([]);
  const [tab, setTab] = useState<TabKey>("active");

  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [contractors, setContractors] = useState<SelectOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm });
  const [saving, setSaving] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ServiceRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editTicketNo, setEditTicketNo] = useState("");
  const [editStatus, setEditStatus] = useState<StatusValue>("open");
  const [editNotes, setEditNotes] = useState("");
  const [detailSaving, setDetailSaving] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    load();
    Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("locations").select("id, name").order("name"),
      supabase.from("contractors").select("id, name").order("name"),
    ]).then(([deptRes, locRes, conRes]) => {
      setDepartments((deptRes.data || []) as SelectOption[]);
      setLocations((locRes.data || []) as SelectOption[]);
      setContractors((conRes.data || []) as SelectOption[]);
    });
  }, []);

  useEffect(() => {
    if (!prefill) return;
    setCreateForm(f => ({
      ...f,
      incidentId: prefill.incidentId,
      departmentId: prefill.departmentId || f.departmentId,
      description: prefill.description || f.description,
    }));
    setCreateOpen(true);
  }, [prefill]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data, error: qError } = await supabase
        .from("service_requests")
        .select(`id, department_id, contractor_name, contractor_ticket_no, description, location_detail, status, opened_at, department:departments(id, name)`)
        .order("opened_at", { ascending: false });

      if (qError) throw qError;

      const sorted = ((data || []) as unknown as ServiceRequestRow[]).sort(
        (a, b) => (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99)
      );
      setRecords(sorted);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setCreateForm({ ...emptyCreateForm });
    setCreateOpen(true);
  }

  async function handleCreateSubmit() {
    if (!createForm.contractorId || !createForm.departmentId || !createForm.description.trim()) {
      showToast("Zorunlu alanları doldurun.", false);
      return;
    }
    setSaving(true);
    const selectedLocation = locations.find(l => l.id === createForm.locationId);
    const selectedContractor = contractors.find(c => c.id === createForm.contractorId);
    const payload: Record<string, unknown> = {
      contractor_name: selectedContractor?.name ?? "",
      department_id: createForm.departmentId,
      description: createForm.description.trim(),
      status: "open",
      opened_at: new Date().toISOString(),
    };
    if (createForm.incidentId.trim()) payload.incident_id = createForm.incidentId.trim();
    if (createForm.contractorTicketNo.trim()) payload.contractor_ticket_no = createForm.contractorTicketNo.trim();
    if (selectedLocation) payload.location_detail = selectedLocation.name;
    if (createForm.notes.trim()) payload.notes = createForm.notes.trim();

    const { error: insertError } = await supabase.from("service_requests").insert(payload);
    setSaving(false);
    if (insertError) {
      showToast("Kayıt oluşturulamadı. Lütfen tekrar deneyin.", false);
    } else {
      setCreateOpen(false);
      showToast("Kayıt oluşturuldu", true);
      load();
    }
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setDetailLoading(true);
    const { data, error: qError } = await supabase
      .from("service_requests")
      .select(`*, department:departments(id,name), incident:incidents(id,title,type), creator:personnel!created_by(id,full_name)`)
      .eq("id", id)
      .single();
    if (qError || !data) {
      showToast("Kayıt yüklenemedi", false);
      setDetailId(null);
      setDetailLoading(false);
      return;
    }
    const r = data as unknown as ServiceRequestDetail;
    setDetail(r);
    setEditTicketNo(r.contractor_ticket_no ?? "");
    setEditStatus(r.status);
    setEditNotes(r.notes ?? "");
    setDetailLoading(false);
  }

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
  }

  async function handleDetailSave() {
    if (!detail) return;
    setDetailSaving(true);
    const updates: Record<string, unknown> = {
      contractor_ticket_no: editTicketNo.trim() || null,
      status: editStatus,
      notes: editNotes.trim() || null,
    };
    if (editStatus === "resolved" && detail.status !== "resolved") {
      updates.resolved_at = new Date().toISOString();
    } else if (editStatus !== "resolved") {
      updates.resolved_at = null;
    }
    const { error: updateError } = await supabase.from("service_requests").update(updates).eq("id", detail.id);
    setDetailSaving(false);
    if (updateError) {
      showToast("Güncelleme başarısız: " + updateError.message, false);
    } else {
      showToast("Kayıt güncellendi", true);
      setDetail(prev => prev ? { ...prev, ...updates } as ServiceRequestDetail : prev);
      load();
    }
  }

  const filtered = records.filter(r => {
    if (tab === "active") return r.status === "open" || r.status === "in_progress";
    if (tab === "resolved") return r.status === "resolved";
    if (tab === "cancelled") return r.status === "cancelled";
    return true;
  });

  const activeCount = records.filter(r => r.status === "open" || r.status === "in_progress").length;

  const columns: DataTableColumn[] = [
    { key: "department", label: "Departman", sortable: true },
    { key: "location", label: "Lokasyon", sortable: true },
    { key: "description", label: "Açıklama" },
    { key: "contractor", label: "Taşeron" },
    { key: "ticket", label: "Bilet No" },
    { key: "statusBadge", label: "Durum" },
    { key: "date", label: "Tarih", sortable: true },
    { key: "actions", label: "", exportable: false },
  ];

  const tableData = filtered.map(r => {
    const badge = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.open;
    const statusBadge: DataTableCell = {
      csv: badge.label,
      display: (
        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      ),
    };
    const actions: DataTableCell = {
      csv: "",
      display: (
        <button
          onClick={() => openDetail(r.id)}
          title="Detay"
          className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
        </button>
      ),
    };
    return {
      department: r.department?.name ?? "Bilinmiyor",
      location: r.location_detail ?? "—",
      description: r.description.length > 70 ? r.description.slice(0, 70) + "…" : r.description,
      contractor: r.contractor_name,
      ticket: r.contractor_ticket_no ? `#${r.contractor_ticket_no}` : "—",
      statusBadge,
      date: formatDate(r.opened_at),
      actions,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <p className="text-on-surface-variant">
          {activeCount > 0 ? `${activeCount} açık/devam eden kayıt` : "Tüm kayıtlar çözümlendi"}
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          Yeni Kayıt
        </button>
      </div>

      <div className="flex gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              tab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-error font-semibold">Veriler yüklenemedi. Sayfayı yenileyin.</p>
      ) : (
        <DataTable columns={columns} data={tableData} loading={loading} exportable />
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <h2 className="font-display text-headline-sm text-on-surface">Yeni Kayıt Oluştur</h2>
              <button onClick={() => setCreateOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {createForm.incidentId && (
                <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 rounded-xl border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-[20px]">link</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary">Olay ile bağlantılı</p>
                    <p className="text-[10px] text-primary/70 font-mono truncate">{createForm.incidentId}</p>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Birim *</label>
                <select
                  value={createForm.departmentId}
                  onChange={e => setCreateForm(f => ({ ...f, departmentId: e.target.value }))}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Birim seçin…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Taşeron / Firma *</label>
                <select
                  value={createForm.contractorId}
                  onChange={e => setCreateForm(f => ({ ...f, contractorId: e.target.value }))}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Firma seçin…</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Lokasyon (opsiyonel)</label>
                <select
                  value={createForm.locationId}
                  onChange={e => setCreateForm(f => ({ ...f, locationId: e.target.value }))}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Lokasyon seçin…</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Arıza Açıklama *</label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: toTitleCase(e.target.value) }))}
                  placeholder="Arıza veya destek talebini açıklayın…"
                  rows={3}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">İş Emri No (opsiyonel)</label>
                  <input
                    value={createForm.contractorTicketNo}
                    onChange={e => setCreateForm(f => ({ ...f, contractorTicketNo: e.target.value }))}
                    placeholder="Taşeronun iş emri no"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Notlar (opsiyonel)</label>
                  <input
                    value={createForm.notes}
                    onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Ek notlar…"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
              <button
                onClick={handleCreateSubmit}
                disabled={saving}
                className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
              >
                {saving ? "Kaydediliyor…" : "Kaydı Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDetail} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <div>
                <h2 className="font-display text-headline-sm text-on-surface">Taşeron Kaydı</h2>
                {detail && <p className="text-[10px] text-on-surface-variant font-mono truncate">{detail.id}</p>}
              </div>
              <button onClick={closeDetail} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="flex justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-[28px] text-primary">progress_activity</span>
              </div>
            ) : (
              <>
                <div className="overflow-y-auto px-6 py-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-bold text-on-surface-variant mb-1">Birim</p>
                      <p className="text-sm font-semibold text-on-surface">{detail.department?.name ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-on-surface-variant mb-1">Taşeron / Firma</p>
                      <p className="text-sm font-semibold text-on-surface">{detail.contractor_name}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-on-surface-variant mb-1">Açıklama</p>
                    <p className="text-sm text-on-surface leading-relaxed bg-surface-container-low rounded-xl px-4 py-3">{detail.description}</p>
                  </div>

                  {detail.location_detail && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-outline text-[15px]">location_on</span>
                      <p className="text-sm text-on-surface-variant">{detail.location_detail}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-bold text-on-surface-variant mb-1">Açılış Tarihi</p>
                      <p className="text-xs text-on-surface">{formatDateLong(detail.opened_at)}</p>
                    </div>
                    {detail.resolved_at && (
                      <div>
                        <p className="text-xs font-bold text-on-surface-variant mb-1">Kapanış Tarihi</p>
                        <p className="text-xs text-on-surface">{formatDateLong(detail.resolved_at)}</p>
                      </div>
                    )}
                  </div>

                  {detail.incident && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 rounded-xl border border-primary/20">
                      <span className="material-symbols-outlined text-primary text-[16px]">link</span>
                      <p className="text-sm font-semibold text-primary">{detail.incident.title || detail.incident.type}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-bold text-on-surface-variant mb-1">Kaydeden</p>
                    <p className="text-sm text-on-surface-variant">{detail.creator?.full_name ?? "Bilinmiyor"}</p>
                  </div>

                  <div className="border-t border-outline-variant/20 pt-4 space-y-4">
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Güncelle</p>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-on-surface-variant ml-1">İş Emri No</label>
                      <input
                        value={editTicketNo}
                        onChange={e => setEditTicketNo(e.target.value)}
                        placeholder="Taşeronun iş emri no"
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-on-surface-variant ml-1">Durum</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(STATUS_CONFIG) as StatusValue[]).map(s => {
                          const cfg = STATUS_CONFIG[s];
                          return (
                            <button
                              key={s}
                              onClick={() => setEditStatus(s)}
                              className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                                editStatus === s ? `${cfg.bg} ${cfg.text} ${cfg.border}` : "bg-surface-container-low border-transparent text-on-surface-variant"
                              }`}
                            >
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                      {editStatus === "resolved" && detail.status !== "resolved" && (
                        <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">info</span>
                          Çözüm tarihi otomatik atanacak.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-on-surface-variant ml-1">Notlar</label>
                      <textarea
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        placeholder="Yapılan işlemler, açıklamalar…"
                        rows={3}
                        className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
                  <button
                    onClick={handleDetailSave}
                    disabled={detailSaving}
                    className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
                  >
                    {detailSaving ? "Kaydediliyor…" : "Kaydet"}
                  </button>
                </div>
              </>
            )}
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

// ───────────────────────── Firmalar (contractors: liste + oluştur) ─────────────────────────

interface Contractor { id: string; name: string; description: string | null; created_at: string; }

function ContractorsSection() {
  const [firms, setFirms] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    load();
  }, []);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("contractors").select("*").order("name");
    setFirms((data || []) as Contractor[]);
    setLoading(false);
  }

  function openCreate() {
    setName("");
    setDescription("");
    setCreateOpen(true);
  }

  async function handleSubmit() {
    if (!name.trim()) { showToast("Firma adı zorunludur.", false); return; }
    setSaving(true);
    const payload: Record<string, string> = { name: name.trim() };
    if (description.trim()) payload.description = description.trim();
    const { error } = await supabase.from("contractors").insert(payload);
    setSaving(false);
    if (error) {
      showToast("Kayıt oluşturulamadı. Lütfen tekrar deneyin.", false);
    } else {
      setCreateOpen(false);
      showToast("Firma eklendi", true);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-on-surface-variant">{firms.length} firma kayıtlı</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          Yeni Firma
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[32px] text-primary">progress_activity</span>
        </div>
      ) : firms.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl p-10 flex flex-col items-center gap-3 shadow-sm border border-outline-variant/10">
          <span className="material-symbols-outlined text-outline-variant text-[48px]">business</span>
          <p className="text-sm font-semibold text-on-surface-variant">Henüz firma kaydı yok</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {firms.map(firm => (
            <div key={firm.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 px-4 py-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]">business</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface text-sm truncate">{firm.name}</p>
                {firm.description && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{firm.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display text-headline-sm text-on-surface">Yeni Firma Kaydı</h2>
              <button onClick={() => setCreateOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Firma Adı *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value.toLocaleUpperCase("tr-TR"))}
                placeholder="Örn: ABC TEKNİK SERVİS"
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface-variant ml-1">Kısa Açıklama (opsiyonel)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value.replace(/\b\S/g, c => c.toLocaleUpperCase("tr-TR")))}
                placeholder="Firmanın uzmanlık alanı veya notlar…"
                rows={3}
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
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
