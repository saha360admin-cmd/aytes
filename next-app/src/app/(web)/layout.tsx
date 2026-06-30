"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

function WebNavbar() {
  const { personnel, signOut } = useAuth();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
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

  const initials = personnel?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() ?? "";

  return (
    <header className="w-full h-16 flex items-center justify-between px-6 shadow-sm sticky top-0 z-50"
      style={{ background: "linear-gradient(135deg, #1A237E 0%, #283593 100%)" }}>
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
        <span className="font-bold text-white text-lg">AYTES</span>
        <span className="ml-1 text-xs text-white/60 font-semibold">{personnel?.departments?.name}</span>
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {[
            { href: "/taseron",       label: "Taşeron Takip", icon: "engineering"   },
            { href: "/taseron/rapor", label: "Rapor",         icon: "bar_chart"     },
          ].map(item => (
            <a key={item.href} href={item.href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-white/80 hover:text-white hover:bg-white/15 transition-all">
              <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors active:scale-95"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 text-white font-bold text-sm flex items-center justify-center">
              {initials}
            </div>
            <span className="text-sm font-semibold text-white">{personnel?.full_name?.split(" ")[0]}</span>
            <span className="material-symbols-outlined text-white text-[18px]">expand_more</span>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800 truncate">{personnel?.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{personnel?.email}</p>
                <span className="mt-1 inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full uppercase">
                  {personnel?.role === "admin" ? "Yönetici" : "Süpervizör"}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Çıkış Yap
              </button>
            </div>
          )}
        </div>
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
    <div className="min-h-screen bg-[#f0f2ff] w-full">
      <WebNavbar />
      <div>{children}</div>
    </div>
  );
}
