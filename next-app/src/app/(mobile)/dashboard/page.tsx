"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
interface GorevComm { id: string; title: string; content: string; priority: string; isRead: boolean }

interface ActiveShift {
  shift_code: string;
  name: string;
  start_time: string;
  end_time: string;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { personnel } = useAuth();
  const router = useRouter();
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [patrolStatus, setPatrolStatus] = useState({ completed: 0, total: 0, hasActive: false });
  const [pendingIncidents, setPendingIncidents] = useState(0);
  const [gorevler, setGorevler] = useState<GorevComm[]>([]);
  const [latestComm, setLatestComm] = useState<{ id: string; type: string; priority: string; title: string; content: string; isRead: boolean } | null>(null);
  const [unreadComms, setUnreadComms] = useState(0);
  const [loading, setLoading] = useState(true);
  const [helpModal, setHelpModal] = useState(false);
  const [helpColleagues, setHelpColleagues] = useState<{ id: string; full_name: string; phone: string | null }[]>([]);
  const [helpLoading, setHelpLoading] = useState(false);

  useEffect(() => {
    if (!personnel) return;
    if (personnel.role === "admin") { router.replace("/yonetici"); return; }
    if (personnel.role === "supervisor") { router.replace("/amir"); return; }
    loadDashboard();
  }, [personnel]);

  async function loadDashboard() {
    if (!personnel) return;
    const deptId = personnel.department_id;
    const pId = personnel.id;
    const today = toDateStr(new Date());

    const [assignmentRes, patrolRes] = await Promise.all([
      supabase
        .from("shift_assignments")
        .select("shift_code")
        .eq("personnel_id", pId)
        .eq("shift_date", today)
        .eq("status", "published")
        .maybeSingle(),
      supabase.from("patrols").select("*").eq("personnel_id", pId).eq("status", "active").limit(1).maybeSingle(),
    ]);

    // Lokasyondaki açık olay sayısı — incident_departments.status üzerinden
    if (personnel.location_id) {
      const { data: peers } = await supabase.from("personnel").select("id").eq("location_id", personnel.location_id);
      const peerIds = (peers || []).map((p: { id: string }) => p.id);
      if (peerIds.length > 0) {
        const { data: myIncs } = await supabase.from("incidents").select("id").in("reported_by", peerIds);
        const myIncIds = (myIncs || []).map((i: { id: string }) => i.id);
        if (myIncIds.length > 0) {
          const { count } = await supabase.from("incident_departments").select("id", { count: "exact", head: true }).in("incident_id", myIncIds).eq("status", "open");
          setPendingIncidents(count || 0);
        }
      }
    }

    if (assignmentRes.data?.shift_code) {
      const { data: typeData } = await supabase
        .from("shift_types")
        .select("name, start_time, end_time")
        .eq("department_id", deptId)
        .eq("code", assignmentRes.data.shift_code)
        .maybeSingle();
      if (typeData) {
        setShift({ shift_code: assignmentRes.data.shift_code, ...typeData });
      }
    }

    if (patrolRes.data) {
      setPatrolStatus({ completed: patrolRes.data.completed_checkpoints, total: patrolRes.data.total_checkpoints, hasActive: true });
    }
    // Görev iletişimleri (type = gorev)
    const locFilter = personnel.location_id
      ? `target_type.eq.all,and(target_type.eq.location,location_id.eq.${personnel.location_id})`
      : "target_type.eq.all";
    const { data: gorevComms } = await supabase.from("communications")
      .select("id, title, content, priority")
      .eq("department_id", deptId)
      .eq("type", "gorev")
      .or(locFilter)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(5);

    if (gorevComms && gorevComms.length > 0) {
      const { data: gorevReads } = await supabase.from("communication_reads")
        .select("communication_id")
        .eq("personnel_id", pId)
        .in("communication_id", gorevComms.map((g: any) => g.id));
      const readSet = new Set((gorevReads || []).map((r: any) => r.communication_id));
      setGorevler(gorevComms.map((g: any) => ({ ...g, isRead: readSet.has(g.id) })));
    }

    // Okunmamış iletişim sayısı
    const { data: allComms } = await supabase.from("communications")
      .select("id")
      .eq("department_id", deptId)
      .or(locFilter)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
    const commIds = (allComms || []).map((c: any) => c.id);
    if (commIds.length > 0) {
      const { data: myReads } = await supabase.from("communication_reads")
        .select("communication_id")
        .eq("personnel_id", pId)
        .in("communication_id", commIds);
      const readSet = new Set((myReads || []).map((r: any) => r.communication_id));
      setUnreadComms(commIds.length - readSet.size);

      // En son mesajı göster (önce okunmamış+acil)
      const { data: latest } = await supabase.from("communications")
        .select("id, type, priority, title, content")
        .eq("department_id", deptId)
        .or(locFilter)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) setLatestComm({ ...latest, isRead: readSet.has(latest.id) });
    }

    setLoading(false);
  }

  async function openHelpModal() {
    if (!personnel) return;
    setHelpModal(true);
    setHelpLoading(true);
    setHelpColleagues([]);
    const today = toDateStr(new Date());
    const { data: saData } = await supabase
      .from("shift_assignments")
      .select("personnel_id")
      .eq("location_id", personnel.location_id)
      .eq("shift_date", today)
      .eq("status", "published")
      .neq("personnel_id", personnel.id)
      .limit(20);
    if (saData && saData.length > 0) {
      const ids = saData.map((r: { personnel_id: string }) => r.personnel_id);
      const { data: pData } = await supabase
        .from("personnel")
        .select("id, full_name, phone")
        .in("id", ids);
      setHelpColleagues(pData || []);
    }
    setHelpLoading(false);
  }

  function sendHelpToColleague(phone: string) {
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const msg = `🚨 ACİL YARDIM ÇAĞRISI!\n\nGörevli: ${personnel?.full_name || "Güvenlik Personeli"}\nSaat: ${now}\n\nLütfen hemen iletişime geçin!`;
    const cleaned = phone.replace(/\s/g, "").replace(/^0/, "");
    window.open(`https://wa.me/90${cleaned}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  const name = personnel?.full_name || "Görevli";
  const dept = personnel?.departments?.name || "Güvenlik";
  const role = { admin: "Yönetici", supervisor: "Süpervizör", personel: "Personel" }[personnel?.role || "personel"];
  const patrolText = patrolStatus.total > 0 ? `${patrolStatus.completed}/${patrolStatus.total}` : "0/0";
  const patrolPercent = patrolStatus.total > 0 ? (patrolStatus.completed / patrolStatus.total) * 100 : 0;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-blue-800 text-[40px]">progress_activity</span></div>;
  }

  return (
    <div className="bg-[#f0f2ff] min-h-screen pb-28">
      {/* Gradyan Header */}
      <header className="sticky top-0 w-full z-40 h-16 flex justify-between items-center px-6"
        style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
          </div>
          <h1 className="text-lg font-bold text-white">Güvenlik Paneli</h1>
        </div>
        <Link href="/iletisim" className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors">
          <span className="material-symbols-outlined text-[20px]">forum</span>
          {unreadComms > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center px-1">
              {unreadComms > 9 ? "9+" : unreadComms}
            </span>
          )}
        </Link>
      </header>

      {/* Karşılama bandı */}
      <div className="px-6 py-4" style={{ background: "linear-gradient(135deg, #1A237E 0%, #3949AB 100%)" }}>
        <h2 className="text-xl font-bold text-white">Merhaba, {name.split(" ")[0]} 👋</h2>
        <p className="text-sm text-white/70 mt-0.5">{dept} • {role}</p>
      </div>
      {/* Dalga ayırıcı */}
      <div className="h-4 rounded-t-3xl -mt-1 bg-[#f0f2ff]" />

      <main className="px-6 space-y-6">
        {/* Status Cards */}
        <section className="space-y-3 -mt-2">
          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-[#3949AB] flex items-center gap-4">
            <div className="p-3 bg-indigo-100 rounded-xl text-indigo-700 flex-shrink-0">
              <span className="material-symbols-outlined">schedule</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bugünkü Vardiya</p>
              {shift ? (
                <>
                  <p className="text-xl font-bold text-gray-800 mt-0.5">{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{shift.name} · {shift.shift_code}</p>
                </>
              ) : (
                <p className="text-base font-semibold text-gray-400 mt-0.5">Bugün vardiya yok</p>
              )}
            </div>
            {shift && <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0">Aktif</span>}
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-[#00BCD4]">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-100 rounded-xl text-teal-700"><span className="material-symbols-outlined">route</span></div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Devriye Durumu</p>
                  <p className="text-xl font-bold text-gray-800">{patrolText}</p>
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${patrolPercent}%`, background: "linear-gradient(to right, #00BCD4, #3949AB)" }} />
            </div>
          </div>

          <Link href="/olaylar" className="bg-white p-5 rounded-2xl shadow-sm border-l-4 border-l-[#C62828] flex items-center gap-4 active:scale-[0.98] transition-all">
            <div className="p-3 bg-red-100 rounded-xl text-red-600 flex-shrink-0">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>report_problem</span>
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bölge Olayları</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">
                {pendingIncidents > 0 ? `${pendingIncidents} açık olay` : "Bekleyen olay yok"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {pendingIncidents > 0 && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">{pendingIncidents}</span>
              )}
              <span className="material-symbols-outlined text-gray-300 text-[20px]">chevron_right</span>
            </div>
          </Link>
        </section>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hızlı İşlemler</h3>
          <div className="space-y-3">
            <Link href="/devriye"
              className="flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all shadow-md shadow-indigo-200"
              style={{ background: "linear-gradient(135deg, #1A237E, #3949AB)" }}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
              {patrolStatus.hasActive ? "Devriyeye Devam Et" : "Devriye Başlat"}
            </Link>
            <Link href="/olay-bildir"
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-amber-600">edit_document</span>
              Olay Bildir
            </Link>
            <button
              onClick={openHelpModal}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all shadow-md shadow-rose-200 ring-4 ring-rose-100"
              style={{ background: "linear-gradient(135deg, #C62828, #E53935)" }}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>emergency_share</span>
              Yardım Çağır
            </button>
            <Link href="/vardiyalar"
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-sm font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-emerald-600">calendar_month</span>
              Vardiyam
            </Link>
          </div>
        </section>

        {/* Görevler */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Görevler</h3>
            <Link href="/iletisim" className="text-blue-800 text-sm font-semibold">Tümünü Gör</Link>
          </div>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            {gorevler.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Atanmış görev yok</p>
            ) : gorevler.map((g, i) => (
              <Link key={g.id} href="/iletisim">
                {i > 0 && <div className="h-px bg-gray-100 mx-6" />}
                <div className="p-4 flex items-center gap-4 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${g.isRead ? "bg-emerald-100" : "bg-amber-100"}`}>
                    <span className={`material-symbols-outlined text-[20px] ${g.isRead ? "text-emerald-600" : "text-amber-600"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                      {g.isRead ? "check_circle" : "assignment"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${g.isRead ? "text-gray-400 line-through" : "text-gray-800"}`}>{g.title}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{g.content}</p>
                  </div>
                  {!g.isRead && g.priority === "urgent" && (
                    <span className="flex-shrink-0 text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">Acil</span>
                  )}
                  {g.isRead && (
                    <span className="material-symbols-outlined text-emerald-400 text-[18px] flex-shrink-0">done_all</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Son İletişim */}
        {latestComm && (() => {
          const typeCfg: Record<string, { label: string; icon: string; gradient: string }> = {
            duyuru:  { label: "Duyuru",  icon: "campaign", gradient: "from-blue-700 to-blue-800" },
            gorev:   { label: "Görev",   icon: "assignment", gradient: "from-amber-600 to-amber-700" },
            talimat: { label: "Talimat", icon: "rule", gradient: "from-purple-700 to-purple-800" },
          };
          const cfg = typeCfg[latestComm.type] ?? typeCfg.duyuru;
          return (
            <Link href="/iletisim">
              <section className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${latestComm.priority === "urgent" ? "from-red-700 to-red-800" : cfg.gradient} p-5 active:scale-[0.98] transition-all`}>
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                <div className="absolute -bottom-6 -left-2 w-16 h-16 rounded-full bg-white/10" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{latestComm.priority === "urgent" ? "priority_high" : cfg.icon}</span>
                        {latestComm.priority === "urgent" ? "Acil" : cfg.label}
                      </span>
                      {!latestComm.isRead && (
                        <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
                      )}
                    </div>
                    <span className="material-symbols-outlined text-white/60 text-[18px]">chevron_right</span>
                  </div>
                  <h4 className="text-white font-bold text-base leading-tight">{latestComm.title}</h4>
                  <p className="text-white/80 text-sm mt-1 line-clamp-2">{latestComm.content}</p>
                  {latestComm.isRead ? (
                    <p className="text-white/50 text-[11px] mt-3 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">done_all</span> Okundu
                    </p>
                  ) : (
                    <p className="text-yellow-300 text-[11px] mt-3 font-semibold">Okumak için dokun →</p>
                  )}
                </div>
              </section>
            </Link>
          );
        })()}
      </main>

      {/* ── Yardım Çağır Modal ── */}
      {helpModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setHelpModal(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            {/* Kırmızı başlık */}
            <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-3 text-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #B71C1C, #E53935)" }}>
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>emergency_share</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Yardım Çağır</h2>
                <p className="text-sm text-white/80 mt-0.5">Vardiya arkadaşına WhatsApp mesajı gönder</p>
              </div>
            </div>

            {/* İçerik */}
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
              {/* Mesaj önizleme */}
              <div className="bg-red-50 rounded-2xl p-3.5 border border-red-100">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1.5">Gönderilecek Mesaj</p>
                <p className="text-sm text-red-800 leading-relaxed whitespace-pre-line">
                  {`🚨 ACİL YARDIM ÇAĞRISI!\n\nGörevli: ${personnel?.full_name || "Güvenlik Personeli"}\nSaat: ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}\n\nLütfen hemen iletişime geçin!`}
                </p>
              </div>

              {/* Kişi listesi */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Bugün Vardiyada Olanlar</p>
                {helpLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="material-symbols-outlined animate-spin text-red-400 text-[28px]">progress_activity</span>
                  </div>
                ) : helpColleagues.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl p-5 text-center">
                    <span className="material-symbols-outlined text-gray-300 text-[32px]">group_off</span>
                    <p className="text-sm text-gray-400 mt-2">Bugün vardiyada başka personel yok</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {helpColleagues.map(c => (
                      <div key={c.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3.5">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-red-500 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{c.full_name}</p>
                          <p className="text-xs text-gray-400">{c.phone ? c.phone : "Telefon yok"}</p>
                        </div>
                        {c.phone ? (
                          <button
                            onClick={() => sendHelpToColleague(c.phone!)}
                            className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-all"
                            style={{ background: "linear-gradient(135deg, #1B5E20, #2E7D32)" }}>
                            <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>whatsapp</span>
                          </button>
                        ) : (
                          <div className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-gray-200">
                            <span className="material-symbols-outlined text-gray-400 text-[20px]">phone_disabled</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 pb-6 pt-2 flex-shrink-0">
              <button onClick={() => setHelpModal(false)}
                className="w-full py-3.5 rounded-2xl text-gray-600 font-semibold bg-gray-100 active:scale-95 transition-all">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
