import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  MessageSquare,
  Users,
  Flag,
  UserX,
  Edit2,
  Check,
  Shield,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  ChatMessage,
  UserProfile,
  getOrCreateUserProfile,
  saveUserProfile,
  getBlockedUsers,
  blockUser,
  unblockUser,
  RealtimeChatClient,
} from '../services/chatService';

interface CommunityChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSupabaseModal: () => void;
}

const REGIONAL_MUNICIPALITIES = [
  'Chapecó',
  'Xanxerê',
  'Xaxim',
  'Concórdia',
  'Seara',
  'Pinhalzinho',
  'Maravilha',
  'São Miguel do Oeste',
  'Itapiranga (SC)',
  'Palmitos',
  'Cunha Porã',
  'São Lourenço do Oeste',
  'Abelardo Luz',
  'Joaçaba',
  'Nonoai (RS)',
  'Erechim (RS)',
  'Passo Fundo (RS)',
  'Pato Branco (PR)',
  'Francisco Beltrão (PR)',
  'Outro (Região Sul)',
];

export const CommunityChat: React.FC<CommunityChatProps> = ({
  isOpen,
  onClose,
  onOpenSupabaseModal,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [inputText, setInputText] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile>(getOrCreateUserProfile());
  const [blockedUsers, setBlockedUsers] = useState<string[]>(getBlockedUsers());
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempNickname, setTempNickname] = useState(userProfile.nickname);
  const [tempMunicipality, setTempMunicipality] = useState(userProfile.municipality);
  const [sendCooldown, setSendCooldown] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const chatClientRef = useRef<RealtimeChatClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize Realtime Client
  useEffect(() => {
    const client = new RealtimeChatClient();
    chatClientRef.current = client;

    client.connect({
      onInit: (initMessages, count) => {
        setMessages(initMessages);
        setOnlineCount(count);
      },
      onMessage: (newMsg) => {
        setMessages((prev) => {
          // Idempotency: avoid duplicates
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      },
      onPresence: (count) => {
        setOnlineCount(count);
      },
      onDelete: (deletedId) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      },
    });

    return () => {
      client.disconnect();
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSaveProfile = () => {
    const updated = saveUserProfile({
      nickname: tempNickname.trim() || userProfile.nickname,
      municipality: tempMunicipality,
    });
    setUserProfile(updated);
    setIsEditingProfile(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sendCooldown) return;

    setSendCooldown(true);
    setTimeout(() => setSendCooldown(false), 2000);

    const client = chatClientRef.current;
    if (client) {
      const res = await client.sendMessage(userProfile, inputText);
      if (res.success) {
        setInputText('');
      } else {
        setActionNotice(res.error || 'Erro ao enviar');
        setTimeout(() => setActionNotice(null), 3000);
      }
    }
  };

  const handleReport = async (msgId: string) => {
    if (chatClientRef.current) {
      await chatClientRef.current.reportMessage(msgId);
      setActionNotice('Mensagem denunciada para moderação.');
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleBlockUser = (userIdToBlock: string, nickname: string) => {
    const updated = blockUser(userIdToBlock);
    setBlockedUsers(updated);
    setActionNotice(`Usuário ${nickname} bloqueado nesta sessão.`);
    setTimeout(() => setActionNotice(null), 3000);
  };

  if (!isOpen) return null;

  // Filter out blocked users
  const visibleMessages = messages.filter((m) => !blockedUsers.includes(m.userId));

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-slate-950/95 backdrop-blur-md border-l border-slate-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 text-slate-200">
      {/* 1. Header */}
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <span>Chat Comunitário</span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800">
                Oeste SC
              </span>
            </h2>
            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>{onlineCount} conectados</span>
              <span>·</span>
              <span>{chatClientRef.current?.isUsingSupabase() ? 'Supabase' : 'Realtime WS'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSupabaseModal}
            className="p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition-colors"
            title="Configuração do Banco de Dados Supabase"
          >
            <Shield className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors"
            title="Fechar Chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. User Profile Bar */}
      <div className="p-3 bg-slate-900/50 border-b border-slate-800/80 shrink-0 text-xs">
        {isEditingProfile ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={tempNickname}
                onChange={(e) => setTempNickname(e.target.value)}
                maxLength={24}
                placeholder="Seu apelido"
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs focus:outline-hidden focus:border-cyan-400"
              />
              <select
                value={tempMunicipality}
                onChange={(e) => setTempMunicipality(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-hidden focus:border-cyan-400"
              >
                {REGIONAL_MUNICIPALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-medium flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Salvar</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="truncate">
              <span className="text-slate-400">Você: </span>
              <strong className="text-cyan-300 font-semibold">{userProfile.nickname}</strong>
              <span className="text-slate-500 text-[11px] ml-1">
                em {userProfile.municipality === 'Itapiranga (SC)' ? 'Itapiranga' : userProfile.municipality}
              </span>
            </div>
            <button
              onClick={() => {
                setTempNickname(userProfile.nickname);
                setTempMunicipality(userProfile.municipality);
                setIsEditingProfile(true);
              }}
              className="text-slate-400 hover:text-cyan-400 flex items-center gap-1 text-[11px] transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              <span>Alterar</span>
            </button>
          </div>
        )}
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="px-3 py-1.5 bg-cyan-950/80 border-b border-cyan-800/60 text-cyan-300 text-[11px] flex items-center justify-between">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-cyan-400">
            ✕
          </button>
        </div>
      )}

      {/* 3. Messages Feed */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
        {visibleMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
            <MessageSquare className="w-8 h-8 text-slate-700 mb-2" />
            <p>Nenhuma mensagem ainda.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Seja o primeiro a relatar o tempo em seu município!
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMe = msg.userId === userProfile.userId;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all group ${
                  isMe
                    ? 'bg-cyan-950/30 border-cyan-800/60 ml-3'
                    : 'bg-slate-900/80 border-slate-800 mr-3'
                }`}
              >
                {/* Meta row */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`font-semibold ${
                        isMe ? 'text-cyan-300' : 'text-slate-200'
                      }`}
                    >
                      {msg.nickname}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">
                      {msg.municipality === 'Itapiranga (SC)' ? 'Itapiranga' : msg.municipality}
                    </span>
                  </div>
                  <span className="font-mono text-slate-500 text-[10px] shrink-0">{timeStr}</span>
                </div>

                {/* Content */}
                <div className="text-slate-200 leading-relaxed break-words">{msg.content}</div>

                {/* Moderation / Safety Actions (Hover or tap) */}
                {!isMe && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
                    <button
                      onClick={() => handleReport(msg.id)}
                      className="hover:text-amber-400 flex items-center gap-1 transition-colors"
                      title="Denunciar mensagem por spam ou conteúdo inadequado"
                    >
                      <Flag className="w-2.5 h-2.5" />
                      <span>Denunciar</span>
                    </button>
                    <button
                      onClick={() => handleBlockUser(msg.userId, msg.nickname)}
                      className="hover:text-rose-400 flex items-center gap-1 transition-colors"
                      title="Bloquear este usuário e ocultar suas mensagens nesta sessão"
                    >
                      <UserX className="w-2.5 h-2.5" />
                      <span>Bloquear</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Input Area */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900/90 shrink-0">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={300}
            placeholder={`Como está o tempo em ${
              userProfile.municipality === 'Itapiranga (SC)' ? 'Itapiranga' : userProfile.municipality
            }?`}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sendCooldown}
            className="absolute right-1.5 p-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white rounded-lg transition-colors flex items-center justify-center"
            title="Enviar mensagem"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500 px-1">
          <span>{sendCooldown ? 'Aguarde 2s...' : 'Enter para enviar'}</span>
          <span>{inputText.length}/300</span>
        </div>
      </form>
    </aside>
  );
};
