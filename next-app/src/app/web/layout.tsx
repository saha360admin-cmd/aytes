"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

const TOP_LEVEL_LINKS = [
  { href: "/web/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/web/guvenlik", label: "Güvenlik", icon: "security" },
  { href: "/web/temizlik", label: "Temizlik", icon: "cleaning_services" },
  { href: "/web/teknik", label: "Teknik", icon: "engineering" },
];

// Güvenlik bölümü kendi alt menüsünü kullanır (ShieldOps tasarımı),
// mobildeki güvenlik yöneticisi footer'ıyla (Panel/Personel/Vardiya/Devriye/
// Olaylar/Taşeron/Talepler) birebir aynı sekmeler. Devriyeler/Olaylar/
// Talepler/Raporlama sayfaları henüz yok — bu linkler şimdilik "#"
// (placeholder), Personel/Vardiyalar/Taşeron gerçek sayfalara bağlı.
const GUVENLIK_LINKS = [
  { href: "/web/guvenlik", label: "Dashboard", icon: "dashboard" },
  { href: "/web/guvenlik/personel", label: "Personel", icon: "badge" },
  { href: "/web/guvenlik/vardiyalar", label: "Vardiyalar", icon: "schedule" },
  { href: "#", label: "Devriyeler", icon: "route" },
  { href: "#", label: "Olaylar", icon: "report_problem" },
  { href: "/web/guvenlik/taseron", label: "Taşeron", icon: "handyman" },
  { href: "#", label: "Talepler", icon: "assignment" },
  { href: "#", label: "Raporlama", icon: "assessment" },
];

function Sidebar() {
  const pathname = usePathname();
  const isGuvenlikSection = pathname?.startsWith("/web/guvenlik");
  const links = isGuvenlikSection ? GUVENLIK_LINKS : TOP_LEVEL_LINKS;

  return (
    <aside className="w-[240px] flex-shrink-0 h-screen sticky top-0 flex flex-col"
      style={{ background: "linear-gradient(180deg, #1A237E 0%, #283593 100%)" }}>
      <a href="/web/dashboard" className="flex items-center gap-3 px-5 h-16 flex-shrink-0">
        <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
        <span className="font-bold text-white text-lg">AYTES</span>
      </a>
      <nav className="flex-1 px-3 py-2 space-y-1">
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
        <div className="px-3 pb-4">
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

  async function handleSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <header className="w-full h-16 flex items-center justify-end gap-4 px-6 border-b border-outline-variant/20 bg-surface-container-lowest">
      <span className="text-sm font-semibold text-on-surface">{personnel?.full_name}</span>
      <button
        onClick={handleSignOut}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-error hover:bg-error/10 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">logout</span>
        Çıkış Yap
      </button>
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
