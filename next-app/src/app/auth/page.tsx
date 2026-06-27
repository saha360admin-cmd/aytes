"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

const deptConfig: Record<string, { name: string; icon: string; iconBg: string }> = {
  idari:    { name: "İdari İşler",  icon: "admin_panel_settings", iconBg: "bg-primary-container" },
  guvenlik: { name: "Güvenlik",     icon: "security",             iconBg: "bg-primary-container" },
  teknik:   { name: "Teknik",       icon: "engineering",          iconBg: "bg-tertiary-container" },
  temizlik: { name: "Temizlik",     icon: "cleaning_services",    iconBg: "bg-primary-container" },
};

function AuthForm() {
  const params = useSearchParams();
  const dept = params.get("dept") || "idari";
  const mode = params.get("mode") || "staff"; // "staff" | "admin"
  const config = deptConfig[dept] || deptConfig.idari;
  const isAdminMode = mode === "admin";

  const router = useRouter();
  const { signIn, signUp } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isRegister) {
        await signUp(form.email, form.password, form.name, dept);
        setIsRegister(false);
      } else {
        await signIn(form.email, form.password);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: p } = await supabase
            .from("personnel")
            .select("role")
            .eq("auth_id", user.id)
            .single();

          const role = p?.role;

          if (isAdminMode) {
            // Yönetici girişi: sadece admin veya supervisor girebilir
            if (role !== "admin" && role !== "supervisor") {
              await supabase.auth.signOut();
              setError("Bu giriş paneli yalnızca yöneticilere açıktır.");
              return;
            }
          } else {
            // Personel girişi: sadece personel girebilir
            if (role === "admin" || role === "supervisor") {
              await supabase.auth.signOut();
              setError("Yönetici hesabınızla yönetici girişini kullanınız.");
              return;
            }
          }

          // Yönlendirme
          if (role === "admin") router.replace("/yonetici");
          else if (role === "supervisor") router.replace("/amir");
          else router.replace("/dashboard");
        } else {
          router.replace("/dashboard");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  const panelTitle = isAdminMode ? `${config.name} Yönetici Girişi` : `${config.name} Personel Girişi`;
  const panelDesc = isAdminMode ? "Bu panel yalnızca yetkili yöneticilere açıktır." : "Personel giriş paneli";

  return (
    <div className="bg-background min-h-screen flex flex-col justify-center items-center p-margin-mobile">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[5%] right-[5%] w-[30%] h-[30%] rounded-full bg-secondary-container/10 blur-[100px]" />
      </div>

      <main className="relative z-10 w-full max-w-md animate-fade-up">
        {/* Logo ve Markalama */}
        <div className="flex flex-col items-center mb-xl">
          <div className={`w-16 h-16 ${config.iconBg} rounded-2xl flex items-center justify-center mb-md shadow-sm relative`}>
            <span className="material-symbols-outlined text-on-primary-container text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>{config.icon}</span>
            {isAdminMode && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              </span>
            )}
          </div>
          <h1 className="font-display text-headline-lg-mobile text-primary mb-xs">AYTES Personel</h1>
          <p className="font-label-md text-on-surface-variant text-center">{panelTitle}</p>
          {isAdminMode && (
            <div className="mt-sm flex items-center gap-xs bg-amber-50 border border-amber-200 px-md py-xs rounded-full">
              <span className="material-symbols-outlined text-amber-600 text-[14px]">lock</span>
              <span className="text-[11px] font-semibold text-amber-700">Yetkili Personel Girişi</span>
            </div>
          )}
        </div>

        {/* Giriş Kartı */}
        <section className="bg-surface-container-lowest rounded-lg shadow-sm p-lg w-full flex flex-col gap-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-md">
            {isRegister && (
              <div className="space-y-sm">
                <label className="font-label-md text-on-surface-variant px-xs">Ad Soyad</label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-md text-outline">person</span>
                  <input
                    type="text"
                    required
                    placeholder="Ad Soyad"
                    value={form.name}
                    onChange={e => update("name", e.target.value)}
                    className="w-full pl-[48px] pr-md py-md rounded-md border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-surface font-body-md text-on-surface placeholder:text-outline/50"
                  />
                </div>
              </div>
            )}

            <div className="space-y-sm">
              <label className="font-label-md text-on-surface-variant px-xs">E-posta</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-md text-outline">mail</span>
                <input
                  type="email"
                  required
                  placeholder="ornek@aytes.com"
                  value={form.email}
                  onChange={e => update("email", e.target.value)}
                  className="w-full pl-[48px] pr-md py-md rounded-md border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-surface font-body-md text-on-surface placeholder:text-outline/50"
                />
              </div>
            </div>

            <div className="space-y-sm">
              <label className="font-label-md text-on-surface-variant px-xs">Şifre</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-md text-outline">lock</span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  minLength={6}
                  value={form.password}
                  onChange={e => update("password", e.target.value)}
                  className="w-full pl-[48px] pr-[48px] py-md rounded-md border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-surface font-body-md text-on-surface placeholder:text-outline/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-md text-outline hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined">{showPassword ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </div>

            {!isRegister && (
              <div className="flex items-center justify-between mt-xs px-xs">
                <label className="flex items-center gap-sm cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 rounded-sm border-2 border-outline-variant checked:bg-primary checked:border-primary transition-all cursor-pointer" />
                  <span className="font-label-md text-on-surface-variant group-hover:text-primary transition-colors">Beni Hatırla</span>
                </label>
                <a className="font-label-md text-primary hover:underline underline-offset-4" href="#">Şifremi Unuttum</a>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-sm bg-error/10 border border-error/30 rounded-md px-md py-sm">
                <span className="material-symbols-outlined text-error text-[18px]">error</span>
                <p className="text-error text-label-sm font-semibold">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-md bg-primary hover:bg-primary-container text-on-primary font-display font-bold py-md rounded-full shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-sm disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  {isRegister ? "Kayıt Ol" : "Giriş Yap"}
                  <span className="material-symbols-outlined text-body-lg">{isRegister ? "person_add" : "login"}</span>
                </>
              )}
            </button>
          </form>

          {/* İkincil Eylemler */}
          <div className="border-t border-outline-variant/30 pt-md flex flex-col items-center gap-md">
            <p className="font-label-sm text-outline">
              {isRegister ? "Zaten hesabınız var mı?" : "Hesabınız yok mu?"}
            </p>
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              className="flex items-center gap-sm px-lg py-sm rounded-full border border-outline-variant hover:bg-surface-container-high transition-colors text-on-surface-variant font-label-md"
            >
              <span className="material-symbols-outlined">{isRegister ? "login" : "person_add"}</span>
              {isRegister ? "Giriş Yap" : "Kayıt Ol"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-sm px-lg py-sm rounded-full border border-outline-variant hover:bg-surface-container-high transition-colors text-on-surface-variant font-label-md"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Geri Dön
            </button>
          </div>
        </section>

        <footer className="mt-xl text-center">
          <p className="font-label-sm text-outline">AYTES Yönetim Sistemi v2.4.0</p>
          <p className="font-label-sm text-outline-variant mt-xs">© 2024 Tüm Hakları Saklıdır</p>
        </footer>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={40} /></div>}>
      <AuthForm />
    </Suspense>
  );
}
