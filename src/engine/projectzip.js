// A project as a desktop project folder, zipped. Unzip one into
// ~/Documents/HueLite/projects/ and the Mac app opens it; zip a folder
// from there (Finder > Compress) and the phone imports it.
//
//   <slug>/project.json    same schema on both sides
//   <slug>/source.<ext>    the original photo
//   <slug>/prepped.png     8-bit RGB, output of Prep
//   <slug>/shape.png       8-bit outline (absent = rectangle)
//   <slug>/heightmap.png   16-bit greyscale, output of Solve
//   <slug>/preview.png     simulated print (transparent outside the outline)
//   <slug>/thumb.png       256 px square

import * as png from "./png.js";
import { makeZip, readZip } from "./zip.js";
import { buildLut } from "./solve.js";

/** Same as core/project.py slugify. */
export function slugify(name) {
  const s = String(name || "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return s || "project";
}

const EXT_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                    ".webp": "image/webp", ".heic": "image/heic", ".gif": "image/gif", ".bmp": "image/bmp" };

function sourceExt(filename, type) {
  const m = /\.[a-z0-9]+$/i.exec(filename || "");
  if (m) return m[0].toLowerCase();
  const hit = Object.entries(EXT_TYPES).find(([, t]) => t === type);
  return hit ? hit[0] : ".jpg";
}

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

/** Nearest-sampled centre square, for thumb.png. */
function thumbSamples(rgba, w, h, size = 256) {
  const side = Math.min(w, h), x0 = (w - side) >> 1, y0 = (h - side) >> 1;
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    const sy = y0 + Math.min(side - 1, Math.floor((y + 0.5) * side / size));
    for (let x = 0; x < size; x++) {
      const sx = x0 + Math.min(side - 1, Math.floor((x + 0.5) * side / size));
      const i = (sy * w + sx) * 4, o = (y * size + x) * 3;
      out[o] = rgba[i]; out[o + 1] = rgba[i + 1]; out[o + 2] = rgba[i + 2];
    }
  }
  return out;
}

/** -> { blob, filename } */
export async function pack({ data, source, prepped = null, solved = null }) {
  const slug = slugify(data.name);
  const ext = sourceExt(data.source?.filename, source?.type);
  const project = JSON.parse(JSON.stringify(data));
  project.source = { ...(project.source || {}), filename: `source${ext}` };
  const entries = [];
  const add = async (name, blobOrString) => entries.push({ name: `${slug}/${name}`,
    chunks: [typeof blobOrString === "string" ? blobOrString : await bytesOf(blobOrString)] });

  if (source) await add(`source${ext}`, source);
  if (prepped) {
    const { w, h, rgba, mask } = prepped;
    const rgb = new Uint8Array(w * h * 3);
    for (let p = 0; p < w * h; p++) { rgb[p * 3] = rgba[p * 4]; rgb[p * 3 + 1] = rgba[p * 4 + 1]; rgb[p * 3 + 2] = rgba[p * 4 + 2]; }
    await add("prepped.png", await png.encode({ width: w, height: h, channels: 3, samples: rgb }));
    await add("thumb.png", await png.encode({ width: 256, height: 256, channels: 3, samples: thumbSamples(rgba, w, h) }));
    if (mask) {
      const m = new Uint8Array(w * h);
      for (let i = 0; i < m.length; i++) m[i] = mask[i] ? 255 : 0;
      await add("shape.png", await png.encode({ width: w, height: h, channels: 1, samples: m }));
    }
  }
  if (solved && prepped) {
    const { w, h, heights } = solved;
    await add("heightmap.png", await png.encode({ width: w, height: h, channels: 1, depth: 16, samples: heights }));
    const s = project.solve;
    const { lut } = buildLut(s.filaments, s.layer_height_mm, s.band_mode || "solid");
    const mask = prepped.mask;
    const ch = mask ? 4 : 3;
    const prev = new Uint8Array(w * h * ch);
    for (let p = 0; p < w * h; p++) {
      const c = lut[Math.min(lut.length - 1, heights[p])];
      for (let k = 0; k < 3; k++) prev[p * ch + k] = Math.max(0, Math.min(255, Math.trunc(c[k])));
      if (mask) prev[p * ch + 3] = mask[p] ? 255 : 0;
    }
    await add("preview.png", await png.encode({ width: w, height: h, channels: ch, samples: prev }));
  }
  await add("project.json", JSON.stringify(project, null, 2));
  return { blob: await makeZip(entries), filename: `${slug}.huelite.zip` };
}

/** -> { data, source: Blob, prepped: {w,h,rgba,mask} | null, solved: {w,h,heights} | null } */
export async function unpack(bytes) {
  const files = readZip(bytes);
  const real = [...files.keys()].filter((n) => !n.startsWith("__MACOSX/") && !n.split("/").pop().startsWith("._"));
  const jsonName = real.filter((n) => n.endsWith("project.json")).sort((a, b) => a.length - b.length)[0];
  if (!jsonName) throw new Error("no project.json in that zip - is it a HueLite project?");
  const prefix = jsonName.slice(0, -"project.json".length);
  const read = async (name) => (files.has(prefix + name) ? files.get(prefix + name)() : null);
  const data = JSON.parse(new TextDecoder().decode(await read("project.json")));

  let srcName = data.source?.filename;
  if (!srcName || !files.has(prefix + srcName)) {
    srcName = real.map((n) => n.slice(prefix.length)).find((n) => /^source\.[a-z0-9]+$/i.test(n));
  }
  if (!srcName) throw new Error("the project's photo is missing from the zip");
  const srcBytes = await read(srcName);
  const source = new Blob([srcBytes], { type: EXT_TYPES[sourceExt(srcName)] || "application/octet-stream" });

  let prepped = null, solved = null;
  const pBytes = await read("prepped.png");
  if (pBytes) {
    const img = await png.decode(pBytes);
    if (img.depth !== 8) throw new Error("prepped.png should be 8-bit");
    const { width: w, height: h, channels: c, samples } = img;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const grey = c < 3;
      rgba[p * 4] = samples[p * c];
      rgba[p * 4 + 1] = samples[p * c + (grey ? 0 : 1)];
      rgba[p * 4 + 2] = samples[p * c + (grey ? 0 : 2)];
      rgba[p * 4 + 3] = 255;
    }
    let mask = null;
    const sBytes = await read("shape.png");
    if (sBytes) {
      const s = await png.decode(sBytes);
      if (s.width === w && s.height === h) {
        mask = new Uint8Array(w * h);
        const top = s.depth === 16 ? 32768 : 128;
        for (let p = 0; p < w * h; p++) mask[p] = s.samples[p * s.channels] >= top ? 1 : 0;
      }
    }
    prepped = { w, h, rgba, mask };
    const hBytes = await read("heightmap.png");
    if (hBytes) {
      const hm = await png.decode(hBytes);
      if (hm.width === w && hm.height === h) {
        const heights = new Uint16Array(w * h);
        for (let p = 0; p < w * h; p++) heights[p] = hm.samples[p * hm.channels];
        solved = { w, h, heights };
      }
    }
  }
  return { data, source, prepped, solved };
}
