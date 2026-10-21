import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRadarPngTransparent } from './server/pngTransparent.ts';

dotenv.config();

// Defesa Civil de Santa Catarina (sifap.defesacivil.sc.gov.br) uses ICP-Brasil certificates
// which are standard in Brazilian government domains but not in standard Node.js root bundles.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: the Android app (Capacitor) loads from https://localhost and calls this backend cross-origin.
// Radar data is public; set CORS_ORIGIN to a specific origin to restrict it.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use((req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// In-memory cache for radar queries to prevent overloading external meteorological services
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const queryCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 45 * 1000; // 45 seconds

function getCached<T>(key: string): T | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T) {
  queryCache.set(key, { data, timestamp: Date.now() });
}

// Extents according to official Defesa Civil SC SIFAP application:
// [minLon, minLat, maxLon, maxLat]
export const SIFAP_RADAR_METADATA = {
  CHP: {
    code: 'CHP',
    name: 'Radar Chapecó (Oeste Catarinense)',
    operator: 'Defesa Civil de Santa Catarina / SIFAP / Epagri CIRAM',
    location: 'Morro da Cruz, Chapecó - SC, Brasil',
    coordinates: { lat: -27.0968, lon: -52.6180 },
    band: 'Banda S/C Doppler Polarimétrico',
    rangeKm: 250,
    minLon: -55.0710069,
    minLat: -29.2106056,
    maxLon: -50.1335368,
    maxLat: -24.8625699,
    leafletBounds: [
      [-29.2106056, -55.0710069],
      [-24.8625699, -50.1335368]
    ] as [[number, number], [number, number]],
    supportedProducts: [
      { id: '0', name: 'CAPPI 2km', description: 'Corte horizontal a 2.000m de altitude (ideal para precipitação)' },
      { id: '1', name: 'CAPPI 3km', description: 'Corte horizontal a 3.000m de altitude' },
      { id: '2', name: 'PPI', description: 'Varredura plana de elevação baixa' }
    ]
  },
  COMP: {
    code: 'COMP',
    name: 'Mosaico Geral Santa Catarina',
    operator: 'Defesa Civil de Santa Catarina / Rede Integrada',
    location: 'Composição Estadual (Chapecó + Lontras + Araranguá)',
    coordinates: { lat: -27.17887, lon: -50.18622 },
    band: 'Composição Multiradar Doppler',
    rangeKm: 450,
    minLon: -58.0651279,
    minLat: -33.8163446,
    maxLon: -46.4999942,
    maxLat: -24.7653703,
    leafletBounds: [
      [-33.8163446, -58.0651279],
      [-24.7653703, -46.4999942]
    ] as [[number, number], [number, number]],
    supportedProducts: [
      { id: '4', name: 'C-MAX', description: 'Coluna de Refletividade Máxima (dBZ integrado)' }
    ]
  },
  LON: {
    code: 'LON',
    name: 'Radar Vale do Itajaí (Lontras)',
    operator: 'Defesa Civil de Santa Catarina',
    location: 'Lontras - SC',
    coordinates: { lat: -27.16, lon: -49.90 },
    band: 'Banda S/C Doppler',
    rangeKm: 250,
    minLon: -51.9326542,
    minLat: -29.3957249,
    maxLon: -46.9908037,
    maxLat: -25.0438317,
    leafletBounds: [
      [-29.3957249, -51.9326542],
      [-25.0438317, -46.9908037]
    ] as [[number, number], [number, number]],
    supportedProducts: [
      { id: '0', name: 'CAPPI 2km', description: 'Corte horizontal a 2km' }
    ]
  }
};

// API: Available Sources metadata
app.get('/api/radar/sources', (_req: Request, res: Response) => {
  res.json({
    success: true,
    sources: [
      {
        id: 'defesa_civil_chapeco',
        name: 'Defesa Civil SC — Radar Chapecó (Oeste)',
        badge: 'Oficial SC - Chapecó',
        isPrimary: true,
        radarCode: 'CHP',
        defaultProd: '0',
        metadata: SIFAP_RADAR_METADATA.CHP
      },
      {
        id: 'defesa_civil_mosaico',
        name: 'Defesa Civil SC — Mosaico Regional (C-MAX)',
        badge: 'Oficial SC - Mosaico',
        isPrimary: false,
        radarCode: 'COMP',
        defaultProd: '4',
        metadata: SIFAP_RADAR_METADATA.COMP
      },
      {
        id: 'rainviewer_composite',
        name: 'RainViewer — Mosaico Continental Sul',
        badge: 'Doppler Global',
        isPrimary: false,
        radarCode: 'RAINVIEWER',
        defaultProd: 'composite'
      },
      {
        id: 'redemet_decea',
        name: 'DECEA / REDEMET (Comando da Aeronáutica)',
        badge: 'Rede Militar / Aeronáutica',
        isPrimary: false,
        radarCode: 'REDEMET',
        isConfigured: Boolean(process.env.REDEMET_API_KEY)
      }
    ]
  });
});

// Helper to parse SIFAP radar filename:
// Format: YYYYMMDDHHMMSS00dBZ.cappi_top.png
// e.g.: 2026102016180400dBZ.cappi_top.png
function parseSifapFilename(filename: string, radarCode: string, prod: string) {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    return {
      filename,
      timestamp: Date.now(),
      utcString: 'Desconhecido',
      brtString: 'Desconhecido',
      ageMinutes: 0
    };
  }

  const [, year, month, day, hour, min, sec] = match;
  // Note: SIFAP timestamps are in UTC
  const utcDate = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min, +sec));
  const timestamp = utcDate.getTime();
  const now = Date.now();
  const ageMinutes = Math.max(0, Math.floor((now - timestamp) / 60000));

  // Format BRT (Brasília Time: UTC-3)
  const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const utcFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return {
    filename,
    timestamp,
    utcIso: utcDate.toISOString(),
    utcDisplay: `${utcFormatter.format(utcDate)} UTC`,
    brtDisplay: `${brtFormatter.format(utcDate)} BRT (UTC-3)`,
    ageMinutes,
    imageUrl: `/api/radar/sc/image?prod=${prod}&radar=${radarCode}&file=${encodeURIComponent(filename)}`
  };
}

// API: Fetch latest images from Defesa Civil SC SIFAP
app.get('/api/radar/sc/latest', async (req: Request, res: Response) => {
  const radar = (req.query.radar as string) || 'CHP';
  const prod = (req.query.prod as string) || (radar === 'COMP' ? '4' : '0');
  const cacheKey = `sifap_latest_${radar}_${prod}`;

  const cached = getCached<any>(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const sifapUrl = `https://sifap.defesacivil.sc.gov.br/radarsc/rest/radar/getUltimasImagens?prod=${prod}&radar=${radar}&data=`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(sifapUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://sifap.defesacivil.sc.gov.br/radarsc/',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Defesa Civil SC retornou código HTTP ${response.status}`);
    }

    const rawList: string[] = await response.json();
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return res.status(503).json({
        success: false,
        message: 'Nenhuma observação recente retornada pela Defesa Civil SC para este produto.',
        radar,
        prod
      });
    }

    // Sort chronologically ascending
    const sortedList = [...rawList].sort();
    const frames = sortedList.map(file => parseSifapFilename(file, radar, prod));
    const latestFrame = frames[frames.length - 1];
    const meta = SIFAP_RADAR_METADATA[radar as keyof typeof SIFAP_RADAR_METADATA] || SIFAP_RADAR_METADATA.CHP;

    const payload = {
      success: true,
      source: 'Defesa Civil de Santa Catarina (SIFAP / Epagri CIRAM)',
      radar,
      prod,
      radarMeta: meta,
      frameCount: frames.length,
      frames,
      latestFrame,
      dataAgeMinutes: latestFrame ? latestFrame.ageMinutes : null,
      retrievedAt: new Date().toISOString()
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (error: any) {
    console.error('Error fetching Defesa Civil SC radar:', error?.message || error);
    res.status(502).json({
      success: false,
      error: error?.message || 'Falha ao conectar com o servidor da Defesa Civil SC',
      radar,
      prod,
      fallbackSuggestion: 'rainviewer'
    });
  }
});

// API: Proxy radar images from Defesa Civil SC
app.get('/api/radar/sc/image', async (req: Request, res: Response) => {
  const radar = (req.query.radar as string) || 'CHP';
  const prod = (req.query.prod as string) || '0';
  const file = req.query.file as string;

  if (!file) {
    return res.status(400).send('Arquivo não especificado');
  }

  // Security check: simple filename validation
  if (!/^[\w.-]+$/.test(file)) {
    return res.status(400).send('Nome de arquivo inválido');
  }

  try {
    const sifapImageUrl = `https://sifap.defesacivil.sc.gov.br/radarsc/rest/radar/getImagem?prod=${prod}&radar=${radar}&file=${encodeURIComponent(file)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const imgResponse = await fetch(sifapImageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://sifap.defesacivil.sc.gov.br/radarsc/'
      }
    });
    clearTimeout(timeout);

    if (!imgResponse.ok) {
      return res.status(imgResponse.status).send('Erro ao buscar imagem no servidor de origem');
    }

    const contentType = imgResponse.headers.get('content-type') || 'image/png';
    const arrayBuffer = await imgResponse.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Convert clear-air black pixels into true alpha transparency
    if (contentType.includes('png') || file.endsWith('.png')) {
      buffer = makeRadarPngTransparent(buffer);
    }

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=86400, immutable'
    });

    res.send(buffer);
  } catch (error: any) {
    console.error('Error proxying radar image:', error?.message || error);
    res.status(502).send('Erro ao obter imagem do radar');
  }
});

// API: RainViewer real-time weather maps
app.get('/api/radar/rainviewer/frames', async (_req: Request, res: Response) => {
  const cacheKey = 'rainviewer_weather_maps';
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!rvRes.ok) {
      throw new Error(`RainViewer retornou status ${rvRes.status}`);
    }

    const data = await rvRes.json();
    const host = data.host || 'https://tilecache.rainviewer.com';
    const past = data.radar?.past || [];

    const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const frames = past.map((f: { time: number; path: string }) => {
      const date = new Date(f.time * 1000);
      const ageMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
      return {
        time: f.time,
        path: f.path,
        timestamp: date.getTime(),
        utcDisplay: date.toUTCString(),
        brtDisplay: `${brtFormatter.format(date)} BRT (UTC-3)`,
        ageMinutes,
        tileUrlTemplate: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`
      };
    });

    const latest = frames[frames.length - 1];

    const payload = {
      success: true,
      source: 'RainViewer API (Doppler Composite)',
      host,
      frames,
      latestFrame: latest,
      dataAgeMinutes: latest ? latest.ageMinutes : null,
      retrievedAt: new Date().toISOString()
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch (error: any) {
    console.error('Error fetching RainViewer:', error?.message || error);
    res.status(502).json({
      success: false,
      error: error?.message || 'Falha ao consultar RainViewer'
    });
  }
});

// API: Chat REST Endpoints
import { chatStore, ChatMessage } from './server/chatStore.ts';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

// Global WebSocket clients set for real-time broadcast
const chatWsClients = new Set<WebSocket>();

function broadcastChatEvent(event: any) {
  const payload = JSON.stringify(event);
  chatWsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.warn('Error broadcasting to WS client:', err);
      }
    }
  });
}

function broadcastOnlineCount() {
  broadcastChatEvent({
    type: 'presence:update',
    onlineCount: Math.max(1, chatWsClients.size)
  });
}

// REST: Get recent chat messages
app.get('/api/chat/messages', (_req: Request, res: Response) => {
  res.json({
    success: true,
    messages: chatStore.getRecentMessages(60),
    onlineCount: Math.max(1, chatWsClients.size)
  });
});

// REST: Send chat message
app.post('/api/chat/messages', (req: Request, res: Response) => {
  const { userId, nickname, municipality, content } = req.body;
  if (!userId || !content) {
    return res.status(400).json({ success: false, error: 'Dados incompletos' });
  }

  const result = chatStore.addMessage(userId, nickname, municipality, content);
  if (!result.success || !result.message) {
    return res.status(429).json({ success: false, error: result.error || 'Erro ao enviar mensagem' });
  }

  // Broadcast to all active WebSocket connections in real time
  broadcastChatEvent({
    type: 'chat:message',
    message: result.message
  });

  res.json({ success: true, message: result.message });
});

// REST: Report message for moderation
app.post('/api/chat/messages/:id/report', (req: Request, res: Response) => {
  const messageId = req.params.id;
  const result = chatStore.reportMessage(messageId);

  if (result.hidden) {
    broadcastChatEvent({
      type: 'chat:deleted',
      messageId
    });
  }

  res.json({ success: true, hidden: result.hidden });
});

// REST: Chat config info
app.get('/api/chat/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    isSupabaseConfigured: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    provider: Boolean(process.env.VITE_SUPABASE_URL) ? 'supabase' : 'native-websocket'
  });
});

// Production static file serving or development Vite integration
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Attach HTTP server and WebSocket server for real-time collaboration
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' });

  wss.on('connection', (ws: WebSocket) => {
    chatWsClients.add(ws);
    broadcastOnlineCount();

    // Send initial history
    ws.send(
      JSON.stringify({
        type: 'chat:init',
        messages: chatStore.getRecentMessages(60),
        onlineCount: Math.max(1, chatWsClients.size)
      })
    );

    ws.on('message', (data: Buffer | string) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'chat:send') {
          const { userId, nickname, municipality, content } = payload;
          const result = chatStore.addMessage(userId, nickname, municipality, content);
          if (result.success && result.message) {
            broadcastChatEvent({
              type: 'chat:message',
              message: result.message
            });
          } else {
            ws.send(JSON.stringify({ type: 'chat:error', error: result.error }));
          }
        } else if (payload.type === 'chat:report') {
          const { messageId } = payload;
          const result = chatStore.reportMessage(messageId);
          if (result.hidden) {
            broadcastChatEvent({
              type: 'chat:deleted',
              messageId
            });
          }
        }
      } catch (err) {
        console.warn('Invalid WS message payload:', err);
      }
    });

    ws.on('close', () => {
      chatWsClients.delete(ws);
      broadcastOnlineCount();
    });

    ws.on('error', () => {
      chatWsClients.delete(ws);
      broadcastOnlineCount();
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`[Radar Sul SC] Servidor ativo com Realtime WebSocket em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Radar Sul SC] Falha ao iniciar servidor:', err);
  process.exit(1);
});

