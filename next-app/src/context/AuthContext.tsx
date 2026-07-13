"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { registerPushNotifications } from "@/lib/pushRegister";
import type { Session } from "@supabase/supabase-js";

interface Personnel {
  id: string;
  auth_id: string;
  department_id: string;
  location_id: string | null;
  full_name: string;
  email: string;
  role: "admin" | "supervisor" | "personel";
  status: string;
  position: string | null;
  departments: { id: string; name: string; slug: string; icon: string; color: string } | null;
  locations: { id: string; name: string } | null;
}

interface AuthContextType {
  session: Session | null;
  personnel: Personnel | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, departmentSlug: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [personnel, setPersonnel] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(true);
  const pushRegisteredFor = useRef<string | null>(null);

  async function fetchPersonnel(userId: string) {
    const { data } = await supabase
      .from("personnel")
      .select("*, departments(*), locations(id, name)")
      .eq("auth_id", userId)
      .single();
    setPersonnel(data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchPersonnel(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchPersonnel(session.user.id);
      else setPersonnel(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Personel giriş yaptıktan sonra bir kez push token kaydı yapılır — her
  // personnel objesi yeniden fetch edildiğinde (ör. profil güncellemesi)
  // tekrar tetiklenmesin diye pushRegisteredFor ref'i ile aynı kişi için
  // sadece bir kez çalıştırılır.
  useEffect(() => {
    if (!personnel || pushRegisteredFor.current === personnel.id) return;
    pushRegisteredFor.current = personnel.id;
    registerPushNotifications(personnel.id);
  }, [personnel]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string, fullName: string, departmentSlug: string) {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;

    const { data: dept } = await supabase
      .from("departments")
      .select("id")
      .eq("slug", departmentSlug)
      .single();

    if (dept && authData.user) {
      await supabase.from("personnel").insert({
        auth_id: authData.user.id,
        department_id: dept.id,
        full_name: fullName,
        email,
        role: "personel",
      });
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPersonnel(null);
  }

  return (
    <AuthContext.Provider value={{ session, personnel, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
