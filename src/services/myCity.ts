// "Minha cidade": o município onde o usuário mora. Só ele recebe o aviso de tempestade severa
// com o app fechado. Fica guardado no aparelho e é repassado ao aviso em segundo plano (Android).
import { Capacitor } from '@capacitor/core';
import { BackgroundRunner } from '@capacitor/background-runner';

export const DEFAULT_MY_CITY = 'Itapiranga';
const KEY = 'vogt.minhaCidade';

export function getMyCity(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_MY_CITY;
  } catch {
    return DEFAULT_MY_CITY;
  }
}

/** Repassa a cidade ao aviso em segundo plano. Sem await na tela: com o app aberto a chamada pode demorar. */
export function syncMyCity(name = getMyCity()): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  BackgroundRunner.dispatchEvent({ label: 'br.com.radarchapeco.alertas', event: 'definirCidade', details: { cidade: name } }).catch(() => {});
}

export function setMyCity(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* modo privado: vale só nesta sessão */
  }
  syncMyCity(name);
}
