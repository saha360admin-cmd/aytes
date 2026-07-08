"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { DataTableCell, DataTableColumn } from "@/components/web/DataTable";

// Aynı pozisyon/durum tanımları mobildeki (mobile)/personel/page.tsx ile
// birebir aynı — mobil ve masaüstü aynı gerçek veriyi/etiketleri kullansın diye.
const GUVENLIK_POSITIONS = [
  { value: "guvenlik-gorevlisi", label: "Güvenlik Görevlisi", role: "personel" },
  { value: "cctv-sorumlusu", label: "CCTV Güvenlik", role: "personel" },
  { value: "sabit-guvenlik", label: "Sabit Güvenlik", role: "personel" },
  { value: "guvenlik-sorumlusu", label: "Güvenlik Sorumlusu", role: "supervisor" },
  { value: "proje-muduru", label: "Proje Müdürü", role: "admin" },
];

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Aktif", className: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Pasif", className: "bg-gray-100 text-gray-500" },
  on_leave: { label: "İzinli", className: "bg-amber-100 text-amber-700" },
  archived: { label: "Arşiv", className: "bg-gray-100 text-gray-400" },
};

const STATUS_TABS = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Pasif" },
  { key: "on_leave", label: "İzinli" },
  { key: "archived", label: "Arşiv" },
] as const;
type StatusTabKey = typeof STATUS_TABS[number]["key"];

interface Person {
  id: string;
  auth_id: string | null;
  full_name: string;
  phone: string | null;
  position: string | null;
  location_id: string | null;
  status: string;
  security_code: string | null;
}

interface Location {
  id: string;
  name: string;
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

const emptyEditForm = { full_name: "", phone: "", position: "", location_id: "", password: "", confirmPassword: "", security_code: "" };
const emptyAddForm = { full_name: "", phone: "", position: "", location_id: "", password: "", confirmPassword: "", security_code: "" };

export default function WebGuvenlikPersonelPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [locationNameById, setLocationNameById] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Location[]>([]);
  const [deptId, setDeptId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [statusTab, setStatusTab] = useState<StatusTabKey>("all");
  const [archiving, setArchiving] = useState<string | null>(null);
  const [togglingAccess, setTogglingAccess] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editSaving, setEditSaving] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [addSaving, setAddSaving] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { data: dept } = await supabase.from("departments").select("id").eq("slug", "guvenlik").single();
      if (!dept) throw new Error("dept not found");
      setDeptId(dept.id);

      const { data: personnelRows, error: pErr } = await supabase
        .from("personnel")
        .select("id, auth_id, full_name, phone, position, location_id, status, security_code")
        .eq("department_id", dept.id)
        .order("full_name");
      if (pErr) throw pErr;

      const rows = (personnelRows || []) as Person[];
      setPeople(rows);

      const { data: locs } = await supabase
        .from("locations")
        .select("id, name")
        .or(`department_id.is.null,department_id.eq.${dept.id}`)
        .order("name");
      setLocations((locs || []) as Location[]);
      const map: Record<string, string> = {};
      for (const l of locs || []) map[l.id] = l.name;
      setLocationNameById(map);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function archivePerson(id: string) {
    setArchiving(id);
    await supabase.from("personnel").update({ status: "archived" }).eq("id", id);
    setPeople(prev => prev.map(p => (p.id === id ? { ...p, status: "archived" } : p)));
    setArchiving(null);
  }

  async function toggleAccess(p: Person) {
    const nextStatus = p.status === "inactive" ? "active" : "inactive";
    setTogglingAccess(p.id);
    await supabase.from("personnel").update({ status: nextStatus }).eq("id", p.id);
    setPeople(prev => prev.map(row => (row.id === p.id ? { ...row, status: nextStatus } : row)));
    setTogglingAccess(null);
    showToast(nextStatus === "active" ? "Erişim açıldı" : "Erişim kapatıldı");
  }

  function openEdit(p: Person) {
    setEditPerson(p);
    setEditForm({
      full_name: p.full_name,
      phone: p.phone || "",
      position: p.position || "",
      location_id: p.location_id || "",
      password: "",
      confirmPassword: "",
      security_code: p.security_code || "",
    });
    setShowEditPassword(false);
  }

  async function handleEdit() {
    if (!editPerson || !editForm.full_name) return;
    if (editForm.password && editForm.password.length < 6) { showToast("Şifre en az 6 karakter olmalı"); return; }
    if (editForm.password && editForm.password !== editForm.confirmPassword) { showToast("Şifreler eşleşmiyor"); return; }
    setEditSaving(true);

    const posObj = GUVENLIK_POSITIONS.find(pos => pos.value === editForm.position);
    const role = posObj?.role ?? "personel";
    const phoneChanged = Boolean(editForm.phone && editForm.phone !== editPerson.phone);

    await supabase.from("personnel").update({
      full_name: editForm.full_name,
      phone: editForm.phone || null,
      position: editForm.position || null,
      location_id: editForm.location_id || null,
      role,
      security_code: editForm.security_code || null,
      ...(phoneChanged ? { email: `${editForm.phone.replace(/\s/g, "")}@aytes.app` } : {}),
    }).eq("id", editPerson.id);

    if (editPerson.auth_id) {
      if (editForm.password || phoneChanged) {
        const res = await fetch("/api/update-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth_id: editPerson.auth_id,
            ...(phoneChanged ? { phone: editForm.phone } : {}),
            ...(editForm.password ? { password: editForm.password } : {}),
          }),
        });
        if (!res.ok) {
          const { error: apiError } = await res.json();
          setEditSaving(false);
          showToast("Hata: " + (apiError || "Bilinmeyen hata"));
          return;
        }
      }
    } else if (editForm.password && editForm.phone) {
      const res = await fetch("/api/link-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personnel_id: editPerson.id,
          phone: editForm.phone,
          password: editForm.password,
        }),
      });
      if (!res.ok) {
        const { error: apiError } = await res.json();
        setEditSaving(false);
        showToast("Hata: " + (apiError || "Bilinmeyen hata"));
        return;
      }
    }

    setPeople(prev => prev.map(p => (p.id === editPerson.id ? {
      ...p,
      full_name: editForm.full_name,
      phone: editForm.phone || null,
      position: editForm.position || null,
      location_id: editForm.location_id || null,
      security_code: editForm.security_code || null,
    } : p)));
    setEditSaving(false);
    setEditPerson(null);
    showToast("Personel güncellendi!");
  }

  function openAdd() {
    setAddForm({ ...emptyAddForm, position: GUVENLIK_POSITIONS[0]?.value ?? "" });
    setShowAddPassword(false);
    setShowAddModal(true);
  }

  async function handleAddSubmit() {
    if (!deptId || !addForm.full_name) return;
    if (!addForm.phone || addForm.phone.length < 10) { showToast("Geçerli bir telefon numarası girin"); return; }
    if (!addForm.password || addForm.password.length < 6) { showToast("Şifre en az 6 karakter olmalı"); return; }
    if (addForm.password !== addForm.confirmPassword) { showToast("Şifreler eşleşmiyor"); return; }
    setAddSaving(true);

    const posObj = GUVENLIK_POSITIONS.find(pos => pos.value === addForm.position);
    const role = posObj?.role ?? "personel";

    const res = await fetch("/api/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: addForm.phone,
        password: addForm.password,
        full_name: addForm.full_name,
        position: addForm.position || null,
        location_id: addForm.location_id || null,
        department_id: deptId,
        role,
        security_code: addForm.security_code || null,
      }),
    });

    setAddSaving(false);
    if (!res.ok) {
      const { error: apiError } = await res.json();
      showToast("Hata: " + (apiError || "Bilinmeyen hata"));
      return;
    }

    setShowAddModal(false);
    showToast("Personel başarıyla eklendi!");
    load();
  }

  const usedLocationIds = useMemo(() => [...new Set(people.map(p => p.location_id).filter(Boolean))] as string[], [people]);

  const filtered = people.filter(p => {
    if (statusTab !== "all" && p.status !== statusTab) return false;
    if (locationFilter !== "all" && p.location_id !== locationFilter) return false;
    if (positionFilter !== "all" && p.position !== positionFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !(p.phone || "").includes(q)) return false;
    }
    return true;
  });

  const activeCount = people.filter(p => p.status === "active").length;
  const onLeaveCount = people.filter(p => p.status === "on_leave").length;

  const columns: DataTableColumn[] = [
    { key: "name", label: "Ad Soyad", sortable: true },
    { key: "position", label: "Görev" },
    { key: "location", label: "Çalıştığı Bölge" },
    { key: "phone", label: "Telefon" },
    { key: "statusBadge", label: "Durum" },
    { key: "actions", label: "İşlemler", exportable: false },
  ];

  const tableData = filtered.map(p => {
    const badge = STATUS_LABEL[p.status] ?? STATUS_LABEL.active;
    const positionLabel = GUVENLIK_POSITIONS.find(pos => pos.value === p.position)?.label ?? p.position ?? "—";
    const name: DataTableCell = {
      csv: p.full_name,
      display: (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials(p.full_name)}
          </div>
          <span className="font-semibold text-on-surface">{p.full_name}</span>
        </div>
      ),
    };
    const statusBadge: DataTableCell = {
      csv: badge.label,
      display: <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badge.className}`}>{badge.label}</span>,
    };
    return {
      name,
      position: positionLabel,
      location: p.location_id ? (locationNameById[p.location_id] ?? "—") : "—",
      phone: p.phone || "—",
      statusBadge,
      actions: (
        <div className="flex items-center justify-end gap-1">
          <button
            title="Düzenle"
            onClick={() => openEdit(p)}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
          <button
            title={p.status === "inactive" ? "Erişimi Aç" : "Erişimi Kapat"}
            onClick={() => toggleAccess(p)}
            disabled={togglingAccess === p.id || p.status === "archived"}
            className="p-1.5 text-tertiary hover:bg-tertiary/10 rounded-lg transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">{p.status === "inactive" ? "lock" : "key"}</span>
          </button>
          {p.status !== "archived" && (
            <button
              title="Arşivle"
              onClick={() => archivePerson(p.id)}
              disabled={archiving === p.id}
              className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">archive</span>
            </button>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-background">Personel Yönetimi</h1>
          <p className="text-on-surface-variant">Güvenlik departmanındaki tüm personeli görüntüleyin ve yönetin.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Personel ara..."
              className="w-full bg-surface-container-low border-none rounded-full pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-primary text-sm outline-none"
            />
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-primary text-on-primary py-2.5 px-5 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            Yeni Personel
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              statusTab === t.key ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Bölgeye Göre Filtrele</label>
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Tüm Bölgeler</option>
              {usedLocationIds.map(id => (
                <option key={id} value={id}>{locationNameById[id] ?? id}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-on-surface-variant ml-1">Görevi</label>
            <select
              value={positionFilter}
              onChange={e => setPositionFilter(e.target.value)}
              className="w-full bg-surface-container-low border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">Tüm Görevler</option>
              {GUVENLIK_POSITIONS.map(pos => (
                <option key={pos.value} value={pos.value}>{pos.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <p className="text-error font-semibold">Veriler yüklenemedi. Sayfayı yenileyin.</p>
      ) : (
        <>
          <DataTable columns={columns} data={tableData} loading={loading} exportable />
          <p className="text-sm text-on-surface-variant">Toplam {filtered.length} personel gösteriliyor</p>
        </>
      )}

      {!loading && !error && (
        <div className="fixed bottom-6 right-6 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border border-primary/10 flex items-center gap-4 z-50">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-xs font-semibold text-on-surface-variant">{activeCount} Aktif</span>
          </div>
          <div className="w-px h-4 bg-outline-variant" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-on-surface-variant">{onLeaveCount} İzinli</span>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <h2 className="font-display text-headline-sm text-on-surface">Yeni Personel Ekle</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="overflow-y-auto px-6 py-5 space-y-4" onSubmit={e => { e.preventDefault(); handleAddSubmit(); }}>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Ad Soyad</label>
                <input
                  value={addForm.full_name}
                  onChange={e => setAddForm({ ...addForm, full_name: e.target.value })}
                  placeholder="Ahmet Yılmaz"
                  required
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Telefon Numarası</label>
                <input
                  type="tel"
                  maxLength={11}
                  value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value.replace(/\s/g, "").slice(0, 11) })}
                  placeholder="05321234567"
                  required
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Görev</label>
                  <select
                    value={addForm.position}
                    onChange={e => setAddForm({ ...addForm, position: e.target.value })}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    {GUVENLIK_POSITIONS.map(pos => (
                      <option key={pos.value} value={pos.value}>{pos.label}</option>
                    ))}
                  </select>
                  {GUVENLIK_POSITIONS.find(pos => pos.value === addForm.position)?.role === "supervisor" && (
                    <p className="text-xs text-primary ml-1">Bu görev yönetici rolü alır</p>
                  )}
                  {GUVENLIK_POSITIONS.find(pos => pos.value === addForm.position)?.role === "admin" && (
                    <p className="text-xs text-primary ml-1">Bu görev tam yönetici (admin) rolü alır</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Çalıştığı Bölge</label>
                  <select
                    value={addForm.location_id}
                    onChange={e => setAddForm({ ...addForm, location_id: e.target.value })}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Lokasyon Seçiniz</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-outline-variant/20 pt-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Giriş Şifresi</label>
                  <div className="relative">
                    <input
                      type={showAddPassword ? "text" : "password"}
                      value={addForm.password}
                      onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                      placeholder="En az 6 karakter"
                      minLength={6}
                      required
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">{showAddPassword ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Şifre Tekrar</label>
                  <input
                    type={showAddPassword ? "text" : "password"}
                    value={addForm.confirmPassword}
                    onChange={e => setAddForm({ ...addForm, confirmPassword: e.target.value })}
                    placeholder="Şifreyi tekrar girin"
                    required
                    className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${
                      addForm.confirmPassword && addForm.password !== addForm.confirmPassword ? "border-error" : "border-transparent"
                    }`}
                  />
                  {addForm.confirmPassword && addForm.password !== addForm.confirmPassword && (
                    <p className="text-xs text-error ml-1">Şifreler eşleşmiyor</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Güvenlik Kodu (şifre sıfırlama için, isteğe bağlı)</label>
                  <input
                    value={addForm.security_code}
                    onChange={e => setAddForm({ ...addForm, security_code: e.target.value })}
                    placeholder="Örn: 4-6 haneli kod"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0 mt-0.5">info</span>
                <p className="text-xs text-primary">
                  Personel <strong>{addForm.phone || "telefon no"}</strong> numarası ve belirlediğiniz şifreyle giriş yapacak.
                </p>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
              <button
                onClick={handleAddSubmit}
                disabled={addSaving}
                className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
              >
                {addSaving ? "Kaydediliyor..." : "Personel Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editPerson && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditPerson(null)} />
          <div className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
              <div>
                <h2 className="font-display text-headline-sm text-on-surface">Personel Düzenle</h2>
                <p className="text-sm text-on-surface-variant">{editPerson.full_name}</p>
              </div>
              <button
                onClick={() => setEditPerson(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="overflow-y-auto px-6 py-5 space-y-4" onSubmit={e => { e.preventDefault(); handleEdit(); }}>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Ad Soyad</label>
                <input
                  value={editForm.full_name}
                  onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Telefon</label>
                <input
                  type="tel"
                  maxLength={11}
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value.replace(/\s/g, "").slice(0, 11) })}
                  className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                />
                {editForm.phone && editForm.phone !== (editPerson.phone || "") && (
                  <p className="text-xs text-amber-600 ml-1">Telefon değişirse giriş bilgisi de güncellenir</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Görev</label>
                  <select
                    value={editForm.position}
                    onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Görev Seçiniz</option>
                    {GUVENLIK_POSITIONS.map(pos => (
                      <option key={pos.value} value={pos.value}>{pos.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Çalıştığı Bölge</label>
                  <select
                    value={editForm.location_id}
                    onChange={e => setEditForm({ ...editForm, location_id: e.target.value })}
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">Lokasyon Seçiniz</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-outline-variant/20 pt-4 space-y-4">
                <p className="text-xs font-semibold text-on-surface-variant flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">lock_reset</span>
                  Şifre Değiştir (isteğe bağlı)
                </p>
                <div className="space-y-1">
                  <div className="relative">
                    <input
                      type={showEditPassword ? "text" : "password"}
                      value={editForm.password}
                      onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="Boş bırakırsanız değişmez"
                      className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">{showEditPassword ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>
                {editForm.password && (
                  <div className="space-y-1">
                    <input
                      type={showEditPassword ? "text" : "password"}
                      value={editForm.confirmPassword}
                      onChange={e => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                      placeholder="Şifreyi tekrar girin"
                      className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none ${
                        editForm.confirmPassword && editForm.password !== editForm.confirmPassword ? "border-error" : "border-transparent"
                      }`}
                    />
                    {editForm.confirmPassword && editForm.password !== editForm.confirmPassword && (
                      <p className="text-xs text-error ml-1">Şifreler eşleşmiyor</p>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Güvenlik Kodu (şifre sıfırlama için)</label>
                  <input
                    value={editForm.security_code}
                    onChange={e => setEditForm({ ...editForm, security_code: e.target.value })}
                    placeholder="Örn: 4-6 haneli kod"
                    className="w-full bg-surface-container-low border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                {!editPerson.auth_id && (
                  <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0 mt-0.5">info</span>
                    <p className="text-xs text-primary">Bu personelin henüz giriş hesabı yok. Telefon ve şifre girerseniz hesap otomatik oluşturulur.</p>
                  </div>
                )}
              </div>
            </form>

            <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
              <button
                onClick={handleEdit}
                disabled={editSaving}
                className="w-full bg-primary text-on-primary rounded-full py-3 font-bold text-sm shadow-md disabled:opacity-60 transition-all"
              >
                {editSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-on-surface text-surface px-5 py-3 rounded-full shadow-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span className="text-sm font-semibold">{toast}</span>
        </div>
      )}
    </div>
  );
}
