"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import BottomNav from "@/components/mobile/BottomNav";
import { Loader2 } from "lucide-react";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const { session, personnel, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  if (loading || (!loading && session && !personnel)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="relative min-h-screen pb-[80px] translate-x-0">
      {children}
      <BottomNav />
    </div>
  );
}
