"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const staffPatrolItem = { href: "/devriye",     label: "Devriye",       icon: "route",             color: "#7B1FA2" };
const staffKatKontrolItem = { href: "/kat-kontrol", label: "Kat Kontrolü", icon: "cleaning_services", color: "#7B1FA2" };

const staffItems = (isTemizlik: boolean) => [
  { href: "/dashboard",   label: "Ana Sayfa", icon: "home",           color: "#3949AB" },
  { href: "/vardiyalar",  label: "Vardiyam",  icon: "calendar_month", color: "#00897B" },
  isTemizlik ? staffKatKontrolItem : staffPatrolItem,
  { href: "/talepler",    label: "Talepler",  icon: "assignment",     color: "#E65100" },
  { href: "/olaylar",     label: "Olaylar",   icon: "report_problem", color: "#C62828" },
  { href: "/ayarlar",     label: "Profil",    icon: "person",         color: "#546E7A" },
];

const adminPlanlamaItem = { href: "/yonetici/devriye-planlama", label: "Devriye",       icon: "route",             color: "#7B1FA2" };
const adminKatPlanlamaItem = { href: "/yonetici/kat-planlama",  label: "Kat Kontrolü", icon: "cleaning_services", color: "#7B1FA2" };

const adminItems = (isTemizlik: boolean) => [
  { href: "/yonetici",                  label: "Panel",    icon: "dashboard",      color: "#3949AB" },
  { href: "/personel",                  label: "Personel", icon: "group",          color: "#1565C0" },
  { href: "/vardiya-olustur",           label: "Vardiya",  icon: "edit_calendar",  color: "#00897B" },
  isTemizlik ? adminKatPlanlamaItem : adminPlanlamaItem,
  { href: "/yonetici/olaylar",          label: "Olaylar",  icon: "report_problem", color: "#C62828" },
  { href: "/yonetici/taseron",          label: "Taşeron",  icon: "engineering",    color: "#00695C" },
  { href: "/yonetici/talepler",         label: "Talepler", icon: "assignment",     color: "#E65100" },
  { href: "/ayarlar",                   label: "Profil",   icon: "person",         color: "#546E7A" },
];

const supervisorItems = (isTemizlik: boolean) => [
  { href: "/yonetici",                  label: "Panel",    icon: "dashboard",      color: "#3949AB" },
  { href: "/personel",                  label: "Ekibim",   icon: "group",          color: "#1565C0" },
  { href: "/vardiya-olustur",           label: "Vardiya",  icon: "edit_calendar",  color: "#00897B" },
  isTemizlik ? adminKatPlanlamaItem : adminPlanlamaItem,
  { href: "/yonetici/olaylar",          label: "Olaylar",  icon: "report_problem", color: "#C62828" },
  { href: "/yonetici/taseron",          label: "Taşeron",  icon: "engineering",    color: "#00695C" },
  { href: "/yonetici/talepler",         label: "Talepler", icon: "assignment",     color: "#E65100" },
  { href: "/ayarlar",                   label: "Profil",   icon: "person",         color: "#546E7A" },
];

function NavLink({ href, label, icon, color, active }: {
  href: string; label: string; icon: string; color: string; active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-all duration-150 select-none"
    >
      <div
        className="w-12 h-8 flex items-center justify-center rounded-xl transition-all duration-200"
        style={active
          ? { background: color, boxShadow: `0 4px 10px ${color}55` }
          : { background: `${color}18` }
        }
      >
        <span
          className="material-symbols-outlined text-[20px] transition-all duration-200"
          style={{
            color: active ? "#fff" : color,
            fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
          }}
        >
          {icon}
        </span>
      </div>
      <span
        className="text-[10px] font-bold leading-tight transition-colors duration-200"
        style={{ color: active ? color : "#9CA3AF" }}
      >
        {label}
      </span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { personnel } = useAuth();

  const role = personnel?.role;
  const isTemizlik = personnel?.departments?.slug === "temizlik";
  const items = role === "admin" ? adminItems(isTemizlik) : role === "supervisor" ? supervisorItems(isTemizlik) : staffItems(isTemizlik);

  const mid = Math.ceil(items.length / 2);
  const row1 = items.slice(0, mid);
  const row2 = items.slice(mid);

  return (
    <nav className="absolute bottom-0 left-0 w-full z-50 bg-white shadow-[0_-2px_16px_rgba(0,0,0,0.08)] rounded-t-2xl h-28 flex flex-col justify-around pt-2 pb-2.5 px-2">
      <div className="flex justify-around items-center">
        {row1.map(item => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}
      </div>
      <div className="flex justify-around items-center">
        {row2.map(item => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}
