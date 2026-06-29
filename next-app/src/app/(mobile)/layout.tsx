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
      <div className="min-h-screen bg-gray-100 flex items-start justify-center">
        <div className="w-full max-w-[430px] min-h-screen bg-background shadow-2xl flex items-center justify-center mx-auto">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center">
      <div className="w-full max-w-[430px] min-h-screen bg-background text-on-surface shadow-2xl relative mx-auto pb-[80px]">
        {children}
        <BottomNav />
      </div>
    </div>
  );
}
