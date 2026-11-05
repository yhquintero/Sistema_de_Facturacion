import { deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Genera una imagen PNG RGBA real (transparente con trazos de tinta azul oscuro)
 * para semillas iniciales de demostración.
 */
export function createSampleSignatureDataUrl(variant: 'supplier' | 'client' = 'supplier'): string {
  const width = 320;
  const height = 100;
  const rgba = new Uint8Array(width * height * 4);

  const setPixel = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
    const idx = (iy * width + ix) * 4;
    if (a > rgba[idx + 3]) {
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  };

  const drawStrokePoint = (cx: number, cy: number, radius = 1.4) => {
    const r = variant === 'supplier' ? 15 : 22;
    const g = variant === 'supplier' ? 52 : 78;
    const b = variant === 'supplier' ? 120 : 99;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius + 0.8) {
          const alpha = dist <= radius ? 235 : Math.max(0, Math.round((1 - (dist - radius)) * 160));
          setPixel(cx + dx, cy + dy, r, g, b, alpha);
        }
      }
    }
  };

  // Curva caligráfica suave sintética
  const totalSteps = 900;
  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    let x: number;
    let y: number;
    if (variant === 'supplier') {
      x = 28 + t * 255 + Math.sin(t * Math.PI * 7) * 12 * (1 - t * 0.5);
      y =
        54 -
        Math.sin(t * Math.PI * 5.5) * 24 * Math.exp(-t * 1.3) +
        Math.cos(t * Math.PI * 13) * 8 * (1 - t * 0.4);
    } else {
      x = 34 + t * 245 + Math.cos(t * Math.PI * 6) * 10 * (1 - t * 0.4);
      y =
        56 -
        Math.sin(t * Math.PI * 4.5) * 22 * Math.exp(-t * 1.1) +
        Math.sin(t * Math.PI * 15) * 7 * (1 - t * 0.35);
    }
    drawStrokePoint(x, y, 1.35);
  }

  // Rúbrica inferior elegante
  for (let i = 0; i <= 320; i++) {
    const t = i / 320;
    const x = 42 + t * 230;
    const y = 76 - Math.sin(t * Math.PI) * 7;
    drawStrokePoint(x, y, 1.05);
  }

  // Codificar filas PNG con byte de filtro 0 (None)
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawScanlines[rowStart] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(rawScanlines, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signatureHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const pngBuffer = Buffer.concat([
    signatureHeader,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rawScanlines)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);

  return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

/** Only bounded, decodable PNGs are admitted; arbitrary data URLs never reach exporters. */
function decodeSignature(dataUrl: string) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 2_800_000) throw new Error('La firma no puede superar 2 MB.');
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('La firma debe ser una imagen PNG válida.');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || buffer.subarray(12, 16).toString() !== 'IHDR') throw new Error('Cabecera de firma PNG no válida.');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (width < 20 || height < 20 || width > 4096 || height > 2048 || width * height > 2_000_000) throw new Error('Las dimensiones de la firma no son válidas.');
  let decoded: PNG;
  try { decoded = PNG.sync.read(buffer, { checkCRC: true }); } catch { throw new Error('No se pudo leer la imagen de la firma.'); }
  return { buffer, decoded };
}
export function assertValidSignature(dataUrl: string, requireInk = false): void {
  const { decoded } = decodeSignature(dataUrl);
  if (requireInk) {
    let ink = 0;
    for (let i = 0; i < decoded.data.length; i += 4) if (decoded.data[i + 3] > 32 && decoded.data[i] + decoded.data[i + 1] + decoded.data[i + 2] < 720) ink++;
    if (ink < 16) throw new Error('La firma está vacía o el trazo es demasiado breve. Dibuja tu firma completa.');
  }
}
export function dataUrlToPngBuffer(dataUrl?: string | null): Buffer | null {
  if (!dataUrl) return null;
  try { return decodeSignature(dataUrl).buffer; } catch { return null; }
}
