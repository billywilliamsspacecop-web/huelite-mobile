// Bambu Studio project (.3mf) and STL writers. Port of the desktop's
// core/bambu3mf.py and mesh.write_stl - same package layout, same XML,
// so a phone export opens in Studio exactly like a Mac one.

import { makeZip } from "./zip.js";

const NS_CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const NS_BBL = "http://schemas.bambulab.com/package/2021";
const PLATE_CENTRE = { A1: [128, 128], "A1 mini": [90, 90] };

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => escape(s).replace(/"/g, "&quot;");

/** Trim float noise; 3MF is ASCII, so digits are file size. */
function fmt(v) {
  const s = v.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

// box corner order and faces, matching bambu3mf.box()
const BOX_TRIS = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
                  [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
function boxCorners(b, k) {
  const x0 = b[k], y0 = b[k + 1], z0 = b[k + 2], x1 = b[k + 3], y1 = b[k + 4], z1 = b[k + 5];
  return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
          [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
}

/** The model XML in ~1 MB string chunks, so a big mesh never becomes one
 *  giant string on a phone. */
function modelXmlChunks(model) {
  const chunks = [];
  let buf = [];
  let len = 0;
  const push = (line) => {
    buf.push(line);
    len += line.length + 1;
    if (len > 1_000_000) { chunks.push(buf.join("\n") + "\n"); buf = []; len = 0; }
  };
  push('<?xml version="1.0" encoding="UTF-8"?>');
  push(`<model unit="millimeter" xml:lang="en-US" xmlns="${NS_CORE}" xmlns:BambuStudio="${NS_BBL}">`);
  push(' <metadata name="Application">HueLite</metadata>');
  push(' <metadata name="BambuStudio:3mfVersion">1</metadata>');
  push(` <metadata name="Title">${escape(model.name)}</metadata>`);
  push(" <resources>");
  model.parts.forEach((part, pi) => {
    push(`  <object id="${pi + 1}" type="model">`);
    push("   <mesh>");
    push("    <vertices>");
    const n = part.boxes.length / 6;
    for (let b = 0; b < n; b++) {
      for (const [x, y, z] of boxCorners(part.boxes, b * 6)) {
        push(`     <vertex x="${fmt(x)}" y="${fmt(y)}" z="${fmt(z)}"/>`);
      }
    }
    push("    </vertices>");
    push("    <triangles>");
    for (let b = 0; b < n; b++) {
      const o = b * 8;
      for (const [a, c, d] of BOX_TRIS) push(`     <triangle v1="${a + o}" v2="${c + o}" v3="${d + o}"/>`);
    }
    push("    </triangles>");
    push("   </mesh>");
    push("  </object>");
  });
  const parent = model.parts.length + 1;
  push(`  <object id="${parent}" type="model">`);
  push("   <components>");
  for (let i = 1; i < parent; i++) push(`    <component objectid="${i}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`);
  push("   </components>");
  push("  </object>");
  push(" </resources>");
  const [cx, cy] = PLATE_CENTRE[model.plate] || PLATE_CENTRE.A1;
  push(" <build>");
  push(`  <item objectid="${parent}" transform="1 0 0 0 1 0 0 0 1 ${fmt(cx)} ${fmt(cy)} 0" printable="1"/>`);
  push(" </build>");
  buf.push("</model>");
  chunks.push(buf.join("\n"));
  return chunks;
}

function modelSettingsXml(model) {
  const parent = model.parts.length + 1;
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<config>",
    `  <object id="${parent}">`,
    `    <metadata key="name" value="${attr(model.name)}"/>`,
    '    <metadata key="extruder" value="1"/>',
  ];
  model.parts.forEach((part, i) => {
    out.push(`    <part id="${i + 1}" subtype="normal_part">`);
    out.push(`      <metadata key="name" value="${attr(part.name)}"/>`);
    out.push('      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>');
    out.push(`      <metadata key="extruder" value="${part.extruder}"/>`);
    out.push("    </part>");
  });
  out.push("  </object>", "  <plate>",
    '    <metadata key="plater_id" value="1"/>',
    `    <metadata key="plater_name" value="${attr(model.name)}"/>`,
    '    <metadata key="locked" value="false"/>',
    "    <model_instance>",
    `      <metadata key="object_id" value="${parent}"/>`,
    '      <metadata key="instance_id" value="0"/>',
    "    </model_instance>", "  </plate>", "  <assemble>",
    `   <assemble_item object_id="${parent}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="0 0 0" />`,
    "  </assemble>", "</config>");
  return out.join("\n");
}

function projectSettings(colours, layerHeight) {
  const cfg = {
    from: "project",
    version: "02.07.01.62",
    filament_colour: colours.map((c) => c.slice(0, 7)),
    filament_type: colours.map(() => "PLA"),
    filament_ids: colours.map(() => "GFA00"),
    enable_prime_tower: "1",
    prime_tower_width: "15",
    prime_tower_brim_width: "2",
  };
  if (layerHeight) {
    cfg.layer_height = fmt(layerHeight);
    cfg.initial_layer_print_height = "0.2";
  }
  return JSON.stringify(cfg, null, 4);
}

export async function make3mf(model, { colours = null, layerHeight = null } = {}) {
  const entries = [
    { name: "[Content_Types].xml", chunks: [CONTENT_TYPES] },
    { name: "_rels/.rels", chunks: [RELS] },
    { name: "3D/3dmodel.model", chunks: modelXmlChunks(model) },
    { name: "Metadata/model_settings.config", chunks: [modelSettingsXml(model)] },
  ];
  if (colours) entries.push({ name: "Metadata/project_settings.config",
                              chunks: [projectSettings(colours, layerHeight)] });
  return makeZip(entries, "model/3mf");
}

export function makeStl(model) {
  const nBoxes = model.parts.reduce((s, p) => s + p.boxes.length / 6, 0);
  if (!nBoxes) throw new Error("nothing to export - every filament band is empty");
  const nTri = nBoxes * 12;
  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);
  const head = new TextEncoder().encode("HueLite export");
  new Uint8Array(buf, 0, head.length).set(head);
  dv.setUint32(80, nTri, true);
  let o = 84;
  for (const part of model.parts) {
    const n = part.boxes.length / 6;
    for (let b = 0; b < n; b++) {
      const v = boxCorners(part.boxes, b * 6);
      for (const [a, c, d] of BOX_TRIS) {
        const p0 = v[a], p1 = v[c], p2 = v[d];
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        const wx = p2[0] - p0[0], wy = p2[1] - p0[1], wz = p2[2] - p0[2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (const val of [nx, ny, nz, ...p0, ...p1, ...p2]) { dv.setFloat32(o, val, true); o += 4; }
        dv.setUint16(o, 0, true); o += 2;
      }
    }
  }
  return new Blob([buf], { type: "model/stl" });
}

export function slotNote(filaments) {
  const lines = ["HueLite -- filament slots for this print", ""];
  filaments.forEach((f, i) => {
    const edge = i === 0 ? "  (prints first, lowest)" : i === filaments.length - 1 ? "  (prints last, top)" : "";
    lines.push(`  Slot ${f.slot}   ${(f.name || "").padEnd(10)} ${f.hex}${edge}`);
  });
  lines.push("", "Bambu Studio does not always pick these colours up on its own",
    "when the project opens. If the AMS panel shows something else,",
    "set each slot to the colour above before printing - the slot",
    "NUMBER is what actually matters for the print; the colour is",
    "just so Studio's preview looks right.");
  return lines.join("\n") + "\n";
}
