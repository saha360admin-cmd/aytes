"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

export type PTTChannelKey = "genel" | "mudurluk";

const CHANNEL_NAMES: Record<PTTChannelKey, string> = {
  genel: "aytes-genel",
  mudurluk: "aytes-genel-mudurluk",
};

const CHANNEL_LABELS: Record<PTTChannelKey, string> = {
  genel: "Genel",
  mudurluk: "Müdürlük",
};

// Agora numeric UIDs must fit in a uint32, but personnel.id is a uuid string — hash it down.
function hashToUid(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  }
  return hash === 0 ? 1 : hash;
}

interface ManagerState {
  connecting: boolean;
  joined: Partial<Record<PTTChannelKey, boolean>>;
  participantCounts: Record<PTTChannelKey, number>;
  activeChannel: PTTChannelKey;
  speaking: boolean;
  error: string | null;
}

type Listener = () => void;

const initialState: ManagerState = {
  connecting: false,
  joined: {},
  participantCounts: { genel: 0, mudurluk: 0 },
  activeChannel: "genel",
  speaking: false,
  error: null,
};

// Module-level singleton: the PTT page and the floating widget both call usePTT(), but
// must share one real Agora connection rather than each opening a redundant one. Since
// the widget never renders on /ptt, only one consumer is normally mounted at a time, but
// the refCount guards the brief overlap during route transitions too.
class PTTManager {
  private clients: Partial<Record<PTTChannelKey, IAgoraRTCClient>> = {};
  private micTrack: IMicrophoneAudioTrack | null = null;
  private refCount = 0;
  private listeners = new Set<Listener>();
  private state: ManagerState = initialState;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private setState(patch: Partial<ManagerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  setActiveChannel(channel: PTTChannelKey) {
    if (this.state.speaking || this.state.activeChannel === channel) return;
    this.setState({ activeChannel: channel });
  }

  async connect(personnelId: string, channels: PTTChannelKey[]) {
    this.refCount += 1;
    if (this.state.connecting || channels.every((c) => this.state.joined[c])) return;
    this.setState({ connecting: true, error: null });

    try {
      const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
      const uid = hashToUid(personnelId);

      for (const channel of channels) {
        if (this.clients[channel]) continue;
        const channelName = CHANNEL_NAMES[channel];

        const { data, error } = await supabase.functions.invoke<{ token: string }>("agora-token", {
          body: { channelName, uid },
        });
        if (error || !data?.token) throw new Error("Telsiz kanalına bağlanılamadı (token alınamadı)");

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        client.on("user-joined", () => this.bumpCount(channel, 1));
        client.on("user-left", () => this.bumpCount(channel, -1));

        await client.join(AGORA_APP_ID, channelName, data.token, uid);
        this.clients[channel] = client;
        this.setState({ joined: { ...this.state.joined, [channel]: true } });
      }
    } catch (err) {
      this.setState({ error: err instanceof Error ? err.message : "Bağlantı hatası" });
    } finally {
      this.setState({ connecting: false });
    }
  }

  private bumpCount(channel: PTTChannelKey, delta: number) {
    const counts = { ...this.state.participantCounts };
    counts[channel] = Math.max(0, counts[channel] + delta);
    this.setState({ participantCounts: counts });
  }

  async startTalking() {
    const client = this.clients[this.state.activeChannel];
    if (!client || this.state.speaking) return;
    try {
      if (!this.micTrack) {
        const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
        this.micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }
      await client.publish([this.micTrack]);
      this.setState({ speaking: true });
    } catch (err) {
      this.setState({ error: err instanceof Error ? err.message : "Mikrofona erişilemedi" });
    }
  }

  async stopTalking() {
    const client = this.clients[this.state.activeChannel];
    if (!this.state.speaking) return;
    try {
      if (client && this.micTrack) await client.unpublish([this.micTrack]);
    } finally {
      this.setState({ speaking: false });
    }
  }

  async disconnect() {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return; // another mounted consumer still needs the connection

    if (this.state.speaking) await this.stopTalking();
    if (this.micTrack) {
      this.micTrack.close();
      this.micTrack = null;
    }
    for (const key of Object.keys(this.clients) as PTTChannelKey[]) {
      const client = this.clients[key];
      if (client) {
        try { await client.leave(); } catch { /* already disconnected */ }
      }
      delete this.clients[key];
    }
    this.setState(initialState);
  }
}

const manager = new PTTManager();

export function usePTT() {
  const { personnel } = useAuth();
  const isGuvenlik = personnel?.departments?.slug === "guvenlik";
  const hasMudurluk = Boolean(isGuvenlik && personnel?.locations?.name === "Genel Müdürlük");

  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (!isGuvenlik || !personnel) return;
    const channels: PTTChannelKey[] = hasMudurluk ? ["genel", "mudurluk"] : ["genel"];
    wasConnectedRef.current = true;
    manager.connect(personnel.id, channels);

    // Hard requirement: leave channel(s) and dispose the local audio track on unmount.
    return () => {
      if (wasConnectedRef.current) {
        wasConnectedRef.current = false;
        manager.disconnect();
      }
    };
  }, [isGuvenlik, hasMudurluk, personnel]);

  const startTalking = useCallback(() => manager.startTalking(), []);
  const stopTalking = useCallback(() => manager.stopTalking(), []);
  const setActiveChannel = useCallback((c: PTTChannelKey) => manager.setActiveChannel(c), []);

  return {
    isGuvenlik,
    hasMudurluk,
    activeChannel: state.activeChannel,
    activeChannelLabel: CHANNEL_LABELS[state.activeChannel],
    setActiveChannel,
    speaking: state.speaking,
    connecting: state.connecting,
    joined: state.joined,
    participantCount: state.participantCounts[state.activeChannel],
    error: state.error,
    startTalking,
    stopTalking,
  };
}
