"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ClipboardList } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned: { full_name: string } | null;
}

export default function GorevlerPage() {
  const { personnel } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!personnel) return;
    supabase
      .from("tasks")
      .select("*, assigned:assigned_to(full_name)")
      .eq("department_id", personnel.department_id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTasks(data || []));
  }, [personnel]);

  const statusLabels: Record<string, string> = { pending: "Bekliyor", in_progress: "Devam Ediyor", completed: "Tamamlandı", cancelled: "İptal" };
  const priorityLabels: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg px-lg py-md">
        <h2 className="text-[24px] font-semibold text-on-surface">Görevler</h2>
      </header>
      <main className="px-lg space-y-sm">
        {tasks.length === 0 ? (
          <p className="text-on-surface-variant text-center py-xxl">Henüz görev yok</p>
        ) : (
          tasks.map(t => (
            <div key={t.id} className="bg-surface-container-lowest rounded-xl p-lg shadow-sm space-y-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-sm">
                  <ClipboardList size={18} className={t.priority === "urgent" ? "text-error" : t.priority === "high" ? "text-tertiary" : "text-primary"} />
                  <p className="text-[14px] font-semibold text-on-surface">{t.title}</p>
                </div>
                <span className={`px-sm py-xs rounded-full text-[12px] font-semibold ${
                  t.status === "completed" ? "bg-secondary-fixed text-on-secondary-fixed" :
                  t.status === "in_progress" ? "bg-tertiary-fixed text-on-tertiary-fixed" :
                  "bg-primary-fixed text-on-primary-fixed"
                }`}>{statusLabels[t.status]}</span>
              </div>
              {t.description && <p className="text-on-surface-variant text-[14px] line-clamp-2">{t.description}</p>}
              <div className="flex items-center gap-md text-[12px] text-on-surface-variant">
                <span>Öncelik: {priorityLabels[t.priority]}</span>
                <span>{t.assigned?.full_name || "Atanmadı"}</span>
                {t.due_date && <span>Son: {new Date(t.due_date).toLocaleDateString("tr-TR")}</span>}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
