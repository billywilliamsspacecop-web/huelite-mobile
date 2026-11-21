# HueLite Mobile: Color Scheme & Logo Notes

Source of truth: `src/styles.css` in the huelite-mobile repo. Hex values below are copied from it.

## Look and feel

Dark, blueprint-style. Very dark ground with a faint grid, square corners, a monospace font, and small bracketed headings like `[ FILAMENTS ]`. The app changes accent color as you move through its four stages.

## Base colors (used on every screen)

| Name    | Hex       | CSS token | Use                    |
| ------- | --------- | --------- | ---------------------- |
| Ink     | `#111110` | `--bg`    | page background        |
| Surface | `#191917` | `--well`  | panels, wells          |
| Raised  | `#21211E` | `--panel` | raised elements        |
| Line    | `#2B2B27` | `--line`  | borders, dividers      |
| Bone    | `#E6E6DC` | `--text`  | main text              |
| Muted   | `#8F8F81` | `--muted` | secondary text         |
| Dim     | `#5A5A52` | `--dim`   | faint text             |

Grid overlay: `rgba(255, 255, 255, 0.035)`, 16px squares.

## Stage accents (one per stage)

| Stage     | Accent name | Accent    | Fill name | Fill      | Text on accent       |
| --------- | ----------- | --------- | --------- | --------- | -------------------- |
| 01 Prep   | Sage        | `#8FC796` | Moss      | `#3F9A62` | Ink `#111110`        |
| 02 Solve  | Sky         | `#7A9ED0` | Navy      | `#243B60` | Bone `#E6E6DC`       |
| 03 Back   | Lilac       | `#B7A6D9` | Plum      | `#4E4275` | Ink `#111110`        |
| 04 Export | Cream       | `#DACFB4` | Bronze    | `#8A6A3E` | Ink `#111110`        |

## Layer colors (the stacked-bars mark)

| Layer | Name   | Hex       |
| ----- | ------ | --------- |
| 1     | Sage   | `#8FC796` |
| 2     | Sky    | `#7A9ED0` |
| 3     | Cream  | `#DACFB4` |
| 4     | Bronze | `#8A6A3E` |
| top   | Bone   | `#E6E6DC` |

Warning / destructive actions only: Danger `#E07A5F`.

## Fonts

- Main (monospace): `ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace`
- Fallback sans: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Roboto, sans-serif`
- Body size in the app: 14px

## Copy-paste CSS for the website

```css
:root {
  --bg: #111110;
  --well: #191917;
  --panel: #21211e;
  --line: #2b2b27;
  --text: #e6e6dc;
  --muted: #8f8f81;
  --dim: #5a5a52;

  --sage: #8fc796;
  --moss: #3f9a62;
  --sky: #7a9ed0;
  --navy: #243b60;
  --cream: #dacfb4;
  --bronze: #8a6a3e;
  --lilac: #b7a6d9;
  --plum: #4e4275;
  --danger: #e07a5f;

  --mono: ui-monospace, "SF Mono", Menlo, "Roboto Mono", monospace;
  --sans: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Roboto, sans-serif;
}
```

## Logo: what exists today

There is no proper logo file yet.

- **App icon (raster only):** `public/icon-512.png`, plus `icon-192.png`, `icon-maskable-512.png` and `apple-touch-icon.png` in the same folder. A dark `#111110` square with stepped bars. These are small PNGs, not vector, so they get soft if enlarged.
- **Mismatch:** the app icon uses green, blue and near-black bars, while the in-app mark uses the layer colors above (sage, sky, cream, bronze, bone). The two should be unified.
- **In-app mark:** the animated layer stack on the main menu is drawn in CSS (`.hero-mark`, five bars at widths 100 / 86 / 72 / 58 / 36%). It is not a file, so a screenshot is the only way to grab it today.

## Logo: to do

- [ ] Redraw the layer-stack mark as an SVG (the source for everything else)
- [ ] Export transparent PNGs for dark and light backgrounds
- [ ] Make a HueLite wordmark version (mark plus name)
- [ ] Decide whether the Print-Bricks mark shares this palette or gets its own
- [ ] Replace the app icon so it matches the in-app mark
