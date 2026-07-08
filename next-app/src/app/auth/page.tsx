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
  const dept = params.get("dept");
  const config = dept ? deptConfig[dept] : null;

  const router = useRouter();
  const { signIn } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ phone: "", password: "" });
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [securityCode, setSecurityCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const loginEmail = `${form.phone.replace(/\s/g, "")}@aytes.app`;
      await signIn(loginEmail, form.password);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase
          .from("personnel")
          .select("role, departments(slug)")
          .eq("auth_id", user.id)
          .single();

        const role = p?.role;
        const deptSlug = (p?.departments as { slug: string } | null)?.slug;
        const isDesktop = window.innerWidth >= 1024;

        // Yönlendirme: gerçek role göre otomatik, ayrı bir yönetici girişi yok.
        // Masaüstünden (geniş ekran) giren güvenlik yöneticisi doğrudan
        // masaüstü paneline gider; mobilden girenler eskisi gibi /yonetici'ye.
        if ((role === "admin" || role === "supervisor") && deptSlug === "guvenlik" && isDesktop) router.replace("/web/guvenlik");
        else if (role === "admin" || role === "supervisor") router.replace("/yonetici");
        else router.replace("/dashboard");
      } else {
        router.replace("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  function handleForgotPassword() {
    setForgotMsg(null);
    if (!form.phone || form.phone.length < 10) {
      setForgotMsg({ ok: false, text: "Önce telefon numaranızı girin." });
      return;
    }
    setResetMsg(null);
    setShowResetPanel(true);
  }

  async function handleReportToManager() {
    setForgotSending(true);
    try {
      const res = await fetch("/api/support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_slug: dept, phone: form.phone }),
      });
      const data = await res.json();
      if (res.ok && data.found) {
        setResetMsg({ ok: true, text: "Talebiniz departman yöneticinize iletildi, şifreniz sıfırlanacak." });
      } else if (res.ok) {
        setResetMsg({ ok: false, text: "Bu telefon numarasıyla kayıtlı hesap bulunamadı." });
      } else {
        setResetMsg({ ok: false, text: "Bir hata oluştu, tekrar deneyin." });
      }
    } catch {
      setResetMsg({ ok: false, text: "Bir hata oluştu, tekrar deneyin." });
    } finally {
      setForgotSending(false);
    }
  }

  async function handleSelfReset() {
    setResetMsg(null);
    if (!securityCode) {
      setResetMsg({ ok: false, text: "Güvenlik kodunuzu girin." });
      return;
    }
    if (newPassword.length < 6) {
      setResetMsg({ ok: false, text: "Şifre en az 6 karakter olmalı." });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setResetMsg({ ok: false, text: "Şifreler eşleşmiyor." });
      return;
    }
    setResetSending(true);
    try {
      const res = await fetch("/api/self-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_slug: dept, phone: form.phone, security_code: securityCode, new_password: newPassword }),
      });
      const data = await res.json();
      if (data.status === "reset_ok") {
        setResetMsg({ ok: true, text: "Şifreniz güncellendi, şimdi giriş yapabilirsiniz." });
        setSecurityCode(""); setNewPassword(""); setNewPasswordConfirm("");
      } else if (data.status === "not_found") {
        setResetMsg({ ok: false, text: "Bu telefon numarasıyla kayıtlı hesap bulunamadı." });
      } else if (data.status === "invalid_code") {
        setResetMsg({ ok: false, text: "Güvenlik kodu hatalı veya tanımlı değil." });
      } else {
        setResetMsg({ ok: false, text: data.error || "Bir hata oluştu, tekrar deneyin." });
      }
    } catch {
      setResetMsg({ ok: false, text: "Bir hata oluştu, tekrar deneyin." });
    } finally {
      setResetSending(false);
    }
  }

  const panelTitle = config ? `${config.name} Girişi` : "Personel Girişi";

  return (
    <div className="bg-background min-h-screen flex flex-col justify-center items-center p-margin-mobile">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[5%] right-[5%] w-[30%] h-[30%] rounded-full bg-secondary-container/10 blur-[100px]" />
      </div>

      <main className="relative z-10 w-full max-w-md animate-fade-up">
        {/* Logo ve Markalama */}
        <div className="flex flex-col items-center mb-xl">
          <div className={`w-16 h-16 ${config ? config.iconBg : "bg-primary-container"} rounded-2xl flex items-center justify-center mb-md shadow-sm relative`}>
            <span className="material-symbols-outlined text-on-primary-container text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>{config ? config.icon : "badge"}</span>
          </div>
          <h1 className="font-display text-headline-lg-mobile text-primary mb-xs">AYTES Personel</h1>
          <p className="font-label-md text-on-surface-variant text-center">{panelTitle}</p>
        </div>

        {/* Giriş Kartı */}
        <section className="bg-surface-container-lowest rounded-lg shadow-sm p-lg w-full flex flex-col gap-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-md">
            <div className="space-y-sm">
              <label className="font-label-md text-on-surface-variant px-xs">Telefon Numarası</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-md text-outline">phone</span>
                <input
                  type="tel"
                  required
                  placeholder="05321234567"
                  maxLength={11}
                  value={form.phone}
                  onChange={e => update("phone", e.target.value.replace(/\s/g, "").slice(0, 11))}
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

            <div className="flex items-center justify-between mt-xs px-xs">
              <label className="flex items-center gap-sm cursor-pointer group">
                <input type="checkbox" className="w-5 h-5 rounded-sm border-2 border-outline-variant checked:bg-primary checked:border-primary transition-all cursor-pointer" />
                <span className="font-label-md text-on-surface-variant group-hover:text-primary transition-colors">Beni Hatırla</span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="font-label-md text-primary hover:underline underline-offset-4"
              >
                Şifremi Unuttum
              </button>
            </div>

            {forgotMsg && (
              <div className="flex items-center gap-sm bg-error/10 border border-error/30 rounded-md px-md py-sm">
                <span className="material-symbols-outlined text-error text-[18px]">error</span>
                <p className="text-error text-label-sm font-semibold">{forgotMsg.text}</p>
              </div>
            )}

            {showResetPanel && (
              <div className="space-y-md rounded-md border border-outline-variant p-md bg-surface">
                <p className="font-label-sm text-on-surface-variant">Güvenlik kodunuzu ve yeni şifrenizi girin.</p>

                <div className="space-y-sm">
                  <label className="font-label-md text-on-surface-variant px-xs">Güvenlik Kodu</label>
                  <input
                    type="text"
                    placeholder="Güvenlik kodunuz"
                    value={securityCode}
                    onChange={e => setSecurityCode(e.target.value)}
                    className="w-full py-md px-md rounded-md border border-outline-variant bg-surface font-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-sm">
                  <label className="font-label-md text-on-surface-variant px-xs">Yeni Şifre</label>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="En az 6 karakter"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full py-md px-md rounded-md border border-outline-variant bg-surface font-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-sm">
                  <label className="font-label-md text-on-surface-variant px-xs">Yeni Şifre (Tekrar)</label>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Şifreyi tekrar girin"
                    value={newPasswordConfirm}
                    onChange={e => setNewPasswordConfirm(e.target.value)}
                    className="w-full py-md px-md rounded-md border border-outline-variant bg-surface font-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                {resetMsg && (
                  <div className={`flex items-center gap-sm rounded-md px-md py-sm ${resetMsg.ok ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-error/10 border border-error/30"}`}>
                    <span className={`material-symbols-outlined text-[18px] ${resetMsg.ok ? "text-emerald-600" : "text-error"}`}>{resetMsg.ok ? "check_circle" : "error"}</span>
                    <p className={`text-label-sm font-semibold ${resetMsg.ok ? "text-emerald-700" : "text-error"}`}>{resetMsg.text}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSelfReset}
                  disabled={resetSending}
                  className="w-full bg-primary hover:bg-primary-container text-on-primary font-display font-bold py-md rounded-full shadow-md active:scale-95 transition-all flex items-center justify-center gap-sm disabled:opacity-50"
                >
                  {resetSending ? <Loader2 size={20} className="animate-spin" /> : "Şifreyi Sıfırla"}
                </button>

                <button
                  type="button"
                  onClick={handleReportToManager}
                  disabled={forgotSending}
                  className="w-full text-center font-label-sm text-primary hover:underline disabled:opacity-50"
                >
                  {forgotSending ? "Gönderiliyor..." : "Güvenlik kodumu bilmiyorum, yöneticime bildir"}
                </button>
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
                  Giriş Yap
                  <span className="material-symbols-outlined text-body-lg">login</span>
                </>
              )}
            </button>
          </form>

          {/* İkincil Eylemler */}
          <div className="border-t border-outline-variant/30 pt-md flex flex-col items-center gap-md">
            <p className="font-label-sm text-outline text-center">
              Hesabınız yöneticiniz tarafından oluşturulur.
            </p>
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
