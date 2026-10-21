// "Modo direto": o app busca as imagens do radar diretamente na Defesa Civil SC (SIFAP),
// sem precisar de um servidor intermediário. Usado no APK Android (Capacitor) e no app
// para Windows (Electron) quando VITE_API_BASE não está definido.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, apiUrl } from '../config';

const SIFAP_BASE = 'https://sifap.defesacivil.sc.gov.br/radarsc/rest/radar';
const SIFAP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://sifap.defesacivil.sc.gov.br/radarsc/',
  Accept: 'application/json, text/javascript, */*; q=0.01',
};

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const isElectron = (): boolean =>
  typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);

/** true quando o app deve falar direto com a Defesa Civil (sem backend próprio). */
export const DIRECT_MODE: boolean = !API_BASE && (isNative() || isElectron());

/** true quando existe um backend para o chat nativo (WebSocket). */
export const HAS_BACKEND: boolean = !DIRECT_MODE;

async function getJson(url: string): Promise<any> {
  if (isNative()) {
    const res = await CapacitorHttp.get({
      url,
      headers: SIFAP_HEADERS,
      responseType: 'json',
      connectTimeout: 10000,
      readTimeout: 10000,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Defesa Civil SC retornou código HTTP ${res.status}`);
    }
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const res = await fetch(url, { headers: { Accept: SIFAP_HEADERS.Accept } });
  if (!res.ok) throw new Error(`Defesa Civil SC retornou código HTTP ${res.status}`);
  return res.json();
}

async function getImageSrc(url: string): Promise<string> {
  if (isNative()) {
    const res = await CapacitorHttp.get({
      url,
      headers: SIFAP_HEADERS,
      responseType: 'blob',
      connectTimeout: 12000,
      readTimeout: 15000,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Imagem do radar retornou HTTP ${res.status}`);
    }
    const b64 = typeof res.data === 'string' ? res.data.replace(/\s/g, '') : '';
    if (!b64) throw new Error('Imagem do radar vazia');
    return `data:image/png;base64,${b64}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Imagem do radar retornou HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** Converte pixels pretos (ar limpo / sem eco) em transparência real, como o backend fazia. */
function makeTransparent(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas indisponível');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] <= 5 && d[i + 1] <= 5 && d[i + 2] <= 5) d[i + 3] = 0;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      } finally {
        if (src.startsWith('blob:')) URL.revokeObjectURL(src);
      }
    };
    img.onerror = () => reject(new Error('Falha ao decodificar imagem do radar'));
    img.src = src;
  });
}

const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const utcFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function parseSifapFilename(filename: string) {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    return {
      filename,
      timestamp: Date.now(),
      utcDisplay: 'Desconhecido',
      brtDisplay: 'Desconhecido',
      ageMinutes: 0,
    };
  }
  const [, year, month, day, hour, min, sec] = match;
  const utcDate = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
  const timestamp = utcDate.getTime();
  return {
    filename,
    timestamp,
    utcIso: utcDate.toISOString(),
    utcDisplay: `${utcFormatter.format(utcDate)} UTC`,
    brtDisplay: `${brtFormatter.format(utcDate)} BRT (UTC-3)`,
    ageMinutes: Math.max(0, Math.floor((Date.now() - timestamp) / 60000)),
  };
}

const imageCache = new Map<string, string>();

async function fetchLatestDirect(radar: string, prod: string) {
  const list = await getJson(
    `${SIFAP_BASE}/getUltimasImagens?prod=${encodeURIComponent(prod)}&radar=${encodeURIComponent(radar)}&data=`
  );
  if (!Array.isArray(list) || list.length === 0) {
    return { success: false, message: 'Nenhuma observação recente retornada pela Defesa Civil SC.' };
  }
  const latestName = [...list].sort().pop() as string;
  const latestFrame: any = parseSifapFilename(latestName);

  let imageUrl = imageCache.get(latestName);
  if (!imageUrl) {
    const raw = await getImageSrc(
      `${SIFAP_BASE}/getImagem?prod=${encodeURIComponent(prod)}&radar=${encodeURIComponent(radar)}&file=${encodeURIComponent(latestName)}`
    );
    try {
      imageUrl = await makeTransparent(raw);
    } catch {
      imageUrl = raw;
    }
    imageCache.set(latestName, imageUrl);
    // mantém só as últimas imagens na memória
    while (imageCache.size > 6) {
      imageCache.delete(imageCache.keys().next().value as string);
    }
  }
  latestFrame.imageUrl = imageUrl;
  return { success: true, latestFrame, frameCount: list.length };
}

/** Busca a varredura mais recente — direto na Defesa Civil (app) ou via backend (web). */
export async function fetchLatestRadarData(radar = 'CHP', prod = '0'): Promise<any> {
  if (DIRECT_MODE) return fetchLatestDirect(radar, prod);

  const res = await fetch(apiUrl(`/api/radar/sc/latest?radar=${radar}&prod=${prod}`));
  if (!res.ok) throw new Error(`Servidor retornou status ${res.status}`);
  const data = await res.json();
  if (data?.latestFrame?.imageUrl) {
    data.latestFrame.imageUrl = apiUrl(data.latestFrame.imageUrl);
  }
  return data;
}
