// Minimal ZIP writer for the 3MF package. Deflates with the browser's own
// CompressionStream where it exists (every current Chrome/Safari), and
// falls back to storing uncompressed so the file is still valid.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(chunks) {
  let c = 0xffffffff;
  for (const b of chunks) for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(chunks) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate-raw");
    const out = new Response(cs.readable).arrayBuffer();
    const writer = cs.writable.getWriter();
    for (const c of chunks) await writer.write(c);
    await writer.close();
    return new Uint8Array(await out);
  } catch {
    return null;
  }
}

const MAX_INFLATED = 256 * 1024 * 1024;   // no honest project file inflates past this

/** Run bytes through a (de)compression stream, refusing output past `max`:
 *  a tiny hostile file can otherwise inflate to gigabytes and take the tab down. */
export async function inflate(format, bytes, max = MAX_INFLATED) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel(); throw new Error("a file in that zip is far too large"); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}

/** entries: [{ name, chunks: (string | Uint8Array)[] }] -> Blob */
export async function makeZip(entries, mime = "application/zip") {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const { name, chunks } of entries) {
    const bytes = chunks.map((c) => (typeof c === "string" ? enc.encode(c) : c));
    const size = bytes.reduce((s, b) => s + b.length, 0);
    const crc = crc32(bytes);
    const packed = await deflate(bytes);
    const method = packed ? 8 : 0;
    const csize = packed ? packed.length : size;
    const fname = enc.encode(name);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);       // version needed
    local.setUint16(6, 0x0800, true);   // UTF-8 names
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);       // time
    local.setUint16(12, 0x21, true);    // date: 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, csize, true);
    local.setUint32(22, size, true);
    local.setUint16(26, fname.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), fname, ...(packed ? [packed] : bytes));

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, method, true);
    cen.setUint16(12, 0, true);
    cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, csize, true);
    cen.setUint32(24, size, true);
    cen.setUint16(28, fname.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), fname);
    offset += 30 + fname.length + csize;
  }
  const cenSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: mime });
}

/** Read a ZIP: -> Map(name -> async () => Uint8Array). Handles stored and
 *  deflated entries, which covers Finder's "Compress" and our own files. */
export function readZip(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  if (p > bytes.length) throw new Error("damaged zip directory");
  const dec = new TextDecoder();
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("damaged zip directory");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    out.set(name, async () => {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      if (start + csize > bytes.length) throw new Error("damaged zip (entry runs past the end)");
      const data = bytes.subarray(start, start + csize);
      if (method === 0) return data.slice();
      if (method !== 8) throw new Error(`unsupported zip compression (${method})`);
      return inflate("deflate-raw", data);
    });
  }
  return out;
}
