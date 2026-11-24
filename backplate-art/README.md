# Back-plate line art (HueLite section)

196 procedural line-art designs in 21 themes, drawn in millimetres on a 200 x 200 mm canvas. Plain JS, no dependencies, works with any 2D canvas (browser, Capacitor webview, node @napi-rs/canvas).

Themes: Original, Printer, Faith, Feathers, Weather, Boats, Colors, Workout, Bible, Tech, Angels, Space, Nordic, Sea Life, Woodland, Music, Geometry, Insects, Desert, Dogs, Cities.

## Files
- `backplate-art.js` : the generators + renderer. Load with a `<script>` tag, `import`, or `require`.
- `reference-gallery.html` : the full working viewer (open in a browser). Its UI code at the bottom is the reference: theme filter, scrub slider, big prev/next, zoom + drag-to-pan, palette picker, line-weight slider, ink swatches, thinnest-feature warning, PNG + recipe export.

## API
```js
PBArt.designs      // [{id, name, note, group, multi?, blend?, draw}] (196)
PBArt.render(ctx, index, { seed, ls, ink, bg, step, margin, pal, zoom, px, py })  // returns thinnest feature in mm
```
- `ctx` must already be scaled so 1 unit = 1 mm: `ctx.setTransform(px/200, 0, 0, px/200, 0, 0)`.
- `seed` int (same seed = same art), `ls` line-weight multiplier (0.6 to 2.2), `ink` / `bg` CSS colors,
  `step` grid size in mm for contour designs (0.5 main view, 1.6 thumbnails, 0.25 export), `margin` mm clipped at the edge (default 5).
- `zoom` (0.5 to 3, default 1) scales the art about the plate centre, `px` / `py` shift it in mm (design space, before scaling). The returned thinnest feature already includes the zoom.
- `pal` is an array of hex colors. Only designs with `multi: true` use it (9 designs: all of Colors, plus Space "nebula" and Nordic "aurora"). `blend: true` means it blends smoothly through the palette; otherwise it uses flat bands. Without `pal`, a multi design renders as a solid single-ink blob, so a single-filament section should leave multi designs out until multi-ink is supported.
- Export a 200 mm PNG at 10 px/mm: 2000 x 2000 canvas, `setTransform(10,0,0,10,0,0)`, `step: 0.25`.
- A "recipe" is `{design: id, seed, lineWeight, ink, palette, zoom, panX, panY}`; saving that is enough to rebuild any design exactly.
- Ids are unique (five new designs that clashed with older names carry their theme as a suffix, e.g. `fan-feathers`).

## Notes for the printer
- Stroke widths are real mm. Anything under 0.4 mm is below a 0.4 mm nozzle; the renderer reports the thinnest feature so the UI can warn. Zooming in thickens lines, zooming out thins them.
- Single-ink designs: threshold the PNG (ink vs background) and it drops straight into the HueLite layer pipeline as a two-color layer.
- Canvas is 200 mm; Bambu A1 bed is 256 mm, so it fits with room for a border.
