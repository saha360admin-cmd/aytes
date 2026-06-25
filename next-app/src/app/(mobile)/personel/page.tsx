"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

function toTitleCase(value: string) {
  return value
    .split(" ")
    .map((word, i) => {
      if (word.length === 0) return word;
      // Sadece ilk harf büyük, geri kalanı olduğu gibi bırak
      const first = word[0];
      const upper = first === "i" ? "İ" : first === "ı" ? "I" : first.toLocaleUpperCase("tr-TR");
      return upper + word.slice(1);
    })
    .join(" ");
}

interface Person {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
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
};

export default function PersonelPage() {
  const { personnel } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", role: "personel" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!personnel) return;
    supabase
      .from("personnel")
      .select("id, full_name, email, role, status")
      .eq("department_id", personnel.department_id)
      .order("full_name")
      .then(({ data }) => setPeople(data || []));
  }, [personnel]);

  const filtered = people.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  async function updateStatus(id: string, status: string) {
    await supabase.from("personnel").update({ status }).eq("id", id);
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  async function handleAdd() {
    if (!form.full_name || !personnel) return;
    setSaving(true);
    const { error } = await supabase.from("personnel").insert({
      full_name: form.full_name,
      phone: form.phone,
      role: form.role,
      department_id: personnel.department_id,
      status: "active",
      auth_id: "00000000-0000-0000-0000-000000000000",
    });
    setSaving(false);
    if (!error) {
      const { data } = await supabase
        .from("personnel")
        .select("id, full_name, email, role, status")
        .eq("department_id", personnel.department_id)
        .order("full_name");
      setPeople(data || []);
      setForm({ full_name: "", phone: "", role: "personel" });
      setModalOpen(false);
      setToast("Personel başarıyla eklendi!");
      setTimeout(() => setToast(""), 3000);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
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
        {/* Arama */}
        <div className="relative">
          <span
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline"
            style={{ fontSize: "20px" }}
          >
            search
          </span>
          <input
            className="w-full pl-12 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-body-md placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            placeholder="Personel ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Personel listesi */}
        <div className="space-y-md">
          {filtered.length === 0 ? (
            <p className="text-center text-on-surface-variant py-xxl">Personel bulunamadı</p>
          ) : (
            filtered.map((p) => {
              const isActive = p.status === "active";
              return (
                <div
                  key={p.id}
                  className={`bg-surface-container-lowest p-md rounded-xl shadow-sm border border-outline-variant flex flex-col gap-md ${
                    !isActive ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-center gap-md">
                    <div className="w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                      {!isActive && (
                        <span className="grayscale">{getInitials(p.full_name)}</span>
                      )}
                      {isActive && getInitials(p.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-on-surface text-[16px] truncate">
                        {p.full_name}
                      </h3>
                      <p className="text-label-sm font-label-sm text-on-surface-variant">
                        {roleLabel[p.role] || p.role}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-label-sm font-label-sm flex-shrink-0 ${
                        isActive
                          ? "bg-secondary-container text-on-secondary-container"
                          : p.status === "on_leave"
                          ? "bg-tertiary-fixed text-on-tertiary-fixed"
                          : "bg-surface-container-highest text-on-surface-variant"
                      }`}
                    >
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
                        className="flex-1 bg-surface-container-low text-on-surface-variant py-2.5 rounded-full text-label-md font-label-md hover:bg-surface-container-high active:scale-95 transition-all"
                        onClick={() => updateStatus(p.id, "on_leave")}
                      >
                        İzne Al
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* FAB */}
      {isAdmin && (
        <button
          className="fixed bottom-28 right-6 bg-primary text-on-primary w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all z-40"
          onClick={() => setModalOpen(true)}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'wght' 600" }}
          >
            add
          </span>
        </button>
      )}

      {/* Yeni Personel Ekle Modalı */}
      {modalOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="absolute bottom-0 w-full bg-surface-container-lowest rounded-t-xl shadow-2xl">
            <div className="w-12 h-1.5 bg-outline-variant rounded-full mx-auto mt-lg mb-md" />
            <div className="flex justify-between items-center px-lg mb-lg">
              <h2 className="font-headline-md text-headline-lg-mobile text-on-surface">
                Yeni Personel Ekle
              </h2>
              <button
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all"
                onClick={() => setModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form className="px-lg pb-lg space-y-lg" onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">
                  İsim Soyisim
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                    badge
                  </span>
                  <input
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="Ahmet Yılmaz"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: toTitleCase(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">
                  Telefon Numarası
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                    phone
                  </span>
                  <input
                    type="tel"
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    placeholder="05__ ___ __ __"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-md text-label-md text-on-surface-variant ml-1">
                  Rol
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
                    manage_accounts
                  </span>
                  <select
                    className="w-full pl-12 pr-4 py-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all appearance-none"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    <option value="personel">Personel</option>
                    <option value="supervisor">Süpervizör</option>
                    <option value="admin">Yönetici</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>

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
