# Back-plate line art (HueLite section)

40 procedural line-art designs, drawn in millimetres on a 200 x 200 mm canvas. Plain JS, no dependencies, works with any 2D canvas (browser, Capacitor webview, node @napi-rs/canvas).

## Files
- `backplate-art.js` : the generators + renderer. Load with a `<script>` tag or `require`.
- `reference-gallery.html` : the full working viewer (open in a browser). Its UI code at the bottom is the reference for the section: thumbnails, filter tabs, reseed, line-weight slider, ink swatches, "thinnest feature" warning, PNG + recipe export.

## API
```js
PBArt.designs      // [{id, name, note, group: 'Original'|'Printer'|'Faith', draw}] (40)
PBArt.render(ctx, index, { seed, ls, ink, bg, step, margin })  // returns thinnest feature in mm
```
- `ctx` must already be scaled so 1 unit = 1 mm: `ctx.setTransform(px/200, 0, 0, px/200, 0, 0)`.
- `seed` int (same seed = same art), `ls` line-weight multiplier (0.6 to 2.2), `ink` / `bg` CSS colors,
  `step` grid size in mm for contour designs (0.5 main view, 1.6 thumbnails, 0.25 export), `margin` mm clipped at the edge (default 5).
- Export a 200 mm PNG at 10 px/mm: 2000 x 2000 canvas, `setTransform(10,0,0,10,0,0)`, `step: 0.25`.
- A "recipe" is just `{design: id, seed, lineWeight, ink}`; saving that is enough to rebuild any design exactly.

## Notes for the printer
- Stroke widths are real mm. Anything under 0.4 mm is below a 0.4 mm nozzle; the renderer reports the thinnest feature so the UI can warn.
- Designs are single-ink on a plain plate: threshold the PNG (ink vs background) and it drops straight into the HueLite layer pipeline as a two-color layer.
- Canvas is 200 mm; Bambu A1 bed is 256 mm, so it fits with room for a border.
