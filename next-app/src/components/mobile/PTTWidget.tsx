"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { usePTT } from "@/hooks/usePTT";

// Positioned `absolute` (not `fixed`) to match BottomNav's own positioning inside the
// centered 430px shell in (mobile)/layout.tsx — `fixed` would anchor to the real
// viewport edge instead of the shell, misaligning on wider screens.
// bottom-32 (128px) clears BottomNav's h-28 (112px) with a visible gap above it.
export default function PTTWidget() {
  const pathname = usePathname();
  const { personnel } = useAuth();
  const { isGuvenlik, speaking, joined, activeChannel, startTalking, stopTalking } = usePTT();

  if (personnel?.departments?.slug !== "guvenlik") return null;
  if (pathname === "/ptt") return null;
  if (!isGuvenlik) return null;

  const isJoined = joined[activeChannel];

  return (
    <button
      onPointerDown={startTalking}
      onPointerUp={stopTalking}
      onPointerLeave={stopTalking}
      disabled={!isJoined}
      aria-label="Telsizde konuş"
      className={`absolute bottom-32 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center select-none transition-all active:scale-90 disabled:opacity-50 ${
        speaking ? "bg-red-600 shadow-lg shadow-red-300" : "bg-blue-800 shadow-lg shadow-blue-300"
      }`}
      style={{ touchAction: "none" }}
    >
      <span className="material-symbols-outlined text-white text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        mic
      </span>
    </button>
  );
}
