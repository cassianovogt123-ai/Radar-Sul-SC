import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'chat_messages.json');

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

class ChatStore {
  private messages: ChatMessage[] = [];
  private rateLimitMap = new Map<string, number>();

  constructor() {
    this.ensureDataDir();
    this.loadMessages();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadMessages() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.messages = parsed;
        }
      } else {
        // Seed initial welcoming message to confirm chat is live
        this.messages = [
          {
            id: 'msg_welcome_1',
            userId: 'system_chapeco',
            nickname: 'Moderador Radar',
            municipality: 'Chapecó',
            content: 'Bem-vindo ao canal meteorológico de Chapecó e região Oeste! Compartilhe aqui observações de chuva, granizo, vento e tempo local.',
            timestamp: Date.now() - 3600000,
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            reportsCount: 0
          }
        ];
        this.saveMessages();
      }
    } catch (err) {
      console.warn('[ChatStore] Error loading messages from disk:', err);
      this.messages = [];
    }
  }

  private saveMessages() {
    try {
      this.ensureDataDir();
      // Keep up to 500 recent messages
      if (this.messages.length > 500) {
        this.messages = this.messages.slice(this.messages.length - 500);
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.messages, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ChatStore] Error saving messages to disk:', err);
    }
  }

  public getRecentMessages(limit = 60): ChatMessage[] {
    // Return only messages that haven't been heavily flagged by community (reports < 3)
    const valid = this.messages.filter((m) => m.reportsCount < 3);
    return valid.slice(-limit);
  }

  public addMessage(
    userId: string,
    rawNickname: string,
    rawMunicipality: string,
    rawContent: string
  ): { success: boolean; message?: ChatMessage; error?: string } {
    // 1. Anti-Spam: Rate Limit (1 message every 2 seconds per userId)
    const now = Date.now();
    const lastSent = this.rateLimitMap.get(userId) || 0;
    if (now - lastSent < 2000) {
      return { success: false, error: 'Aguarde 2 segundos antes de enviar outra mensagem.' };
    }

    // 2. Validation & Sanitization
    const nickname = (rawNickname || 'Morador').trim().slice(0, 24);
    const municipality = (rawMunicipality || 'Chapecó').trim().slice(0, 32);
    const content = (rawContent || '').trim().slice(0, 300);

    if (content.length === 0) {
      return { success: false, error: 'A mensagem não pode estar vazia.' };
    }
    if (content.length > 300) {
      return { success: false, error: 'A mensagem excede o limite de 300 caracteres.' };
    }

    // Basic sanitization of script tags / HTML injection
    const sanitizedContent = content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const newMsg: ChatMessage = {
      id: `msg_${now}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      nickname,
      municipality,
      content: sanitizedContent,
      timestamp: now,
      createdAt: new Date(now).toISOString(),
      reportsCount: 0
    };

    this.messages.push(newMsg);
    this.rateLimitMap.set(userId, now);
    this.saveMessages();

    return { success: true, message: newMsg };
  }

  public reportMessage(messageId: string): { success: boolean; hidden: boolean } {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) {
      return { success: false, hidden: false };
    }

    msg.reportsCount = (msg.reportsCount || 0) + 1;
    this.saveMessages();
    return { success: true, hidden: msg.reportsCount >= 3 };
  }
}

export const chatStore = new ChatStore();
