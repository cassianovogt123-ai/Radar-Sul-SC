import zlib from 'zlib';

/**
 * Transforms meteorological radar PNGs from SIFAP / Defesa Civil SC to guarantee
 * true alpha transparency.
 *
 * In radar products, clear air (no echo / below threshold) is encoded as black (RGB 0,0,0
 * or gray 0) inside the scan coverage disk. This function converts all no-echo/black pixels
 * to alpha = 0 (100% transparent), eliminating any opaque black rectangles and allowing
 * the underlying base map (OpenStreetMap, streets, cities) to remain fully visible.
 */
export function makeRadarPngTransparent(buffer: Buffer): Buffer {
  try {
    // Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length < 33 ||
      buffer.readUInt32BE(0) !== 0x89504e47 ||
      buffer.readUInt32BE(4) !== 0x0d0a1a0a
    ) {
      return buffer;
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const bitDepth = buffer[24];
    const colorType = buffer[25];

    // Only process standard 8-bit channels
    if (bitDepth !== 8) {
      return buffer;
    }

    let bpp = 0;
    if (colorType === 0) bpp = 1; // Grayscale
    else if (colorType === 2) bpp = 3; // RGB
    else if (colorType === 3) bpp = 1; // Palette (Indexed)
    else if (colorType === 4) bpp = 2; // Grayscale + Alpha
    else if (colorType === 6) bpp = 4; // RGBA
    else return buffer;

    // Extract IDAT chunks and PLTE palette if present
    const idatBuffers: Buffer[] = [];
    let paletteBuffer: Buffer | null = null;
    let offset = 8;

    while (offset < buffer.length - 4) {
      const len = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') {
        idatBuffers.push(buffer.subarray(offset + 8, offset + 8 + len));
      } else if (type === 'PLTE') {
        paletteBuffer = buffer.subarray(offset + 8, offset + 8 + len);
      }
      offset += 12 + len;
    }

    if (idatBuffers.length === 0) return buffer;

    const uncompressed = zlib.inflateSync(Buffer.concat(idatBuffers));
    const rowBytes = 1 + width * bpp;
    const reconstructed = Buffer.alloc(width * height * bpp);

    // Unfilter PNG scanlines (Standard PNG filter types: 0=None, 1=Sub, 2=Up, 3=Average, 4=Paeth)
    for (let y = 0; y < height; y++) {
      const filter = uncompressed[y * rowBytes];
      const srcRow = y * rowBytes + 1;
      const dstRow = y * width * bpp;
      const prevDstRow = (y - 1) * width * bpp;

      for (let x = 0; x < width * bpp; x++) {
        const raw = uncompressed[srcRow + x];
        let recon = 0;
        if (filter === 0) {
          recon = raw;
        } else if (filter === 1) {
          const left = x >= bpp ? reconstructed[dstRow + x - bpp] : 0;
          recon = (raw + left) & 0xff;
        } else if (filter === 2) {
          const up = y > 0 ? reconstructed[prevDstRow + x] : 0;
          recon = (raw + up) & 0xff;
        } else if (filter === 3) {
          const left = x >= bpp ? reconstructed[dstRow + x - bpp] : 0;
          const up = y > 0 ? reconstructed[prevDstRow + x] : 0;
          recon = (raw + Math.floor((left + up) / 2)) & 0xff;
        } else if (filter === 4) {
          const a = x >= bpp ? reconstructed[dstRow + x - bpp] : 0;
          const b = y > 0 ? reconstructed[prevDstRow + x] : 0;
          const c = y > 0 && x >= bpp ? reconstructed[prevDstRow + x - bpp] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          let pr = a;
          if (pb < pa && pb <= pc) pr = b;
          else if (pc < pa && pc <= pb) pr = c;
          recon = (raw + pr) & 0xff;
        }
        reconstructed[dstRow + x] = recon;
      }
    }

    // Build standard RGBA output (Filter 0 on every row)
    const outRowBytes = 1 + width * 4;
    const rgbaData = Buffer.alloc(height * outRowBytes);

    for (let y = 0; y < height; y++) {
      const outRow = y * outRowBytes;
      rgbaData[outRow] = 0; // Filter: 0 (None)
      const inRow = y * width * bpp;

      for (let x = 0; x < width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 255;

        if (colorType === 4) {
          // Gray + Alpha
          const gray = reconstructed[inRow + x * 2];
          a = reconstructed[inRow + x * 2 + 1];
          r = gray;
          g = gray;
          b = gray;
        } else if (colorType === 6) {
          // RGBA
          r = reconstructed[inRow + x * 4];
          g = reconstructed[inRow + x * 4 + 1];
          b = reconstructed[inRow + x * 4 + 2];
          a = reconstructed[inRow + x * 4 + 3];
        } else if (colorType === 2) {
          // RGB
          r = reconstructed[inRow + x * 3];
          g = reconstructed[inRow + x * 3 + 1];
          b = reconstructed[inRow + x * 3 + 2];
        } else if (colorType === 3 && paletteBuffer) {
          // Indexed / Palette
          const idx = reconstructed[inRow + x];
          if (idx * 3 + 2 < paletteBuffer.length) {
            r = paletteBuffer[idx * 3];
            g = paletteBuffer[idx * 3 + 1];
            b = paletteBuffer[idx * 3 + 2];
          }
        }

        // Radar clear air threshold: pure black or near-black (< 6) is treated as transparent (no echo)
        if (r <= 5 && g <= 5 && b <= 5) {
          a = 0;
        }

        const outPx = outRow + 1 + x * 4;
        rgbaData[outPx] = r;
        rgbaData[outPx + 1] = g;
        rgbaData[outPx + 2] = b;
        rgbaData[outPx + 3] = a;
      }
    }

    // Deflate with fast/standard compression
    const newIdat = zlib.deflateSync(rgbaData, { level: 6 });

    // Construct valid PNG
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // Bit depth: 8
    ihdr[9] = 6; // Color type: 6 (RGBA)
    ihdr[10] = 0; // Compression
    ihdr[11] = 0; // Filter
    ihdr[12] = 0; // Interlace

    function makeChunk(type: string, data: Buffer): Buffer {
      const len = data.length;
      const chunk = Buffer.alloc(12 + len);
      chunk.writeUInt32BE(len, 0);
      chunk.write(type, 4, 4, 'ascii');
      data.copy(chunk, 8);
      const crc = (zlib as any).crc32(chunk.subarray(4, 8 + len));
      chunk.writeUInt32BE(crc >>> 0, 8 + len);
      return chunk;
    }

    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrChunk = makeChunk('IHDR', ihdr);
    const idatChunk = makeChunk('IDAT', newIdat);
    const iendChunk = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
  } catch (err) {
    console.warn('[makeRadarPngTransparent] Falha ao processar PNG transparente, retornando original:', err);
    return buffer;
  }
}
