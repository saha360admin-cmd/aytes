"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const staffItems = [
  { href: "/dashboard", label: "Ana Sayfa", icon: "home" },
  { href: "/vardiyalar", label: "Vardiyam", icon: "calendar_month" },
  { href: "/devriye", label: "Devriye", icon: "route" },
  { href: "/raporlar", label: "Raporlar", icon: "description" },
  { href: "/talepler", label: "Talepler", icon: "assignment" },
  { href: "/ayarlar", label: "Profil", icon: "person" },
];

const adminItems = [
  { href: "/yonetici", label: "Panel", icon: "dashboard" },
  { href: "/personel", label: "Personel", icon: "group" },
  { href: "/vardiyalar", label: "Vardiya", icon: "edit_calendar" },
  { href: "/raporlar", label: "Raporlar", icon: "description" },
  { href: "/talepler", label: "Talepler", icon: "assignment" },
  { href: "/ayarlar", label: "Profil", icon: "person" },
];

const supervisorItems = [
  { href: "/yonetici", label: "Panel", icon: "dashboard" },
  { href: "/personel", label: "Ekibim", icon: "group" },
  { href: "/vardiyalar", label: "Vardiya", icon: "edit_calendar" },
  { href: "/raporlar", label: "Raporlar", icon: "description" },
  { href: "/talepler", label: "Talepler", icon: "assignment" },
  { href: "/ayarlar", label: "Profil", icon: "person" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { personnel } = useAuth();

  const role = personnel?.role;
  const items = role === "admin" ? adminItems : role === "supervisor" ? supervisorItems : staffItems;

  return (
    <nav className="absolute bottom-0 left-0 w-full z-50 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] flex justify-around items-center pt-2 pb-2 px-1 h-20 rounded-t-2xl">
      {items.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center px-2 py-1 rounded-2xl active:scale-90 transition-all duration-200 ${
              active ? "text-white" : "text-gray-500 hover:bg-gray-100"
            }`}
            style={active ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}
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
