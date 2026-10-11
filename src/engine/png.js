// Minimal PNG encoder/decoder. The browser's own decoders can't be used
// for project files: they colour-manage, and they drop 16-bit samples to
// 8, which would flatten the heightmap. This handles exactly what HueLite
// projects contain (Pillow writes them the same way): greyscale, grey +
// alpha, RGB and RGBA at 8 or 16 bits, non-interlaced.

import { crc32 } from "./zip.js";

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

async function pipe(stream, bytes) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(await out);
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32([out.subarray(4, 8 + data.length)]));
  return out;
}

/** samples: Uint8Array (depth 8) or Uint16Array (depth 16), row-major,
 *  `channels` per pixel. Returns a Blob. */
export async function encode({ width, height, channels, depth = 8, samples }) {
  const colorType = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
  const bps = depth / 8;
  const stride = width * channels * bps;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    raw[o] = 0;   // filter: none
    if (depth === 8) {
      raw.set(samples.subarray(y * width * channels, (y + 1) * width * channels), o + 1);
    } else {
      for (let i = 0; i < width * channels; i++) {
        const v = samples[y * width * channels + i];
        raw[o + 1 + i * 2] = v >> 8;   // big-endian
        raw[o + 2 + i * 2] = v & 255;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  const idat = await pipe(new CompressionStream("deflate"), raw);
  return new Blob([new Uint8Array(SIG), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))],
    { type: "image/png" });
}

/** -> { width, height, channels, depth, samples } */
export async function decode(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error("not a PNG");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < bytes.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = dv.getUint32(pos + 8);
      height = dv.getUint32(pos + 12);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const channels = CHANNELS[colorType];
  if (!channels || (depth !== 8 && depth !== 16) || interlace) {
    throw new Error(`unsupported PNG (type ${colorType}, ${depth}-bit${interlace ? ", interlaced" : ""})`);
  }
  const joined = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  let o = 0;
  for (const c of idat) { joined.set(c, o); o += c.length; }
  const raw = await pipe(new DecompressionStream("deflate"), joined);

  const bpp = channels * depth / 8;
  const stride = width * bpp;
  const cur = new Uint8Array(stride);
  let prev = new Uint8Array(stride);
  const samples = depth === 8 ? new Uint8Array(width * height * channels) : new Uint16Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    if (depth === 8) samples.set(cur, y * stride);
    else for (let i = 0; i < stride / 2; i++) samples[y * (stride / 2) + i] = (cur[i * 2] << 8) | cur[i * 2 + 1];
    prev = cur.slice();
  }
  return { width, height, channels, depth, samples };
}
