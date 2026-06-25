"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const staffItems = [
  { href: "/dashboard", label: "Ana Sayfa", icon: "home" },
  { href: "/devriye", label: "Devriye", icon: "route" },
  { href: "/raporlar", label: "Raporlar", icon: "description" },
  { href: "/talepler", label: "Talepler", icon: "assignment" },
  { href: "/ayarlar", label: "Profil", icon: "person" },
];

const adminItems = [
  { href: "/yonetici", label: "Panel", icon: "dashboard" },
  { href: "/personel", label: "Personel", icon: "group" },
  { href: "/raporlar", label: "Raporlar", icon: "description" },
  { href: "/talepler", label: "Talepler", icon: "assignment" },
  { href: "/ayarlar", label: "Profil", icon: "person" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { personnel } = useAuth();

  const isAdmin = personnel?.role === "admin" || personnel?.role === "supervisor";
  const items = isAdmin ? adminItems : staffItems;

  return (
    <nav className="absolute bottom-0 left-0 w-full z-50 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] flex justify-around items-center pt-2 pb-2 px-1 h-20 rounded-t-2xl">
      {items.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-2xl active:scale-90 transition-all duration-200 ${
              active ? "bg-blue-700 text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {icon}
            </span>
            <span className="text-[11px] font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
