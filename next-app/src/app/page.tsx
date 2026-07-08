"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const departments = [
  { slug: "idari", label: "İdari İşler Giriş", desc: "Yönetim ve İK Modülleri", icon: "admin_panel_settings", hoverBorder: "hover:border-primary/50", iconBg: "bg-primary-fixed", iconColor: "text-primary", hoverIconBg: "group-hover:bg-primary group-hover:text-on-primary", titleColor: "text-primary", chevronHover: "group-hover:text-primary" },
  { slug: "guvenlik", label: "Güvenlik Giriş", desc: "Nöbet ve Devriye Kontrol", icon: "security", hoverBorder: "hover:border-secondary/50", iconBg: "bg-secondary-container", iconColor: "text-on-secondary-container", hoverIconBg: "group-hover:bg-secondary group-hover:text-on-secondary", titleColor: "text-secondary", chevronHover: "group-hover:text-secondary" },
  { slug: "teknik", label: "Teknik Giriş", desc: "Bakım ve Onarım Talepleri", icon: "engineering", hoverBorder: "hover:border-tertiary/50", iconBg: "bg-tertiary-fixed", iconColor: "text-on-tertiary-fixed-variant", hoverIconBg: "group-hover:bg-tertiary group-hover:text-on-tertiary", titleColor: "text-tertiary", chevronHover: "group-hover:text-tertiary" },
  { slug: "temizlik", label: "Temizlik Giriş", desc: "Hijyen ve Stok Takibi", icon: "cleaning_services", hoverBorder: "hover:border-primary-container/50", iconBg: "bg-primary-fixed-dim", iconColor: "text-on-primary-fixed", hoverIconBg: "group-hover:bg-primary-container group-hover:text-on-primary", titleColor: "text-primary-container", chevronHover: "group-hover:text-primary-container" },
];

export default function HomePage() {
  const { session, personnel, loading } = useAuth();
  const router = useRouter();

  const [showSupport, setShowSupport] = useState(false);
  const [supportDept, setSupportDept] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportResult, setSupportResult] = useState<"found" | "not_found" | "error" | null>(null);

  useEffect(() => {
    if (!loading && session && personnel) {
      const isManager = personnel.role === "admin" || personnel.role === "supervisor";
      const isDesktop = window.innerWidth >= 1024;
      // Masaüstünden (geniş ekran) giren güvenlik yöneticisi doğrudan
      // masaüstü paneline gider; mobilden girenler eskisi gibi /yonetici'ye.
      if (isManager && personnel.departments?.slug === "guvenlik" && isDesktop) router.replace("/web/guvenlik");
      else if (isManager) router.replace("/yonetici");
      else router.replace("/dashboard");
    }
  }, [loading, session, personnel, router]);

  function closeSupport() {
    setShowSupport(false);
    setSupportDept("");
    setSupportPhone("");
    setSupportResult(null);
  }

  async function submitSupport() {
    if (!supportDept || !supportPhone) return;
    setSupportSending(true);
    setSupportResult(null);
    try {
      const res = await fetch("/api/support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_slug: supportDept, phone: supportPhone }),
      });
      const data = await res.json();
      setSupportResult(res.ok ? (data.found ? "found" : "not_found") : "error");
    } catch {
      setSupportResult("error");
    } finally {
      setSupportSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex flex-col overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[80vw] h-[80vw] rounded-full bg-primary-fixed/30 blur-[80px]" />
        <div className="absolute top-[40%] -left-[20%] w-[70vw] h-[70vw] rounded-full bg-secondary-container/20 blur-[80px]" />
        <div className="absolute -bottom-[10%] right-[10%] w-[60vw] h-[60vw] rounded-full bg-tertiary-fixed/20 blur-[80px]" />
      </div>

      {/* Header */}
      <header className="w-full pt-xxl pb-xl px-margin-mobile flex flex-col items-center justify-center text-center relative z-10">
        <div className="w-24 h-24 bg-surface-container-lowest rounded-lg shadow-sm flex items-center justify-center mb-md">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
          </div>
        </div>
        <h1 className="font-display text-headline-lg-mobile text-primary tracking-tight">AYTES Personel</h1>
        <p className="font-body-md text-on-surface-variant mt-sm px-md">Hoş Geldiniz, lütfen departman seçiniz.</p>
      </header>

      {/* Department Selection */}
      <main className="flex-grow px-margin-mobile pb-xxl flex flex-col gap-md max-w-md mx-auto w-full relative z-10">
        {departments.map(({ slug, label, desc, icon, hoverBorder, iconBg, iconColor, hoverIconBg, titleColor, chevronHover }) => (
          <button
            key={slug}
            onClick={() => router.push(`/auth?dept=${slug}`)}
            className={`group relative w-full bg-surface-container-lowest p-md rounded-lg shadow-sm flex items-center gap-md border border-outline-variant/30 text-left transition-all active:scale-95 ${hoverBorder}`}
          >
            <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center ${iconColor} transition-colors ${hoverIconBg}`}>
              <span className="material-symbols-outlined text-[28px]">{icon}</span>
            </div>
            <div className="flex-grow">
              <h2 className={`font-headline-md ${titleColor} text-body-lg`}>{label}</h2>
              <p className="font-label-sm text-on-surface-variant">{desc}</p>
            </div>
            <span className={`material-symbols-outlined text-outline-variant ${chevronHover} transition-colors`}>chevron_right</span>
          </button>
        ))}

        <div className="mt-xs text-center">
          <button
            onClick={() => setShowSupport(true)}
            className="inline-flex items-center gap-xs font-label-md text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-sm">help</span>
            Giriş yapamıyor musunuz? Destek alın
          </button>
        </div>
      </main>

      {/* Destek Modal */}
      {showSupport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeSupport} />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-t-lg sm:rounded-lg shadow-2xl p-lg space-y-md">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-body-lg text-on-surface">Giriş Desteği</h3>
              <button onClick={closeSupport} className="p-xs rounded-full hover:bg-surface-container-high">
                <span className="material-symbols-outlined text-outline">close</span>
              </button>
            </div>

            {supportResult === "found" ? (
              <div className="flex items-center gap-sm bg-emerald-500/10 border border-emerald-500/30 rounded-md px-md py-md">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <p className="text-label-md text-emerald-700 font-semibold">Talebiniz iletildi, yöneticiniz sizinle iletişime geçecek.</p>
              </div>
            ) : supportResult === "not_found" ? (
              <div className="flex items-center gap-sm bg-error/10 border border-error/30 rounded-md px-md py-md">
                <span className="material-symbols-outlined text-error">error</span>
                <p className="text-label-md text-error font-semibold">Hesabınız bulunamadı. Lütfen departman yöneticinizle iletişime geçin.</p>
              </div>
            ) : (
              <>
                <p className="font-label-sm text-on-surface-variant">Departmanınızı ve telefon numaranızı girin, talebiniz yöneticinize iletilsin.</p>

                <div className="space-y-sm">
                  <label className="font-label-md text-on-surface-variant px-xs">Departman</label>
                  <select
                    value={supportDept}
                    onChange={e => setSupportDept(e.target.value)}
                    className="w-full py-md px-md rounded-md border border-outline-variant bg-surface font-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Departman seçin —</option>
                    {departments.map(d => <option key={d.slug} value={d.slug}>{d.label.replace(" Giriş", "")}</option>)}
                  </select>
                </div>

                <div className="space-y-sm">
                  <label className="font-label-md text-on-surface-variant px-xs">Telefon Numarası</label>
                  <input
                    type="tel"
                    maxLength={11}
                    placeholder="05321234567"
                    value={supportPhone}
                    onChange={e => setSupportPhone(e.target.value.replace(/\s/g, "").slice(0, 11))}
                    className="w-full py-md px-md rounded-md border border-outline-variant bg-surface font-body-md text-on-surface placeholder:text-outline/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                {supportResult === "error" && (
                  <div className="flex items-center gap-sm bg-error/10 border border-error/30 rounded-md px-md py-sm">
                    <span className="material-symbols-outlined text-error text-[18px]">error</span>
                    <p className="text-error text-label-sm font-semibold">Bir hata oluştu, tekrar deneyin.</p>
                  </div>
                )}

                <button
                  onClick={submitSupport}
                  disabled={!supportDept || !supportPhone || supportSending}
                  className="w-full bg-primary hover:bg-primary-container text-on-primary font-display font-bold py-md rounded-full shadow-md active:scale-95 transition-all flex items-center justify-center gap-sm disabled:opacity-50"
                >
                  {supportSending ? <Loader2 size={20} className="animate-spin" /> : "Gönder"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full pb-lg px-margin-mobile text-center relative z-10">
        <p className="font-label-sm text-outline">© 2024 AYTES Tesis Yönetim Çözümleri</p>
        <div className="flex justify-center gap-md mt-sm">
          <div className="w-1 h-1 bg-outline-variant rounded-full" />
          <div className="w-1 h-1 bg-outline-variant rounded-full" />
          <div className="w-1 h-1 bg-outline-variant rounded-full" />
        </div>
      </footer>
    </div>
  );
}
