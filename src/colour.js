// Colour helpers for the picker. All colours are #RRGGBB strings outside.

export const isHex = (s) => /^#?[0-9a-f]{6}$/i.test(String(s).trim());

export function hexToRgb(hex) {
  const v = String(hex).trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export function toHex(rgb) {
  return "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c)))
    .toString(16).padStart(2, "0").toUpperCase()).join("");
}

/** r, g, b 0..255 -> [h 0..360, s 0..1, v 0..1] */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d) {
    if (mx === r) hue = ((g - b) / d) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, mx ? d / mx : 0, mx];
}

export function hsvToRgb(hue, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Plain, brand-neutral starting points. */
export const COMMON = [
  ["black", "#101010"], ["charcoal", "#3A3A3A"], ["grey", "#808080"], ["silver", "#C4C4C4"],
  ["white", "#F2F4F0"], ["red", "#C8202A"], ["orange", "#F07C1E"], ["yellow", "#F2D21B"],
  ["green", "#2C7A2E"], ["teal", "#1C9C94"], ["blue", "#0B39B5"], ["sky", "#5AA9E6"],
  ["purple", "#6B3FA0"], ["pink", "#E8799F"], ["brown", "#6B4426"], ["tan", "#C8A27A"],
];
