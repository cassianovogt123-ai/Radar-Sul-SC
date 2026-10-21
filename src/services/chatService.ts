import { apiUrl, wsUrl } from '../config';
import { HAS_BACKEND } from './radarDirect';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  municipality: string;
  content: string;
  timestamp: number;
  createdAt: string;
  reportsCount: number;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  municipality: string;
}

const STORAGE_KEY_PROFILE = 'radar_chapeco_chat_profile';
const STORAGE_KEY_BLOCKED = 'radar_chapeco_chat_blocked_users';

export function getOrCreateUserProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.userId && parsed.nickname && parsed.municipality) {
        return parsed;
      }
    }
  } catch (err) {
    // ignore
  }

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const newProfile: UserProfile = {
    userId: `user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    nickname: `Observador_${randomSuffix}`,
    municipality: 'Chapecó',
  };

  try {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(newProfile));
  } catch (err) {
    // ignore
  }

  return newProfile;
}

export function saveUserProfile(profile: Partial<UserProfile>): UserProfile {
  const current = getOrCreateUserProfile();
  const updated: UserProfile = {
    ...current,
    ...profile,
    nickname: (profile.nickname || current.nickname).trim().slice(0, 24),
    municipality: (profile.municipality || current.municipality).trim().slice(0, 32),
  };

  try {
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(updated));
  } catch (err) {
    // ignore
  }

  return updated;
}

export function getBlockedUsers(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BLOCKED);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    // ignore
  }
  return [];
}

export function blockUser(userIdToBlock: string): string[] {
  const current = getBlockedUsers();
  if (!current.includes(userIdToBlock)) {
    const updated = [...current, userIdToBlock];
    try {
      localStorage.setItem(STORAGE_KEY_BLOCKED, JSON.stringify(updated));
    } catch (err) {
      // ignore
    }
    return updated;
  }
  return current;
}

export function unblockUser(userIdToUnblock: string): string[] {
  const current = getBlockedUsers();
  const updated = current.filter((id) => id !== userIdToUnblock);
  try {
    localStorage.setItem(STORAGE_KEY_BLOCKED, JSON.stringify(updated));
  } catch (err) {
    // ignore
  }
  return updated;
}

// Client Manager for Realtime Connection (Supabase or Native WebSocket)
export class RealtimeChatClient {
  private supabase: SupabaseClient | null = null;
  private ws: WebSocket | null = null;
  private onMessageCallback: ((msg: ChatMessage) => void) | null = null;
  private onInitCallback: ((messages: ChatMessage[], onlineCount: number) => void) | null = null;
  private onPresenceCallback: ((count: number) => void) | null = null;
  private onDeleteCallback: ((messageId: string) => void) | null = null;
  private isConnecting = false;
  private reconnectTimer: any = null;

  constructor() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey);
      } catch (err) {
        console.warn('Could not initialize Supabase client:', err);
      }
    }
  }

  public isUsingSupabase(): boolean {
    return this.supabase !== null;
  }

  public connect(handlers: {
    onInit: (messages: ChatMessage[], onlineCount: number) => void;
    onMessage: (msg: ChatMessage) => void;
    onPresence: (count: number) => void;
    onDelete: (messageId: string) => void;
  }) {
    this.onInitCallback = handlers.onInit;
    this.onMessageCallback = handlers.onMessage;
    this.onPresenceCallback = handlers.onPresence;
    this.onDeleteCallback = handlers.onDelete;

    if (this.supabase) {
      this.connectSupabase();
    } else {
      this.connectNativeWebSocket();
    }
  }

  private async connectSupabase() {
    if (!this.supabase) return;

    try {
      // 1. Initial messages query
      const { data, error } = await this.supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(60);

      if (!error && data) {
        const formatted: ChatMessage[] = data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          nickname: d.nickname,
          municipality: d.municipality,
          content: d.content,
          timestamp: new Date(d.created_at).getTime(),
          createdAt: d.created_at,
          reportsCount: d.reports_count || 0,
        }));
        this.onInitCallback?.(formatted, 1);
      }

      // 2. Realtime Channel Subscription
      this.supabase
        .channel('public:chat_messages')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const d = payload.new;
            const newMsg: ChatMessage = {
              id: d.id,
              userId: d.user_id,
              nickname: d.nickname,
              municipality: d.municipality,
              content: d.content,
              timestamp: new Date(d.created_at).getTime(),
              createdAt: d.created_at,
              reportsCount: d.reports_count || 0,
            };
            this.onMessageCallback?.(newMsg);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const d = payload.new;
            if (d.reports_count >= 3) {
              this.onDeleteCallback?.(d.id);
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Supabase realtime error, falling back to local server:', err);
      this.connectNativeWebSocket();
    }
  }

  private connectNativeWebSocket() {
    // Sem servidor próprio (APK/Windows em modo direto) não há WebSocket nativo:
    // o chat só funciona se o Supabase estiver configurado no build.
    if (!HAS_BACKEND) {
      this.onInitCallback?.([], 1);
      return;
    }
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const ws = new WebSocket(wsUrl('/ws/chat'));

      ws.onopen = () => {
        this.isConnecting = false;
        this.ws = ws;
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'chat:init') {
            this.onInitCallback?.(payload.messages, payload.onlineCount);
          } else if (payload.type === 'chat:message') {
            this.onMessageCallback?.(payload.message);
          } else if (payload.type === 'presence:update') {
            this.onPresenceCallback?.(payload.onlineCount);
          } else if (payload.type === 'chat:deleted') {
            this.onDeleteCallback?.(payload.messageId);
          }
        } catch (err) {
          // ignore
        }
      };

      ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        // Auto-reconnect after 3 seconds
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          this.connectNativeWebSocket();
        }, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      this.isConnecting = false;
    }
  }

  public async sendMessage(
    profile: UserProfile,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    const trimmed = content.trim();
    if (!trimmed) return { success: false, error: 'Mensagem vazia' };

    // If Supabase is active
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('chat_messages').insert([
          {
            user_id: profile.userId,
            nickname: profile.nickname,
            municipality: profile.municipality,
            content: trimmed,
          },
        ]);
        if (error) throw error;
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Erro ao enviar via Supabase' };
      }
    }

    // If native WebSocket is ready
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'chat:send',
          userId: profile.userId,
          nickname: profile.nickname,
          municipality: profile.municipality,
          content: trimmed,
        })
      );
      return { success: true };
    }

    if (!HAS_BACKEND) {
      return { success: false, error: 'Chat indisponível nesta versão (requer Supabase configurado).' };
    }

    // Fallback: POST via HTTP REST API
    try {
      const res = await fetch(apiUrl('/api/chat/messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          nickname: profile.nickname,
          municipality: profile.municipality,
          content: trimmed,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error || 'Erro ao enviar mensagem' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Falha na conexão com o servidor' };
    }
  }

  public async reportMessage(messageId: string): Promise<boolean> {
    if (this.supabase) {
      try {
        await this.supabase.rpc('report_message', { message_id: messageId });
        return true;
      } catch (err) {
        // Fallback update
        try {
          await this.supabase
            .from('chat_messages')
            .update({ reports_count: 1 })
            .eq('id', messageId);
          return true;
        } catch {
          return false;
        }
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'chat:report', messageId }));
      return true;
    }

    try {
      const res = await fetch(apiUrl(`/api/chat/messages/${encodeURIComponent(messageId)}/report`), {
        method: 'POST',
      });
      const data = await res.json();
      return data.success;
    } catch {
      return false;
    }
  }

  public disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
