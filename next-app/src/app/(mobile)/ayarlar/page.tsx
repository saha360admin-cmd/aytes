"use client";

import { useAuth } from "@/context/AuthContext";
import { LogOut, UserCircle, Building2, Shield } from "lucide-react";

export default function AyarlarPage() {
  const { personnel, signOut } = useAuth();
  if (!personnel) return null;

  const roleLabel: Record<string, string> = { admin: "Yönetici", supervisor: "Süpervizör", personel: "Personel" };

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg px-lg py-md">
        <h2 className="text-[24px] font-semibold text-on-surface">Ayarlar</h2>
      </header>
      <main className="px-lg space-y-lg">
        <div className="bg-surface-container-lowest rounded-xl p-lg shadow-sm flex items-center gap-md">
          <div className="w-16 h-16 rounded-full bg-primary-fixed flex items-center justify-center">
            <UserCircle size={36} className="text-primary" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-on-surface">{personnel.full_name}</p>
            <p className="text-[14px] text-on-surface-variant">{personnel.email}</p>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm divide-y divide-outline-variant">
          <div className="flex items-center gap-md p-lg">
            <Building2 size={20} className="text-on-surface-variant" />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-on-surface">Departman</p>
              <p className="text-[12px] text-on-surface-variant">{personnel.departments?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-md p-lg">
            <Shield size={20} className="text-on-surface-variant" />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-on-surface">Rol</p>
              <p className="text-[12px] text-on-surface-variant">{roleLabel[personnel.role]}</p>
            </div>
          </div>
        </div>

        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-sm bg-error text-on-error px-lg py-md rounded-full hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 active:scale-95"
        >
          <LogOut size={20} />
          <span className="text-[14px] font-semibold">Çıkış Yap</span>
        </button>
      </main>
    </div>
  );
}
