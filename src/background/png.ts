// Decodificador PNG mínimo para o aviso em segundo plano (sem tela, sem window, sem TextDecoder).
// Cobre PNG não entrelaçado de 8 bits (cinza, RGB, RGBA, cinza+alfa) e com paleta (1/2/4/8 bits).
import { unzlibSync } from 'fflate';

export function decodePng(buf: ArrayBuffer | Uint8Array): { data: Uint8Array; width: number; height: number } {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) throw new Error('não é PNG');
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let o = 8; o + 8 <= b.length; ) {
    const len = u32(o);
    const name = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const body = b.subarray(o + 8, o + 8 + len);
    if (name === 'IHDR') {
      width = u32(o + 8);
      height = u32(o + 12);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') trns = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    o += 12 + len;
  }
  if (interlace) throw new Error('PNG entrelaçado não suportado');
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels || (type !== 3 && depth !== 8) || (type === 3 && !palette)) throw new Error(`PNG tipo ${type}/${depth} não suportado`);

  let total = 0;
  for (const c of idat) total += c.length;
  const z = new Uint8Array(total);
  for (let p = 0, i = 0; i < idat.length; p += idat[i].length, i++) z.set(idat[i], p);
  const raw = unzlibSync(z);

  // desfaz os filtros linha a linha
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const up = y ? px[row - stride + x] : 0;
      const c = y && x >= bpp ? px[row - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      px[row + x] = v;
    }
  }

  // tudo para RGBA
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = y * stride + x * channels;
      if (type === 3) {
        const bit = x * depth;
        const idx = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        out[o] = palette![idx * 3];
        out[o + 1] = palette![idx * 3 + 1];
        out[o + 2] = palette![idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (type === 0 || type === 4) {
        out[o] = out[o + 1] = out[o + 2] = px[s];
        out[o + 3] = type === 4 ? px[s + 1] : 255;
      } else {
        out[o] = px[s];
        out[o + 1] = px[s + 1];
        out[o + 2] = px[s + 2];
        out[o + 3] = type === 6 ? px[s + 3] : 255;
      }
    }
  }
  return { data: out, width, height };
}
