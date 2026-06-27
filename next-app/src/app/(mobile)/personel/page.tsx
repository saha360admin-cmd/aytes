"use client";

import { useEffect, useRef, useState } from "react";
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

const LOCATIONS = [
  "Genel Müdürlük",
  "Beykoz Operasyon Merkezi",
  "Yunus Eğitim Merkezi",
  "Tuzla-Pendik Operasyon Merkezi (Tavşantepe)",
  "Marmara (Kartal) Dağıtım Op. Bölge Md.lüğü",
  "Üsküdar Operasyon Merkezi",
  "Kurtköy Operasyon Merkezi",
  "Kadıköy Operasyon Merkezi",
  "Karadeniz (Sancaktepe) Dağıtım Op. Bölge Md.",
  "Erenköy Operasyon Merkezi",
  "Şile Ova İndiricı Merkezi",
  "Vaniköy Operasyon Merkezi",
  "SCADA Operasyon Kontrol Merkezi",
  "Ümraniye Operasyon Merkezi",
  "Ataşehir Trafo Merkezi",
  "Şile Merkez Operasyon Müdürlüğü",
  "Pendik LHM",
  "İstanbul Anadolu Yakası Elektrik Dağıtım Dudullu",
];

const POSITIONS = [
  { value: "guvenlik-gorevlisi",  label: "Güvenlik Görevlisi",       role: "personel" },
  { value: "cctv-sorumlusu",      label: "CCTV Güvenlik",            role: "personel" },
  { value: "sabit-guvenlik",      label: "Sabit Güvenlik",           role: "personel" },
  { value: "guvenlik-sorumlusu",  label: "Güvenlik Sorumlusu",       role: "supervisor" },
];

interface Person {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  avatar_url: string | null;
  phone: string | null;
  location: string | null;
  position: string | null;
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
  position: "guvenlik-gorevlisi",
  location: "",
  photoFile: null as File | null,
  photoPreview: "",
};

export default function PersonelPage() {
  const { personnel } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!personnel) return;
    supabase
      .from("personnel")
      .select("id, full_name, email, role, status, avatar_url, phone, location, position")
      .eq("department_id", personnel.department_id)
      .order("full_name")
      .then(({ data }) => setPeople(data || []));
  }, [personnel]);

  const activeFiltered = people.filter(
    (p) =>
      p.status !== "archived" &&
      (p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email?.toLowerCase().includes(search.toLowerCase()))
  );

  const archived = people.filter((p) => p.status === "archived");

  async function updateStatus(id: string, status: string) {
    await supabase.from("personnel").update({ status }).eq("id", id);
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, photoFile: file, photoPreview: ev.target?.result as string }));
    reader.readAsDataURL(file);
  }

  async function handleAdd() {
    if (!form.full_name || !personnel) return;
    setSaving(true);

    const posObj = POSITIONS.find((p) => p.value === form.position);
    const role = posObj?.role ?? "personel";

    let avatar_url: string | null = null;
    if (form.photoFile) {
      const ext = form.photoFile.name.split(".").pop();
      const path = `personnel/${Date.now()}.${ext}`;
      const { data: up } = await supabase.storage.from("avatars").upload(path, form.photoFile, { upsert: true });
      if (up) {
        avatar_url = supabase.storage.from("avatars").getPublicUrl(up.path).data.publicUrl;
      }
    }

    const { error } = await supabase.from("personnel").insert({
      full_name: form.full_name,
      phone: form.phone,
      position: form.position,
      location: form.location || null,
      role,
      department_id: personnel.department_id,
      status: "active",
      auth_id: null,
      ...(avatar_url ? { avatar_url } : {}),
    });

    setSaving(false);
    if (!error) {
      const { data } = await supabase
        .from("personnel")
        .select("id, full_name, email, role, status, avatar_url, phone, location, position")
        .eq("department_id", personnel.department_id)
        .order("full_name");
      setPeople(data || []);
      setForm(emptyForm);
      setModalOpen(false);
      setToast("Personel başarıyla eklendi!");
      setTimeout(() => setToast(""), 3000);
    }
  }

  function getInitials(name: string) {
    return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  }

  function getPositionLabel(pos: string | null) {
    return POSITIONS.find((p) => p.value === pos)?.label ?? null;
  }

  const isAdmin = personnel?.role === "admin" || personnel?.role === "supervisor";

  return (
    <div className="bg-background min-h-screen pb-32">
      <header className="sticky top-0 z-40 bg-surface-container-low shadow-sm">
        <div className="flex items-center justify-between px-lg py-md">
          <h1 className="font-display text-headline-lg-mobile text-primary font-bold">Personel</h1>
          <span className="text-label-sm font-label-sm text-on-surface-variant">
            {personnel?.departments?.name}
          </span>
        </div>
      </header>

      <main className="px-lg pt-lg space-y-lg">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline" style={{ fontSize: "20px" }}>search</span>
          <input
            className="w-full pl-12 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            placeholder="Personel ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Aktif Personel Listesi */}
        <div className="space-y-md">
          {activeFiltered.length === 0 ? (
            <p className="text-center text-on-surface-variant py-xxl">Personel bulunamadı</p>
          ) : (
            activeFiltered.map((p) => {
              const isActive = p.status === "active";
              return (
                <div key={p.id} className={`bg-surface-container-lowest p-md rounded-xl shadow-sm border border-outline-variant flex flex-col gap-md ${!isActive ? "opacity-75" : ""}`}>
                  <div className="flex items-center gap-md">
                    <div className="w-14 h-14 rounded-full bg-primary-fixed flex-shrink-0 overflow-hidden">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={p.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-primary font-bold text-lg">
                          {getInitials(p.full_name)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-on-surface text-[16px] truncate">{p.full_name}</h3>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">
                        {getPositionLabel(p.position) || roleLabel[p.role] || p.role}
                      </p>
                      {p.location && (
                        <p className="text-label-sm font-label-sm text-outline flex items-center gap-xs mt-0.5">
                          <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>location_on</span>
                          {p.location}
                        </p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-label-sm font-label-sm flex-shrink-0 ${
                      isActive ? "bg-secondary-container text-on-secondary-container"
                      : p.status === "on_leave" ? "bg-tertiary-fixed text-on-tertiary-fixed"
                      : "bg-surface-container-highest text-on-surface-variant"
                    }`}>
                      {statusLabel[p.status] || p.status}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-sm pt-xs">
                      <button
                        className={`flex-1 py-2.5 rounded-full text-label-md font-label-md active:scale-95 transition-all ${
                          isActive
                            ? "bg-surface-container-highest text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                            : "bg-primary text-on-primary"
                        }`}
                        onClick={() => updateStatus(p.id, isActive ? "inactive" : "active")}
                      >
                        {isActive ? "Yetkiyi Kapat" : "Yetkiyi Aç"}
                      </button>
                      <button
                        className="flex-1 bg-surface-container-low text-on-surface-variant py-2.5 rounded-full text-label-md font-label-md hover:bg-error-container hover:text-on-error-container active:scale-95 transition-all flex items-center justify-center gap-xs"
                        onClick={() => updateStatus(p.id, "archived")}
                      >
                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                        Arşiv Ekle
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Arşiv Bölümü */}
        {archived.length > 0 && (
          <div className="mt-lg">
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

      {/* FAB */}
      {isAdmin && (
        <button
          className="fixed bottom-28 right-6 bg-primary text-on-primary w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all z-40"
          onClick={() => setModalOpen(true)}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'wght' 600" }}>add</span>
        </button>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="absolute bottom-0 w-full bg-surface-container-lowest rounded-t-xl shadow-2xl max-h-[92vh] flex flex-col">
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

              {/* Lokasyon */}
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">Lokasyon</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">location_on</span>
                  <select
                    className="w-full pl-12 pr-10 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  >
                    <option value="">Lokasyon Seçiniz</option>
                    {LOCATIONS.map((loc) => (
                      <option key={loc} value={loc}>{loc}</option>
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
                {form.position === "guvenlik-sorumlusu" && (
                  <p className="text-label-sm font-label-sm text-primary ml-1 flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    Bu pozisyon yönetici rolü alır
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100]">
          <div className="bg-on-secondary-container text-on-secondary flex items-center gap-sm px-lg py-md rounded-full shadow-lg">
            <span className="material-symbols-outlined text-secondary-container">check_circle</span>
            <span className="font-label-md text-label-md">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
