// Aviso do sistema (barra de notificações do Android) para quando o app está aberto
// mas fora da tela: o som do app pode não tocar em segundo plano, a notificação toca.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const native = Capacitor.isNativePlatform();
let nextId = Math.floor(Date.now() / 1000) % 100000;

/** Pede permissão de notificação (Android 13+). Chamar quando o usuário ativa o alerta. */
export async function enableSystemNotifications(): Promise<void> {
  if (!native) return;
  try {
    await LocalNotifications.requestPermissions();
    await ensureExtremeChannel();
  } catch {
    /* sem permissão: segue só com o som dentro do app */
  }
}

/** Mostra a notificação só se o app não estiver na tela (na tela, o som e o mapa já avisam). */
export function notifyIfHidden(title: string, body: string): void {
  if (!native || !document.hidden) return;
  LocalNotifications.schedule({ notifications: [{ id: nextId++, title, body }] }).catch(() => {});
}

/**
 * Canal "Alerta extremo" (Android 8+): usado pelo aviso com o app fechado
 * (src/background/alertas.ts) quando a Defesa Civil ou o INMET emitem alerta de severidade extrema.
 * Importância máxima = aparece por cima da tela, com som e vibração.
 */
export async function ensureExtremeChannel(): Promise<void> {
  if (!native || Capacitor.getPlatform() !== 'android') return;
  try {
    await LocalNotifications.createChannel({
      id: 'alerta-extremo',
      name: 'Alerta extremo',
      description: 'Alertas oficiais de severidade extrema (Defesa Civil / INMET), mesmo com o app fechado',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#FF1744',
    });
  } catch {
    /* sem canal: o aviso extremo cai no canal padrão */
  }
}
