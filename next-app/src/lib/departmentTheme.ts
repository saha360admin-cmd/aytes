import type { CSSProperties } from "react";

export interface DepartmentDecorativeIcon {
  icon: string;
  size: number;
  opacity: number;
  style: CSSProperties;
}

export interface DepartmentHeaderTheme {
  gradient: string;
  icon: string;
  title: string;
  dotColor: string;
  decorativeColor?: string;
  decorative?: DepartmentDecorativeIcon[];
}

// (mobile)/yonetici/page.tsx içindeki isTeknik/isTemizlik/isGuvenlik
// header temalarıyla birebir aynı değerler — tek bir yerden paylaşılıp
// diğer sayfalara da uygulanabilsin diye buraya çıkarıldı.
const DEPARTMENT_HEADER_THEMES: Record<string, DepartmentHeaderTheme> = {
  teknik: {
    gradient: "linear-gradient(135deg, #263238 0%, #37474F 55%, #455A64 100%)",
    icon: "settings",
    title: "Ay-Tek",
    dotColor: "bg-amber-400",
    decorativeColor: "#FDD835",
  },
  temizlik: {
    gradient: "linear-gradient(135deg, #00695C 0%, #00897B 55%, #26A69A 100%)",
    icon: "cleaning_services",
    title: "AY-TEM",
    dotColor: "bg-lime-300",
    decorativeColor: "#B2FF59",
  },
  guvenlik: {
    gradient: "linear-gradient(135deg, #0D47A1 0%, #1565C0 55%, #1E88E5 100%)",
    icon: "shield_person",
    title: "AY-GÜV",
    dotColor: "bg-amber-300",
    decorativeColor: "#90CAF9",
    decorative: [
      { icon: "shield_person", size: 64, opacity: 0.22, style: { right: "-6px", bottom: "-14px" } },
      { icon: "security", size: 30, opacity: 0.3, style: { right: "40px", bottom: "4px" } },
      { icon: "gpp_good", size: 20, opacity: 0.35, style: { right: "14px", bottom: "34px" } },
    ],
  },
};

const DEFAULT_HEADER_THEME: DepartmentHeaderTheme = {
  gradient: "linear-gradient(135deg, #1A237E 0%, #283593 100%)",
  icon: "shield",
  title: "AYTES",
  dotColor: "bg-emerald-400",
};

export function getDepartmentHeaderTheme(slug: string | undefined | null): DepartmentHeaderTheme {
  return (slug && DEPARTMENT_HEADER_THEMES[slug]) || DEFAULT_HEADER_THEME;
}
