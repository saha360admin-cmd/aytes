"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AmirPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/yonetici");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2ff]">
      <span className="material-symbols-outlined animate-spin text-[#3949AB] text-[40px]">progress_activity</span>
    </div>
  );
}
