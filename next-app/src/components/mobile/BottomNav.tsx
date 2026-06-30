"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const staffItems = [
  { href: "/dashboard",    label: "Ana Sayfa", icon: "home" },
  { href: "/vardiyalar",   label: "Vardiyam",  icon: "calendar_month" },
  { href: "/devriye",      label: "Devriye",   icon: "route" },
  { href: "/talepler",     label: "Talepler",  icon: "assignment" },
  { href: "/olay-bildir",  label: "Olaylar",   icon: "report_problem" },
  { href: "/ayarlar",      label: "Profil",    icon: "person" },
];

const adminItems = [
  { href: "/yonetici",                    label: "Panel",    icon: "dashboard" },
  { href: "/personel",                    label: "Personel", icon: "group" },
  { href: "/vardiya-olustur",             label: "Vardiya",  icon: "edit_calendar" },
  { href: "/yonetici/devriye-planlama",   label: "Devriye",  icon: "route" },
  { href: "/yonetici/olaylar",            label: "Olaylar",  icon: "report_problem" },
  { href: "/yonetici/talepler",           label: "Talepler", icon: "assignment" },
  { href: "/ayarlar",                     label: "Profil",   icon: "person" },
];

const supervisorItems = [
  { href: "/yonetici",                    label: "Panel",    icon: "dashboard" },
  { href: "/personel",                    label: "Ekibim",   icon: "group" },
  { href: "/vardiya-olustur",             label: "Vardiya",  icon: "edit_calendar" },
  { href: "/yonetici/devriye-planlama",   label: "Devriye",  icon: "route" },
  { href: "/yonetici/olaylar",            label: "Olaylar",  icon: "report_problem" },
  { href: "/yonetici/talepler",           label: "Talepler", icon: "assignment" },
  { href: "/ayarlar",                     label: "Profil",   icon: "person" },
];

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center px-2 py-1 rounded-2xl active:scale-90 transition-all duration-200 min-w-0 ${
        active ? "text-white" : "text-gray-500 hover:bg-gray-100"
      }`}
      style={active ? { background: "linear-gradient(135deg, #1A237E, #3949AB)" } : undefined}
    >
      <span
        className="material-symbols-outlined text-[22px]"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <span className="text-[10px] font-semibold leading-tight mt-0.5">{label}</span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { personnel } = useAuth();

  const role = personnel?.role;
  const items = role === "admin" ? adminItems : role === "supervisor" ? supervisorItems : staffItems;

  const mid = Math.ceil(items.length / 2);
  const row1 = items.slice(0, mid);
  const row2 = items.slice(mid);

  return (
    <nav className="absolute bottom-0 left-0 w-full z-50 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.08)] rounded-t-2xl h-28 flex flex-col justify-around pt-1.5 pb-2 px-2">
      <div className="flex justify-around items-center">
        {row1.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
        ))}
      </div>
      <div className="flex justify-around items-center">
        {row2.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href} />
        ))}
      </div>
    </nav>
  );
}
