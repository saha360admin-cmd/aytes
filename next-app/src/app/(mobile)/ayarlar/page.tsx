"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const roleLabel: Record<string, string> = { admin: "Yönetici", supervisor: "Güvenlik Sorumlusu", personel: "Güvenlik Personeli" };
const roleBadge: Record<string, string> = { admin: "bg-indigo-100 text-indigo-700", supervisor: "bg-purple-100 text-purple-700", personel: "bg-teal-100 text-teal-700" };

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default function AyarlarPage() {
  const { personnel, signOut } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState(personnel?.full_name || "");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Şifre değiştirme
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  if (!personnel) return null;

  const avatarUrl = avatarPreview || (personnel as any).avatar_url || null;

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadAvatar(): Promise<string | null> {
    if (!avatarFile || !personnel) return null;
    const ext = avatarFile.name.split(".").pop();
    const path = `personnel/${personnel.id}.${ext}`;
    const { data: up } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
    if (!up) return null;
    return supabase.storage.from("avatars").getPublicUrl(up.path).data.publicUrl;
  }

  async function handleSave() {
    if (!personnel || !fullName.trim()) return;
    setSaving(true);
    let avatar_url: string | null = null;
    if (avatarFile) {
      setUploadingAvatar(true);
      avatar_url = await uploadAvatar();
      setUploadingAvatar(false);
    }
    const updates: Record<string, string> = { full_name: fullName.trim() };
    if (phone.trim()) updates.phone = phone.trim();
    if (avatar_url) updates.avatar_url = avatar_url;

    const { error } = await supabase.from("personnel").update(updates).eq("id", personnel.id);
    setSaving(false);
    if (!error) {
      setSaveToast("Profil güncellendi!");
      setEditMode(false);
      setAvatarFile(null);
      setTimeout(() => setSaveToast(null), 3000);
    } else {
      setSaveToast("Hata: " + error.message);
      setTimeout(() => setSaveToast(null), 4000);
    }
  }

  async function handlePasswordChange() {
    if (!newPw || newPw !== newPwConfirm) {
      setSaveToast("Şifreler eşleşmiyor!");
      setTimeout(() => setSaveToast(null), 3000);
      return;
    }
    if (newPw.length < 6) {
      setSaveToast("Şifre en az 6 karakter olmalı!");
      setTimeout(() => setSaveToast(null), 3000);
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSaving(false);
    if (!error) {
      setSaveToast("Şifre başarıyla değiştirildi!");
      setShowPwForm(false);
      setNewPw(""); setNewPwConfirm("");
      setTimeout(() => setSaveToast(null), 3000);
    } else {
      setSaveToast("Hata: " + error.message);
      setTimeout(() => setSaveToast(null), 4000);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">

      {/* Toast */}
      {saveToast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-bold text-white max-w-[380px] w-max ${saveToast.startsWith("Hata") || saveToast.startsWith("Şifreler") || saveToast.startsWith("Şifre en") ? "bg-red-600" : "bg-emerald-600"}`}>
          <span className="material-symbols-outlined text-[18px]">{saveToast.startsWith("Hata") || saveToast.startsWith("Şifreler") ? "error" : "check_circle"}</span>
          {saveToast}
        </div>
      )}

      {/* Çıkış Onay Modalı */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOutConfirm(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-[24px]">logout</span>
              </div>
              <div>
                <p className="font-bold text-gray-800">Çıkış Yap</p>
                <p className="text-sm text-gray-500">Hesabınızdan çıkış yapmak istediğinize emin misiniz?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm active:scale-95 transition-all">
                İptal
              </button>
              <button onClick={handleSignOut}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm active:scale-95 transition-all">
                Çıkış Yap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 w-full h-16 flex items-center justify-between px-4"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>manage_accounts</span>
          <h1 className="text-lg font-bold text-white">Profil & Ayarlar</h1>
        </div>
        {!editMode ? (
          <button onClick={() => { setEditMode(true); setFullName(personnel.full_name); }}
            className="flex items-center gap-1.5 bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-white/30 active:scale-95 transition-all">
            <span className="material-symbols-outlined text-[16px]">edit</span>
            Düzenle
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditMode(false); setAvatarFile(null); setAvatarPreview(null); }}
              className="bg-white/15 text-white text-xs font-bold px-3 py-1.5 rounded-full active:scale-95 transition-all">
              İptal
            </button>
            <button onClick={handleSave} disabled={saving}
              className="bg-white text-[#1A237E] text-xs font-bold px-3 py-1.5 rounded-full active:scale-95 transition-all disabled:opacity-60 flex items-center gap-1">
              {saving ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span> : <span className="material-symbols-outlined text-[14px]">check</span>}
              Kaydet
            </button>
          </div>
        )}
      </header>

      {/* Profil bandı */}
      <div className="pb-8 pt-5 flex flex-col items-center gap-3"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        {/* Avatar */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/30 bg-white/20 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={personnel.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-3xl">{getInitials(personnel.full_name)}</span>
            )}
          </div>
          {editMode && (
            <button onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white text-[#1A237E] flex items-center justify-center shadow-lg active:scale-90 transition-all">
              {uploadingAvatar
                ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                : <span className="material-symbols-outlined text-[16px]">photo_camera</span>}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-xl">{personnel.full_name}</p>
          <p className="text-white/70 text-sm">{personnel.email}</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${roleBadge[personnel.role] || "bg-white/20 text-white"}`}>
          {roleLabel[personnel.role] || personnel.role}
        </span>
      </div>
      <div className="h-5 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-4 space-y-4">

        {/* Profil Bilgileri / Düzenleme */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3949AB] text-[20px]">person</span>
            <h2 className="font-bold text-gray-800">Profil Bilgileri</h2>
          </div>

          {!editMode ? (
            <div className="divide-y divide-gray-50">
              {[
                { icon: "badge", label: "Ad Soyad", value: personnel.full_name },
                { icon: "email", label: "E-posta", value: personnel.email },
                { icon: "business", label: "Departman", value: personnel.departments?.name || "—" },
                { icon: "shield_person", label: "Rol", value: roleLabel[personnel.role] || personnel.role },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#3949AB] text-[18px]">{item.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{item.label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400">Ad Soyad</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                  placeholder="Ad Soyad"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400">Telefon Numarası</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\s/g, "").slice(0, 11))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                  placeholder="05321234567"
                  maxLength={11}
                />
              </div>
              <div className="bg-indigo-50 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-gray-400">E-posta</p>
                <p className="text-sm font-semibold text-gray-500 mt-0.5">{personnel.email}</p>
                <p className="text-[10px] text-gray-400 mt-1">E-posta değiştirilemez</p>
              </div>
            </div>
          )}
        </section>

        {/* Güvenlik — Şifre Değiştir */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={() => setShowPwForm((v) => !v)}
            className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-amber-600 text-[18px]">lock</span>
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-gray-800 text-sm">Şifre Değiştir</p>
              <p className="text-xs text-gray-400">Hesap güvenliğinizi güncelleyin</p>
            </div>
            <span className="material-symbols-outlined text-gray-300">{showPwForm ? "expand_less" : "chevron_right"}</span>
          </button>

          {showPwForm && (
            <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400">Yeni Şifre</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#3949AB] focus:border-transparent outline-none"
                  placeholder="En az 6 karakter"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400">Yeni Şifre (Tekrar)</label>
                <input
                  type="password"
                  value={newPwConfirm}
                  onChange={(e) => setNewPwConfirm(e.target.value)}
                  className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:border-transparent outline-none ${newPwConfirm && newPw !== newPwConfirm ? "border-red-300 focus:ring-red-300" : "border-gray-200 focus:ring-[#3949AB]"}`}
                  placeholder="Şifreyi tekrar girin"
                />
                {newPwConfirm && newPw !== newPwConfirm && (
                  <p className="text-xs text-red-500 font-semibold">Şifreler eşleşmiyor</p>
                )}
              </div>
              <button
                onClick={handlePasswordChange}
                disabled={pwSaving || !newPw || newPw !== newPwConfirm}
                className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #6A1B9A, #8E24AA)" }}>
                {pwSaving ? <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span> : <span className="material-symbols-outlined text-[16px]">lock_reset</span>}
                {pwSaving ? "Güncelleniyor..." : "Şifreyi Güncelle"}
              </button>
            </div>
          )}
        </section>

        {/* Uygulama Bilgisi */}
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-gray-400 text-[20px]">info</span>
            <h2 className="font-bold text-gray-800">Uygulama</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { icon: "security", label: "Uygulama", value: "AYTES", color: "bg-indigo-50 text-[#3949AB]" },
              { icon: "tag", label: "Sürüm", value: "v1.0.0", color: "bg-gray-50 text-gray-500" },
              { icon: "apartment", label: "Departman Kodu", value: personnel.departments?.slug?.toUpperCase() || "—", color: "bg-teal-50 text-teal-600" },
              { icon: "fingerprint", label: "Personel ID", value: personnel.id.slice(0, 8).toUpperCase(), color: "bg-purple-50 text-purple-600" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color.split(" ")[0]}`}>
                  <span className={`material-symbols-outlined text-[16px] ${item.color.split(" ")[1]}`}>{item.icon}</span>
                </div>
                <p className="flex-1 text-sm text-gray-600 font-semibold">{item.label}</p>
                <p className="text-sm text-gray-400 font-mono">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Çıkış Yap */}
        <button
          onClick={() => setShowSignOutConfirm(true)}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-sm font-bold text-red-600 bg-red-50 border border-red-100 active:scale-95 transition-all hover:bg-red-100">
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Hesaptan Çıkış Yap
        </button>

      </main>
    </div>
  );
}
