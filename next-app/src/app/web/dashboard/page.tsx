"use client";

import { useAuth } from "@/context/AuthContext";

const UNIT_CARDS = [
  { slug: "guvenlik", label: "Güvenlik", icon: "security", color: "text-secondary", bg: "bg-secondary-container", stat: "101 personel", sub: "18 lokasyon" },
  { slug: "temizlik", label: "Temizlik", icon: "cleaning_services", color: "text-primary-container", bg: "bg-primary-fixed-dim", stat: "50 personel", sub: "18 lokasyon" },
  { slug: "teknik", label: "Teknik", icon: "engineering", color: "text-tertiary", bg: "bg-tertiary-fixed", stat: "Çağrı bazlı", sub: "Tüm lokasyonlar" },
];

export default function WebDashboardPage() {
  const { personnel } = useAuth();

  const cards = personnel?.role === "admin"
    ? UNIT_CARDS
    : UNIT_CARDS.filter(c => c.slug === personnel?.departments?.slug);

  return (
    <div className="p-8">
      <h1 className="font-display text-headline-lg text-on-background mb-xs">Ana Panel</h1>
      <p className="font-body-md text-on-surface-variant mb-xl">
        Hoş geldiniz, {personnel?.full_name} — {personnel?.role === "admin" ? "tüm birimler" : personnel?.departments?.name}
      </p>

      <div className="grid grid-cols-3 gap-lg">
        {cards.map(c => (
          <div key={c.slug} className="bg-surface-container-lowest rounded-lg shadow-sm p-lg space-y-md">
            <div className={`w-12 h-12 rounded-full ${c.bg} flex items-center justify-center ${c.color}`}>
              <span className="material-symbols-outlined text-[24px]">{c.icon}</span>
            </div>
            <div>
              <h2 className="font-headline-md text-body-lg text-on-surface">{c.label}</h2>
              <p className="font-body-md text-on-surface-variant">{c.stat}</p>
              <p className="font-label-sm text-outline">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {cards.length === 0 && (
        <p className="font-label-md text-on-surface-variant">Görüntülenecek birim yok.</p>
      )}
    </div>
  );
}
