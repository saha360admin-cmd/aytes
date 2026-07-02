"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const departments = [
  { slug: "idari", label: "İdari İşler Giriş", desc: "Yönetim ve İK Modülleri", icon: "admin_panel_settings", hoverBorder: "hover:border-primary/50", iconBg: "bg-primary-fixed", iconColor: "text-primary", hoverIconBg: "group-hover:bg-primary group-hover:text-on-primary", titleColor: "text-primary", chevronHover: "group-hover:text-primary" },
  { slug: "guvenlik", label: "Güvenlik Giriş", desc: "Nöbet ve Devriye Kontrol", icon: "security", hoverBorder: "hover:border-secondary/50", iconBg: "bg-secondary-container", iconColor: "text-on-secondary-container", hoverIconBg: "group-hover:bg-secondary group-hover:text-on-secondary", titleColor: "text-secondary", chevronHover: "group-hover:text-secondary" },
  { slug: "teknik", label: "Teknik Giriş", desc: "Bakım ve Onarım Talepleri", icon: "engineering", hoverBorder: "hover:border-tertiary/50", iconBg: "bg-tertiary-fixed", iconColor: "text-on-tertiary-fixed-variant", hoverIconBg: "group-hover:bg-tertiary group-hover:text-on-tertiary", titleColor: "text-tertiary", chevronHover: "group-hover:text-tertiary" },
  { slug: "temizlik", label: "Temizlik Giriş", desc: "Hijyen ve Stok Takibi", icon: "cleaning_services", hoverBorder: "hover:border-primary-container/50", iconBg: "bg-primary-fixed-dim", iconColor: "text-on-primary-fixed", hoverIconBg: "group-hover:bg-primary-container group-hover:text-on-primary", titleColor: "text-primary-container", chevronHover: "group-hover:text-primary-container" },
];

const adminDepts = [
  { slug: "idari",    label: "İdari İşler Yönetici", icon: "admin_panel_settings", color: "text-primary" },
  { slug: "guvenlik", label: "Güvenlik Yönetici", icon: "shield_person", color: "text-secondary" },
  { slug: "teknik",   label: "Teknik Yönetici",   icon: "build_circle",  color: "text-tertiary" },
  { slug: "temizlik", label: "Temizlik Yönetici", icon: "verified_user",  color: "text-primary-container" },
];

export default function HomePage() {
  const { session, personnel, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session && personnel) {
      if (personnel.role === "admin" || personnel.role === "supervisor") router.replace("/yonetici");
      else router.replace("/dashboard");
    }
  }, [loading, session, personnel, router]);

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

        {/* Yönetici Girişleri */}
        <div className="mt-sm">
          <div className="flex items-center gap-sm mb-sm">
            <div className="flex-1 h-px bg-outline-variant/40" />
            <span className="font-label-sm text-label-sm text-outline">Yönetici Girişi</span>
            <div className="flex-1 h-px bg-outline-variant/40" />
          </div>
          <div className="flex flex-col gap-xs">
            {adminDepts.map(({ slug, label, icon, color }) => (
              <button
                key={`admin-${slug}`}
                onClick={() => router.push(`/auth?dept=${slug}&mode=admin`)}
                className="w-full flex items-center gap-sm px-md py-sm bg-surface-container-lowest/60 border border-outline-variant/20 rounded-lg hover:bg-surface-container-low active:scale-95 transition-all text-left"
              >
                <span className={`material-symbols-outlined text-[18px] ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <span className={`font-label-md text-label-md ${color}`}>{label}</span>
                <span className="material-symbols-outlined text-[16px] text-outline-variant ml-auto">chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-xs text-center">
          <a className="inline-flex items-center gap-xs font-label-md text-primary hover:underline" href="#">
            <span className="material-symbols-outlined text-sm">help</span>
            Giriş yapamıyor musunuz? Destek alın
          </a>
        </div>
      </main>

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
