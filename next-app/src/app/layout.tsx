import type { Metadata, Viewport } from "next";
import { Quicksand, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "AYTES",
  description: "Personel Yönetim Sistemi",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AYTES" },
};

export const viewport: Viewport = {
  themeColor: "#0058be",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${quicksand.variable} ${jakarta.variable} h-full`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- root layout is the single global entry point (App Router equivalent of pages/_document), so this is not a per-page font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full font-quicksand">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
