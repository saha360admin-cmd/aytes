"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      const first = word[0];
      const upper = first === "i" ? "İ" : first === "ı" ? "I" : first.toLocaleUpperCase("tr-TR");
      return upper + word.slice(1);
    })
    .join(" ");
}

const POSITIONS_BY_DEPT: Record<string, { value: string; label: string; role: string }[]> = {
  idari: [
    { value: "ofis-asistani",       label: "Ofis Asistanı",            role: "personel" },
    { value: "ik-uzmani",           label: "İnsan Kaynakları Uzmanı",  role: "personel" },
    { value: "muhasebe-sorumlusu",  label: "Muhasebe Sorumlusu",       role: "personel" },
    { value: "idari-sorumlusu",     label: "İdari İşler Sorumlusu",    role: "supervisor" },
  ],
  guvenlik: [
    { value: "guvenlik-gorevlisi",  label: "Güvenlik Görevlisi",       role: "personel" },
    { value: "cctv-sorumlusu",      label: "CCTV Güvenlik",            role: "personel" },
    { value: "sabit-guvenlik",      label: "Sabit Güvenlik",           role: "personel" },
    { value: "guvenlik-sorumlusu",  label: "Güvenlik Sorumlusu",       role: "supervisor" },
    { value: "proje-muduru",        label: "Proje Müdürü",             role: "admin" },
  ],
  teknik: [
    { value: "teknik-personel",     label: "Teknik Personel",          role: "personel" },
    { value: "bakim-gorevlisi",     label: "Bakım Görevlisi",          role: "personel" },
    { value: "elektrik-teknisyeni", label: "Elektrik Teknisyeni",      role: "personel" },
    { value: "teknik-sefi",         label: "Teknik Şefi",              role: "personel" },
    { value: "teknik-sorumlusu",    label: "Teknik Sorumlusu",         role: "supervisor" },
  ],
  temizlik: [
    { value: "temizlik-gorevlisi",  label: "Temizlik Görevlisi",       role: "personel" },
    { value: "depo-sorumlusu",      label: "Depo Sorumlusu",           role: "personel" },
    { value: "ikram-personeli",     label: "İkram Personeli",          role: "personel" },
    { value: "bahcivan",            label: "Bahçıvan",                 role: "personel" },
    { value: "raporlama-uzmani",    label: "Raporlama Uzmanı",         role: "personel" },
    { value: "temizlik-sefi",       label: "Temizlik Şefi",            role: "personel" },
    { value: "temizlik-sorumlusu",  label: "Temizlik Sorumlusu",       role: "supervisor" },
  ],
};

const ALL_POSITIONS = Object.values(POSITIONS_BY_DEPT).flat();

interface Location {
  id: string;
  name: string;
}

interface Person {
  id: string;
  auth_id: string | null;
  full_name: string;
  email: string;
  role: string;
  status: string;
  avatar_url: string | null;
  phone: string | null;
  location: string | null;
  location_id: string | null;
  position: string | null;
  security_code: string | null;
}

const roleLabel: Record<string, string> = {
  admin: "Yönetici",
  supervisor: "Süpervizör",
  personel: "Personel",
};

const statusLabel: Record<string, string> = {
  active: "Aktif",
  inactive: "Pasif",
  on_leave: "İzinli",
  archived: "Arşiv",
};

const emptyForm = {
  full_name: "",
  phone: "",
  position: "",
  location: "",
  photoFile: null as File | null,
  photoPreview: "",
  password: "",
  confirmPassword: "",
  security_code: "",
};

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function getPositionLabel(pos: string | null) {
  return ALL_POSITIONS.find((p) => p.value === pos)?.label ?? null;
}

function PersonCard({
  p, locations, isAdmin, updatingLocId, updateLocationId, openEdit, updateStatus, showLocation,
  onAvatarClick, uploadingAvatar,
}: {
  p: Person;
  locations: Location[];
  isAdmin: boolean;
  updatingLocId: string | null;
  updateLocationId: (id: string, locId: string | null) => void;
  openEdit: (p: Person) => void;
  updateStatus: (id: string, status: string) => void;
  showLocation: boolean;
  onAvatarClick?: () => void;
  uploadingAvatar?: boolean;
}) {
  const isActive = p.status === "active";
  return (
    <div className={`bg-white p-md rounded-xl shadow-sm border border-gray-100 flex flex-col gap-md ${!isActive ? "opacity-75" : ""}`}>
      <div className="flex items-center gap-md">
        <div
          className={`relative w-12 h-12 rounded-full bg-indigo-100 flex-shrink-0 overflow-hidden ${isAdmin ? "cursor-pointer" : ""}`}
          onClick={isAdmin ? onAvatarClick : undefined}
        >
          {p.avatar_url ? (
            <img src={p.avatar_url} alt={p.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-indigo-700 font-bold text-base">
              {getInitials(p.full_name)}
            </div>
          )}
          {isAdmin && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity rounded-full">
              {uploadingAvatar
                ? <span className="material-symbols-outlined text-white text-[16px] animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-white text-[16px]">photo_camera</span>}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 text-[15px] truncate">{p.full_name}</h3>
          <p className="text-xs text-gray-500">{getPositionLabel(p.position) || roleLabel[p.role] || p.role}</p>
          {showLocation && p.location && (
            <p className="text-xs text-gray-400 flex items-center gap-xs mt-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>location_on</span>
              {p.location}
            </p>
          )}
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0 ${
          isActive ? "bg-emerald-100 text-emerald-700"
          : p.status === "on_leave" ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-500"
        }`}>
          {statusLabel[p.status] || p.status}
        </span>
      </div>
      {isAdmin && (
        <div className="space-y-2 pt-xs border-t border-gray-50">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">location_on</span>
            <select
              value={p.location_id || ""}
              onChange={(e) => updateLocationId(p.id, e.target.value || null)}
              disabled={updatingLocId === p.id}
              className="w-full pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 appearance-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none disabled:opacity-50">
              <option value="">— Lokasyon Ata —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">
              {updatingLocId === p.id ? "progress_activity" : "expand_more"}
            </span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-full text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1" onClick={() => openEdit(p)}>
              <span className="material-symbols-outlined text-[14px]">edit</span>Düzenle
            </button>
            <button
              className={`flex-1 py-2 rounded-full text-xs font-bold active:scale-95 transition-all ${isActive ? "bg-gray-100 text-gray-600" : "bg-indigo-600 text-white"}`}
              onClick={() => updateStatus(p.id, isActive ? "inactive" : "active")}
            >
              {isActive ? "Yetkiyi Kapat" : "Yetkiyi Aç"}
            </button>
            <button className="flex-1 bg-gray-50 text-gray-500 py-2 rounded-full text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1"
              onClick={() => updateStatus(p.id, "archived")}>
              <span className="material-symbols-outlined text-[14px]">inventory_2</span>Arşiv
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PersonelPage() {
  const { personnel, signOut } = useAuth();
  const router = useRouter();
  const POSITIONS = POSITIONS_BY_DEPT[personnel?.departments?.slug ?? ""] ?? POSITIONS_BY_DEPT.guvenlik;
  const [people, setPeople] = useState<Person[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, location_id: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [updatingLocId, setUpdatingLocId] = useState<string | null>(null);
  const [filterLocationId, setFilterLocationId] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", phone: "", position: "", location_id: "", password: "", confirmPassword: "", security_code: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  function openEdit(p: Person) {
    setEditPerson(p);
    setEditForm({ full_name: p.full_name, phone: p.phone || "", position: p.position || "", location_id: p.location_id || "", password: "", confirmPassword: "", security_code: p.security_code || "" });
    setShowEditPassword(false);
  }

  async function handleEdit() {
    if (!editPerson || !editForm.full_name) return;
    if (editForm.password && editForm.password.length < 6) { setToast("Şifre en az 6 karakter olmalı"); setTimeout(() => setToast(""), 3000); return; }
    if (editForm.password && editForm.password !== editForm.confirmPassword) { setToast("Şifreler eşleşmiyor"); setTimeout(() => setToast(""), 3000); return; }
    setEditSaving(true);

    const posObj = POSITIONS.find(p => p.value === editForm.position);
    const role = posObj?.role ?? "personel";
    const phoneChanged = editForm.phone && editForm.phone !== editPerson.phone;

    // Personnel tablosunu güncelle
    await supabase.from("personnel").update({
      full_name: editForm.full_name,
      phone: editForm.phone || null,
      position: editForm.position || null,
      location_id: editForm.location_id || null,
      role,
      security_code: editForm.security_code || null,
      ...(phoneChanged ? { email: `${editForm.phone.replace(/\s/g, "")}@aytes.app` } : {}),
    }).eq("id", editPerson.id);

    // Auth hesabı var → güncelle; yok ama şifre girildi → yeni hesap oluştur ve bağla
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
          const { error } = await res.json();
          setEditSaving(false);
          setToast("Hata: " + (error || "Bilinmeyen hata"));
          setTimeout(() => setToast(""), 4000);
          return;
        }
      }
    } else if (editForm.password && editForm.phone) {
      // Eski personel — auth hesabı henüz yok, oluştur ve bağla
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
        const { error } = await res.json();
        setEditSaving(false);
        setToast("Hata: " + (error || "Bilinmeyen hata"));
        setTimeout(() => setToast(""), 4000);
        return;
      }
    }

    // Listeyi yenile
    const { data } = await supabase
      .from("personnel")
      .select("id, auth_id, full_name, email, role, status, avatar_url, phone, location, location_id, position, security_code")
      .eq("department_id", personnel!.department_id)
      .order("full_name");
    setPeople((data || []) as Person[]);
    setEditSaving(false);
    setEditPerson(null);
    setToast("Personel güncellendi!");
    setTimeout(() => setToast(""), 3000);
  }

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatarFor, setUploadingAvatarFor] = useState<string | null>(null);

  function triggerAvatarUpload(personId: string) {
    setUploadingAvatarFor(personId);
    avatarInputRef.current?.click();
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadingAvatarFor) { setUploadingAvatarFor(null); return; }
    if (!file.type.startsWith("image/")) { setUploadingAvatarFor(null); return; }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("personnelId", uploadingAvatarFor);

    const res = await fetch("/api/upload-avatar", { method: "POST", body: fd });
    const json = await res.json();

    if (!res.ok) {
      setToast("Yükleme hatası: " + (json.error ?? ""));
      setTimeout(() => setToast(""), 3000);
      setUploadingAvatarFor(null);
      return;
    }

    const avatar_url = json.avatar_url;
    setPeople(prev => prev.map(p => p.id === uploadingAvatarFor ? { ...p, avatar_url } : p));
    setUploadingAvatarFor(null);
    setToast("Fotoğraf güncellendi!");
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    if (!personnel) return;
    supabase
      .from("personnel")
      .select("id, auth_id, full_name, email, role, status, avatar_url, phone, location, location_id, position, security_code")
      .eq("department_id", personnel.department_id)
      .order("full_name")
      .then(({ data }) => setPeople((data || []) as Person[]));
    supabase
      .from("locations")
      .select("id, name")
      .or(`department_id.is.null,department_id.eq.${personnel.department_id}`)
      .order("name")
      .then(({ data }) => setLocations((data || []) as Location[]));
  }, [personnel]);

  const isFiltering = search.trim() !== "" || filterLocationId !== "all";

  const activeFiltered = people.filter(
    (p) =>
      p.status !== "archived" &&
      (filterLocationId === "all" || filterLocationId === "none"
        ? filterLocationId === "none" ? !p.location_id : true
        : p.location_id === filterLocationId) &&
      (p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email?.toLowerCase().includes(search.toLowerCase()))
  );

  // Gruplu görünüm için: lokasyona göre grupla
  const locationGroups: { locId: string | null; locName: string; members: Person[] }[] = [];
  const activePeople = people.filter(p => p.status !== "archived");
  const orderedLocs = [
    ...locations,
    { id: null as unknown as string, name: "Lokasyon Atanmamış" },
  ];
  for (const loc of orderedLocs) {
    const members = activePeople.filter(p =>
      loc.id === null ? !p.location_id : p.location_id === loc.id
    );
    if (members.length > 0) locationGroups.push({ locId: loc.id ?? null, locName: loc.name, members });
  }

  const archived = people.filter((p) => p.status === "archived");

  async function updateStatus(id: string, status: string) {
    if (!isAdmin) return;
    await supabase.from("personnel").update({ status }).eq("id", id);
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  async function updateLocationId(personId: string, locId: string | null) {
    if (!isAdmin) return;
    setUpdatingLocId(personId);
    await supabase.from("personnel").update({ location_id: locId || null }).eq("id", personId);
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, location_id: locId } : p)));
    setUpdatingLocId(null);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, photoFile: file, photoPreview: ev.target?.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleAdd() {
    if (!isAdmin || !form.full_name || !personnel) return;
    if (!form.phone || form.phone.length < 10) { setToast("Geçerli telefon numarası giriniz"); setTimeout(() => setToast(""), 3000); return; }
    if (!form.password || form.password.length < 6) { setToast("Şifre en az 6 karakter olmalı"); setTimeout(() => setToast(""), 3000); return; }
    if (form.password !== form.confirmPassword) { setToast("Şifreler eşleşmiyor"); setTimeout(() => setToast(""), 3000); return; }
    setSaving(true);

    const posObj = POSITIONS.find((p) => p.value === form.position);
    const role = posObj?.role ?? "personel";

    let avatar_url: string | null = null;
    if (form.photoFile) {
      const ext = form.photoFile.name.split(".").pop();
      const path = `personnel/${Date.now()}.${ext}`;
      const { data: up } = await supabase.storage.from("avatars").upload(path, form.photoFile, { upsert: true });
      if (up) avatar_url = supabase.storage.from("avatars").getPublicUrl(up.path).data.publicUrl;
    }

    const res = await fetch("/api/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: form.phone,
        password: form.password,
        full_name: form.full_name,
        position: form.position,
        location_id: form.location_id || null,
        department_id: personnel.department_id,
        role,
        avatar_url,
        security_code: form.security_code || null,
      }),
    });

    const result = await res.json();
    setSaving(false);

    if (!res.ok) {
      setToast("Hata: " + result.error);
      setTimeout(() => setToast(""), 4000);
      return;
    }

    const { data } = await supabase
      .from("personnel")
      .select("id, auth_id, full_name, email, role, status, avatar_url, phone, location, location_id, position, security_code")
      .eq("department_id", personnel.department_id)
      .order("full_name");
    setPeople((data || []) as Person[]);
    setForm({ ...emptyForm, location_id: "", position: POSITIONS[0]?.value ?? "" });
    setModalOpen(false);
    setToast("Personel başarıyla eklendi!");
    setTimeout(() => setToast(""), 3000);
  }


  const isAdmin = personnel?.role === "admin" || personnel?.role === "supervisor";

  return (
    <div className="bg-background min-h-screen pb-32">
      <header className="sticky top-0 z-40 bg-surface-container-low shadow-sm">
        <div className="flex items-center justify-between px-lg py-md">
          <h1 className="font-display text-headline-lg-mobile text-primary font-bold">Personel</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => { setForm((f) => ({ ...f, position: f.position || POSITIONS[0]?.value || "" })); setModalOpen(true); }}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-primary text-on-primary shadow-sm active:scale-90 transition-all"
                title="Yeni Personel Ekle"
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 600" }}>add</span>
              </button>
            )}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm active:scale-90 transition-all"
                title="Profil"
              >
                {personnel?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-800 truncate">{personnel?.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{personnel?.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Çıkış Yap
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Filtre Bottom Sheet */}
      {filterOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setFilterOpen(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-2xl shadow-2xl max-h-[75vh] flex flex-col">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-2 flex-shrink-0" />
            <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <p className="font-bold text-gray-800">Lokasyona Göre Filtrele</p>
              {filterLocationId !== "all" && (
                <button onClick={() => { setFilterLocationId("all"); setFilterOpen(false); }}
                  className="text-xs text-red-500 font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                  Temizle
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 py-2">
              {[
                { id: "all", name: "Tümü", count: people.filter(p => p.status !== "archived").length },
                { id: "none", name: "Lokasyon Atanmamış", count: people.filter(p => p.status !== "archived" && !p.location_id).length },
                ...locations.map(l => ({ ...l, count: people.filter(p => p.status !== "archived" && p.location_id === l.id).length })),
              ].map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => { setFilterLocationId(loc.id); setFilterOpen(false); }}
                  className={`w-full flex items-center justify-between px-5 py-3.5 active:bg-gray-50 transition-colors ${filterLocationId === loc.id ? "bg-indigo-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${filterLocationId === loc.id ? "border-primary bg-primary" : "border-gray-300"}`}>
                      {filterLocationId === loc.id && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                    </div>
                    <span className={`text-sm font-semibold text-left ${filterLocationId === loc.id ? "text-primary" : "text-gray-700"}`}>{loc.name}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${filterLocationId === loc.id ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}`}>
                    {loc.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="pt-lg space-y-md">
        {/* Arama + Filtre */}
        <div className="px-lg flex gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline" style={{ fontSize: "20px" }}>search</span>
            <input
              className="w-full pl-12 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              placeholder="Personel ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border transition-all active:scale-95 relative ${
              filterLocationId !== "all"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-gray-500 border-gray-200"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">filter_list</span>
            {filterLocationId !== "all" && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Aktif filtre etiketi */}
        {filterLocationId !== "all" && (
          <div className="px-lg">
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-primary text-[16px]">location_on</span>
              <span className="text-xs font-semibold text-primary flex-1 truncate">
                {filterLocationId === "none" ? "Lokasyon Atanmamış" : locations.find(l => l.id === filterLocationId)?.name}
              </span>
              <button onClick={() => setFilterLocationId("all")} className="text-gray-400 hover:text-red-500 transition-colors">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Sonuç sayısı */}
        <div className="px-lg">
          <p className="text-xs text-gray-400 font-semibold">
            {isFiltering ? `${activeFiltered.length} sonuç` : `${people.filter(p => p.status !== "archived").length} personel · ${locationGroups.length} lokasyon`}
          </p>
        </div>

        {/* Personel Listesi — filtreleme varsa düz, yoksa gruplu */}
        {isFiltering ? (
          <div className="space-y-md px-lg">
            {activeFiltered.length === 0 ? (
              <p className="text-center text-on-surface-variant py-xxl">Personel bulunamadı</p>
            ) : (
              activeFiltered.map((p) => <PersonCard key={p.id} p={p} locations={locations} isAdmin={isAdmin} updatingLocId={updatingLocId} updateLocationId={updateLocationId} openEdit={openEdit} updateStatus={updateStatus} showLocation onAvatarClick={() => triggerAvatarUpload(p.id)} uploadingAvatar={uploadingAvatarFor === p.id} />)
            )}
          </div>
        ) : (
          <div className="space-y-xs">
            {locationGroups.map((group) => {
              const key = group.locId ?? "__none__";
              const isOpen = expandedGroups.has(key);
              const toggle = () => setExpandedGroups(prev => {
                const next = new Set(prev);
                if (isOpen) next.delete(key); else next.add(key);
                return next;
              });
              const isUnassigned = group.locId === null;
              return (
                <div key={key}>
                  {/* Grup başlığı */}
                  <button
                    onClick={toggle}
                    className={`w-full flex items-center justify-between px-lg py-3 transition-colors active:bg-gray-100 ${isOpen ? "bg-indigo-50" : "bg-white"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUnassigned ? "bg-gray-100" : "bg-indigo-100"}`}>
                        <span className={`material-symbols-outlined text-[18px] ${isUnassigned ? "text-gray-400" : "text-indigo-600"}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                          {isUnassigned ? "help" : "location_on"}
                        </span>
                      </div>
                      <span className={`font-semibold text-sm truncate ${isOpen ? "text-primary" : "text-gray-800"}`}>{group.locName}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isOpen ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}`}>
                        {group.members.length}
                      </span>
                      <span className={`material-symbols-outlined text-[20px] ${isOpen ? "text-primary" : "text-gray-400"}`}>
                        {isOpen ? "expand_less" : "expand_more"}
                      </span>
                    </div>
                  </button>

                  {/* Üyeler */}
                  {isOpen && (
                    <div className="space-y-md px-lg pb-md bg-gray-50 border-b border-gray-100">
                      <div className="pt-md space-y-md">
                        {group.members.map((p) => (
                          <PersonCard key={p.id} p={p} locations={locations} isAdmin={isAdmin} updatingLocId={updatingLocId} updateLocationId={updateLocationId} openEdit={openEdit} updateStatus={updateStatus} showLocation={false} onAvatarClick={() => triggerAvatarUpload(p.id)} uploadingAvatar={uploadingAvatarFor === p.id} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Arşiv Bölümü */}
        {archived.length > 0 && (
          <div className="mt-lg px-lg">
            <button
              onClick={() => setArchiveOpen((v) => !v)}
              className="w-full flex items-center justify-between px-md py-sm bg-surface-container-low rounded-xl border border-outline-variant active:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-[20px]">inventory_2</span>
                <span className="font-semibold text-on-surface-variant text-sm">Arşiv</span>
                <span className="bg-surface-container-highest text-on-surface-variant text-xs font-bold px-2 py-0.5 rounded-full">
                  {archived.length}
                </span>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                {archiveOpen ? "expand_less" : "expand_more"}
              </span>
            </button>

            {archiveOpen && (
              <div className="space-y-md mt-md">
                {archived.map((p) => (
                  <div key={p.id} className="bg-surface-container-lowest p-md rounded-xl shadow-sm border border-outline-variant flex flex-col gap-md opacity-60 grayscale">
                    <div className="flex items-center gap-md">
                      <div className="w-14 h-14 rounded-full bg-surface-container-high flex-shrink-0 overflow-hidden">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt={p.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-bold text-lg">
                            {getInitials(p.full_name)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-on-surface-variant text-[16px] truncate line-through">{p.full_name}</h3>
                        <p className="text-label-sm font-label-sm text-outline">
                          {getPositionLabel(p.position) || roleLabel[p.role] || p.role}
                        </p>
                        {p.location && (
                          <p className="text-label-sm font-label-sm text-outline flex items-center gap-xs mt-0.5">
                            <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>location_on</span>
                            {p.location}
                          </p>
                        )}
                      </div>
                      <span className="px-3 py-1 rounded-full text-label-sm font-label-sm bg-surface-container-highest text-on-surface-variant flex-shrink-0">
                        Arşiv
                      </span>
                    </div>
                    {isAdmin && (
                      <button
                        className="w-full py-2.5 rounded-full text-label-md font-label-md bg-surface-container-low text-on-surface-variant hover:bg-primary hover:text-on-primary active:scale-95 transition-all flex items-center justify-center gap-xs"
                        onClick={() => updateStatus(p.id, "active")}
                      >
                        <span className="material-symbols-outlined text-[16px]">unarchive</span>
                        Arşivden Çıkar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>


      {/* Düzenleme Modalı */}
      {editPerson && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditPerson(null)} />
          <div className="relative w-full max-w-[430px] bg-surface-container-lowest rounded-t-xl shadow-2xl max-h-[92vh] flex flex-col">
            <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mt-lg mb-md flex-shrink-0" />
            <div className="flex justify-between items-center px-lg mb-md flex-shrink-0">
              <div>
                <h2 className="font-headline-md text-headline-lg-mobile text-on-surface">Personel Düzenle</h2>
                <p className="text-label-sm text-on-surface-variant">{editPerson.full_name}</p>
              </div>
              <button
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all"
                onClick={() => setEditPerson(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="overflow-y-auto px-lg pb-lg space-y-lg" onSubmit={(e) => { e.preventDefault(); handleEdit(); }}>

              {/* İsim Soyisim */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">İsim Soyisim</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">badge</span>
                  <input
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="Ahmet Yılmaz"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: toTitleCase(e.target.value) })}
                    required
                  />
                </div>
              </div>

              {/* Telefon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Telefon Numarası</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">phone</span>
                  <input
                    type="tel"
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="05321234567"
                    maxLength={11}
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\s/g, "").slice(0, 11) })}
                  />
                </div>
                {editForm.phone && editForm.phone !== (editPerson.phone || "") && (
                  <p className="text-label-sm text-amber-600 ml-1 flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    Telefon değişirse giriş bilgisi de güncellenir
                  </p>
                )}
              </div>

              {/* Pozisyon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Pozisyon</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">work</span>
                  <select
                    className="w-full pl-12 pr-10 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                  >
                    <option value="">Pozisyon Seçiniz</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos.value} value={pos.value}>{pos.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Lokasyon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Lokasyon</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">location_on</span>
                  <select
                    className="w-full pl-12 pr-10 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={editForm.location_id}
                    onChange={(e) => setEditForm({ ...editForm, location_id: e.target.value })}
                  >
                    <option value="">Lokasyon Seçiniz</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Şifre Bölümü */}
              <div className="border-t border-outline-variant/30 pt-lg space-y-lg">
                <div className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-primary text-[20px]">lock_reset</span>
                  <p className="text-label-md font-semibold text-on-surface">Şifre Değiştir <span className="text-on-surface-variant font-normal">(isteğe bağlı)</span></p>
                </div>

                <div className="space-y-xs">
                  <label className="font-label-md text-label-md text-on-surface-variant ml-1">Yeni Şifre</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock</span>
                    <input
                      type={showEditPassword ? "text" : "password"}
                      className="w-full pl-12 pr-12 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                      placeholder="Boş bırakırsanız değişmez"
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    />
                    <button type="button" onClick={() => setShowEditPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[20px]">{showEditPassword ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>

                {editForm.password && (
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-on-surface-variant ml-1">Şifre Tekrar</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock_reset</span>
                      <input
                        type={showEditPassword ? "text" : "password"}
                        className={`w-full pl-12 pr-4 py-md bg-surface-container-low border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all ${editForm.confirmPassword && editForm.password !== editForm.confirmPassword ? "border-error" : "border-outline-variant"}`}
                        placeholder="Şifreyi tekrar girin"
                        value={editForm.confirmPassword}
                        onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                      />
                    </div>
                    {editForm.confirmPassword && editForm.password !== editForm.confirmPassword && (
                      <p className="text-error text-label-sm ml-1 flex items-center gap-xs">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        Şifreler eşleşmiyor
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-xs">
                  <label className="font-label-md text-label-md text-on-surface-variant ml-1">Güvenlik Kodu <span className="font-normal">(şifre sıfırlama için, isteğe bağlı)</span></label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">password</span>
                    <input
                      type="text"
                      className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                      placeholder="Örn: 4-6 haneli kod"
                      value={editForm.security_code}
                      onChange={(e) => setEditForm({ ...editForm, security_code: e.target.value })}
                    />
                  </div>
                </div>

                {!editPerson.auth_id && (
                  <div className="flex items-start gap-sm p-sm bg-blue-50 border border-blue-200 rounded-xl">
                    <span className="material-symbols-outlined text-blue-600 text-[18px] flex-shrink-0 mt-0.5">info</span>
                    <p className="text-label-sm font-label-sm text-blue-700">Bu personelin henüz giriş hesabı yok. Telefon numarası ve şifre girerseniz hesap otomatik oluşturulur.</p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={editSaving}
                className="w-full bg-primary text-on-primary py-md rounded-full font-label-md text-label-md shadow-md active:scale-95 transition-transform flex items-center justify-center gap-sm disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {editSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-[430px] bg-surface-container-lowest rounded-t-xl shadow-2xl max-h-[92vh] flex flex-col">
            {/* Handle */}
            <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mt-lg mb-md flex-shrink-0" />
            {/* Başlık */}
            <div className="flex justify-between items-center px-lg mb-md flex-shrink-0">
              <h2 className="font-headline-md text-headline-lg-mobile text-on-surface">Yeni Personel Ekle</h2>
              <button
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all"
                onClick={() => setModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Kaydırılabilir form */}
            <form className="overflow-y-auto px-lg pb-lg space-y-lg" onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>

              {/* Fotoğraf */}
              <div className="flex flex-col items-center gap-sm pt-xs">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-surface-container-low border-2 border-dashed border-outline-variant overflow-hidden flex items-center justify-center">
                    {form.photoPreview ? (
                      <img src={form.photoPreview} alt="önizleme" className="w-full h-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-outline text-[36px]">person</span>
                    )}
                  </div>
                  {form.photoPreview && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photoFile: null, photoPreview: "" }))}
                      className="absolute -top-1 -right-1 w-6 h-6 bg-error text-on-error rounded-full flex items-center justify-center shadow"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
                <div className="flex gap-sm">
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex items-center gap-xs px-md py-sm bg-surface-container-low border border-outline-variant rounded-full text-label-sm font-label-sm text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                    Kamera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-xs px-md py-sm bg-surface-container-low border border-outline-variant rounded-full text-label-sm font-label-sm text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    Dosya
                  </button>
                </div>
                <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoChange} />
                <input ref={fileRef}   type="file" accept="image/*"               className="hidden" onChange={handlePhotoChange} />
              </div>

              {/* İsim Soyisim */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">İsim Soyisim</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">badge</span>
                  <input
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="Ahmet Yılmaz"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: toTitleCase(e.target.value) })}
                    required
                  />
                </div>
              </div>

              {/* Telefon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Telefon Numarası</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">phone</span>
                  <input
                    type="tel"
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="05321234567"
                    maxLength={11}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\s/g, "").slice(0, 11) })}
                  />
                </div>
              </div>

              {/* Şifre */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Giriş Şifresi</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full pl-12 pr-12 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="En az 6 karakter"
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
              </div>

              {/* Şifre Tekrar */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Şifre Tekrar</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">lock_reset</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className={`w-full pl-12 pr-4 py-md bg-surface-container-low border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all ${form.confirmPassword && form.password !== form.confirmPassword ? "border-error" : "border-outline-variant"}`}
                    placeholder="Şifreyi tekrar girin"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    required
                  />
                </div>
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-error text-label-sm ml-1 flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    Şifreler eşleşmiyor
                  </p>
                )}
              </div>

              {/* Güvenlik Kodu */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Güvenlik Kodu <span className="font-normal">(isteğe bağlı, şifre sıfırlama için)</span></label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">password</span>
                  <input
                    type="text"
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="Örn: 4-6 haneli kod"
                    value={form.security_code}
                    onChange={(e) => setForm({ ...form, security_code: e.target.value })}
                  />
                </div>
              </div>

              {/* Giriş Bilgisi */}
              <div className="flex items-start gap-sm p-sm bg-primary/5 border border-primary/20 rounded-xl">
                <span className="material-symbols-outlined text-primary text-[18px] flex-shrink-0 mt-0.5">info</span>
                <p className="text-label-sm font-label-sm text-primary">
                  Personel <strong>{form.phone || "telefon no"}</strong> numarası ve belirlediğiniz şifreyle giriş yapacak.
                </p>
              </div>

              {/* Lokasyon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Lokasyon</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">location_on</span>
                  <select
                    className="w-full pl-12 pr-10 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={form.location_id || ""}
                    onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  >
                    <option value="">Lokasyon Seçiniz</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
              </div>

              {/* Pozisyon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Pozisyon</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">work</span>
                  <select
                    className="w-full pl-12 pr-10 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  >
                    {POSITIONS.map((pos) => (
                      <option key={pos.value} value={pos.value}>{pos.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">expand_more</span>
                </div>
                {POSITIONS.find((p) => p.value === form.position)?.role === "supervisor" && (
                  <p className="text-label-sm font-label-sm text-primary ml-1 flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    Bu pozisyon yönetici rolü alır
                  </p>
                )}
                {POSITIONS.find((p) => p.value === form.position)?.role === "admin" && (
                  <p className="text-label-sm font-label-sm text-primary ml-1 flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    Bu pozisyon tam yönetici (admin) rolü alır
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-primary text-on-primary py-md rounded-full font-label-md text-label-md shadow-md active:scale-95 transition-transform flex items-center justify-center gap-sm disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">person_add</span>
                {saving ? "Kaydediliyor..." : "Personel Ekle"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Avatar upload input */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] max-w-[380px] w-full px-4">
          <div className="bg-on-secondary-container text-on-secondary flex items-center gap-sm px-lg py-md rounded-full shadow-lg">
            <span className="material-symbols-outlined text-secondary-container">check_circle</span>
            <span className="font-label-md text-label-md">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
