"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getDepartmentHeaderTheme } from "@/lib/departmentTheme";
import { Loader2 } from "lucide-react";

const TOP_LEVEL_LINKS = [
  { href: "/web/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/web/guvenlik", label: "Güvenlik", icon: "security" },
  { href: "/web/temizlik", label: "Temizlik", icon: "cleaning_services" },
  { href: "/web/teknik", label: "Teknik", icon: "engineering" },
];

// Güvenlik bölümü kendi alt menüsünü kullanır (ShieldOps tasarımı),
// mobildeki güvenlik yöneticisi footer'ıyla (Panel/Personel/Vardiya/Devriye/
// Olaylar/Taşeron/Talepler) birebir aynı sekmeler. Raporlama'nın mobilde
// aktif bir karşılığı yok (eskisi Olaylar'la yinelendiği için kaldırılmıştı)
// — sadece masaüstünde var, diğer tüm sekmeler gerçek sayfalara bağlı.
const GUVENLIK_LINKS = [
  { href: "/web/guvenlik", label: "Dashboard", icon: "dashboard" },
  { href: "/web/guvenlik/personel", label: "Personel", icon: "badge" },
  { href: "/web/guvenlik/vardiyalar", label: "Vardiyalar", icon: "schedule" },
  { href: "/web/guvenlik/devriyeler", label: "Devriyeler", icon: "route" },
  { href: "/web/guvenlik/olaylar", label: "Olaylar", icon: "report_problem" },
  { href: "/web/guvenlik/taseron", label: "Taşeron", icon: "handyman" },
  { href: "/web/guvenlik/talepler", label: "Talepler", icon: "assignment" },
  { href: "/web/guvenlik/iletisim", label: "İletişim", icon: "forum" },
  { href: "/web/guvenlik/raporlama", label: "Raporlama", icon: "assessment" },
];

function Sidebar() {
  const pathname = usePathname();
  const { personnel } = useAuth();
  const isGuvenlikSection = pathname?.startsWith("/web/guvenlik");
  // İdari İşler, Güvenlik'in devriye verilerini salt okunur izlediği ayrı
  // sayfaya (web/idari/devriyeler) buradan ulaşır — Güvenlik'in kendi
  // sidebar'ı (GUVENLIK_LINKS) hiç değişmiyor.
  const links = isGuvenlikSection
    ? GUVENLIK_LINKS
    : personnel?.departments?.slug === "idari"
      ? [...TOP_LEVEL_LINKS, { href: "/web/idari/devriyeler", label: "Devriye Takip", icon: "route" }]
      : TOP_LEVEL_LINKS;
  const theme = getDepartmentHeaderTheme(isGuvenlikSection ? "guvenlik" : null);

  return (
    <aside className="relative overflow-hidden w-[240px] flex-shrink-0 h-screen sticky top-0 flex flex-col transition-all"
      style={{ background: theme.gradient.replace("135deg", "180deg") }}>
      {/* Dekoratif ikonlar — masaüstü güvenlik dashboard başlığındaki
          (web/guvenlik/page.tsx) ve mobil headerındaki aynı kompozisyon.
          Acil Durum Alarmı butonunun (opak, altta) arkasında kalıp
          görünmez olmaması için kümenin tamamı butonun üstüne, büyütülmüş
          olarak yerleştirildi. */}
      {theme.decorative && (
        <div className="absolute inset-x-0 bottom-0 h-64 pointer-events-none">
          <span className="material-symbols-outlined absolute" style={{ right: "-16px", bottom: "110px", fontSize: "130px", color: theme.decorativeColor, opacity: 0.16, fontVariationSettings: "'FILL' 1" }}>{theme.decorative[0].icon}</span>
          <span className="material-symbols-outlined absolute" style={{ right: "64px", bottom: "130px", fontSize: "58px", color: theme.decorativeColor, opacity: 0.24, fontVariationSettings: "'FILL' 1" }}>{theme.decorative[1].icon}</span>
          <span className="material-symbols-outlined absolute" style={{ right: "20px", bottom: "170px", fontSize: "36px", color: theme.decorativeColor, opacity: 0.3, fontVariationSettings: "'FILL' 1" }}>{theme.decorative[2].icon}</span>
        </div>
      )}

      <a href={isGuvenlikSection ? "/web/guvenlik" : "/web/dashboard"} className="relative z-10 flex items-center gap-3 px-5 h-16 flex-shrink-0">
        <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>{theme.icon}</span>
        <span className="font-bold text-white text-lg">{theme.title}</span>
      </a>
      <nav className="relative z-10 flex-1 px-3 py-2 space-y-1">
        {links.map((link, i) => {
          const active = link.href !== "#" && pathname === link.href;
          return (
            <a
              key={`${link.href}-${i}`}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{link.icon}</span>
              {link.label}
            </a>
          );
        })}
      </nav>
      {isGuvenlikSection && (
        <div className="relative z-10 px-3 pb-4">
          <button className="w-full bg-error text-white rounded-full py-3 font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:brightness-110 transition-all">
            <span className="material-symbols-outlined text-[18px]">emergency_share</span>
            Acil Durum Alarmı
          </button>
        </div>
      )}
    </aside>
  );
}

function TopHeader() {
  const { personnel, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isGuvenlikSection = pathname?.startsWith("/web/guvenlik");
  const theme = getDepartmentHeaderTheme(isGuvenlikSection ? "guvenlik" : null);

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <header
      className="w-full h-16 flex items-center justify-between gap-4 px-6 border-b-2 bg-surface-container-lowest transition-all"
      style={{ borderBottomColor: isGuvenlikSection ? "#1565C0" : "transparent" }}
    >
      {isGuvenlikSection ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: theme.gradient }}>
          <span className="material-symbols-outlined text-white text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>{theme.icon}</span>
          <span className="text-xs font-bold text-white">{theme.title}</span>
        </div>
      ) : <div />}
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-on-surface">{personnel?.full_name}</span>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-error hover:bg-error/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Çıkış Yap
        </button>
      </div>
    </header>
  );
}

export default function WebLayout({ children }: { children: React.ReactNode }) {
  const { session, personnel, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/");
  }, [loading, session, router]);

  useEffect(() => {
    if (!loading && personnel && personnel.role === "personel") {
      router.replace("/dashboard");
    }
  }, [loading, personnel, router]);

  if (loading || (!loading && session && !personnel)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#f0f2ff] w-full flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <TopHeader />
        {children}
      </div>
    </div>
  );
}
