# HueLite Mobile

Phone version of HueLite. Plain JS + Vite, wrapped with Capacitor.
Prep → Solve → Export all run on the phone, with no server.

## Status

| Part | State |
|---|---|
| App shell: Prep → Solve → Export stepper, stage locking, dark theme | done |
| Wide layout for unfolded phones / tablets (preview left, controls right) | done |
| Photo picker (library/camera), EXIF-aware, capped at 4096px for iOS canvas limits | done |
| Touch crop: drag/resize, Free / 1:1 / 4:5 / 3:2, rotate, flip | done |
| Print width (mm) + output sizing (800px long edge on phone) | done |
| Print shape: rectangle, circle/oval, transparent cut-out, knock out background | done |
| Depth solve: filaments + TD, LUT, dither, foundations, rim along the outline | done |
| Previews: simulated print (flat, exact tones), 3D angle view, height, source | done |
| 3D view: real WebGL relief at true scale, drag to turn, pinch to zoom | done |
| Lasso cut: chip away, put back, or keep only what you loop; works on any shape | done |
| Colour fit: filament colours chosen so the *printed* stack matches the photo | done |
| Export: Bambu 3MF + STL + slot note, cost/purge estimate, share sheet or download | done |
| Opens in Bambu Studio with the right filaments, colours and 0.08 mm layers (A1) | done |
| Prep adjustments, presets, suggest for print (pixel-identical to the desktop) | done |
| Saving projects between launches (IndexedDB), project list | done |
| Project .zip export/import, same folder layout as the desktop | done |

The project data mirrors the desktop `project.json` schema, so projects can
move between the phone and the Mac later.

## Layout

Every screen is a preview pane plus a controls pane, and only the controls
scroll, so the preview never scrolls away while you tune.

| Screen | Layout |
|---|---|
| narrow / tall (phone, 2:3) | preview on top (40% of the height, `⤢` stretches it), controls below; two columns of controls when 560 px+ wide |
| square-ish or landscape (unfolded Fold, 1:1, tablet) | side by side |
| side by side and 780 px+ tall | two previews at once (crop + result, print + angle, top + angle) |
| short (phone on its side) | slim header, actions and stage tabs share one row |

`main.js` measures the window and sets `data-side` / `data-dual` /
`data-short` on `<html>`; it re-lays out on fold, unfold and rotate, and
never mid-typing (a soft keyboard shrinks the window).

Touch: sliders (`src/ui.js`) only move when you grab the handle, so a finger
scrolling past never changes a value. The handle is a 40 x 54 px grip on a
14 px track with a 68 px grab area, and while it is held a bubble above it
shows the value (a finger covers what is under it); the `-` / `+` buttons
(52 px) step, and repeat when held. A scroll rail with arrows runs down the
right edge of the controls. Prep puts the two sliders that matter most -
decimate and saturation - first, a little larger, then presets, then the rest.

Colours - what the preview means:

- The top-down **print** is flat by default: every pixel is exactly the tone
  the solve picked for it. The `light` chip adds relief lighting (a flat area
  is still exactly its tone; slopes get lighter or darker).
- The 3D **angle** view never shades a column's top, so its tops are the same
  tones, pixel for pixel (checked against the LUT at several heights); only
  the side walls are darkened so the relief reads.
- A stack does not print its swatches. In *translucent blend* a high-TD
  filament never turns opaque within its band, so the top of the stack came
  out darker and greyer than the colour that was picked (a #8DA573 green
  topped out at #6F6F61). **Fit colours to photo** (and the first time Solve
  opens, and when the band mode, a TD or a layer count changes while the
  colours are still the fit's) solves for the filament colours that make the
  *printed* stack closest to the prepped photo - `solve.fitFilaments`, a small
  least-squares problem, because every tone in the stack is a fixed mix of
  the filament colours. On two reference prints (a cat, a selfie) in blend mode it cut the
  average colour error from 19.1 to 7.6 and from 15.3 to 6.2 (of 255). Pick a swatch by
  hand and it stops following. The strip under a swatch is what that band
  really prints as, when that isn't the swatch.
- Prep's result preview scales the pixel-based denoise window and pixelize
  blocks to its own size, so it shows what committing will produce.

Tapping a swatch opens an in-app picker: exported colour next to "prints
as", a palette from the photo, tap-the-photo, hue + saturation/value, hex.

## Exporting for Bambu Studio (A1 only)

HueLite targets one printer: the **Bambu Lab A1** (256 × 256 × 256 mm). Prep
checks the print against that plate (the width is clamped so the whole print,
height included, fits) and Export warns when it nearly fills it.

**The bug this fixed:** a 4-colour print opened in Studio as 3 colours at
0.2 mm layers, losing a lot of detail. Studio had shown *"The 3mf file has
invalid config, load geometry data only"*, thrown away the file's filament
colours and layer height, and given the parts whichever filaments the open
project already had (extruder 4 simply didn't exist). Two things caused it:
Studio only trusts a project's settings if the `Application` line says
`BambuStudio-...` (ours said `HueLite`), and the settings have to be a complete,
consistent config (ours was four keys).

**The fix:** `3D/3dmodel.model` now says `BambuStudio-02.08.02.61` (with
"Made with HueLite" in the description), and `Metadata/project_settings.config`
is a full A1 config: `src/engine/bambu_a1.js` is the config of a project Studio
itself saved (stock `0.20mm Standard @BBL A1`, Bambu PLA Basic), and
`projectSettings()` in `bambu3mf.js` fills in our colours, the 0.08 mm layer
height, one entry per filament in every per-filament list, the flush-volume
matrix, and a small prime tower parked just past the print. Checked with
Studio's own command line (`BambuStudio --info --export-settings file.3mf`):
the file loads, the same triangles come out, and the exported settings show our
colours, `layer_height 0.08` and the A1 printer, for 2, 3 and 4 filaments. A
file with the old config makes it report a single default filament and 0.2 mm.

Notes: the config is from Studio 02.08.02.61; an older Studio may say the file
is newer. The desktop exporter has the same two problems and wants the same
change. Studio keeps its log encrypted, so the exact rejection reason is
inferred, not read.

## Main menu

The old project list is now a **main menu** (`menuMain` in `main.js`): a hero
mark, then Continue (the last project you touched, when there is one), New
project, Projects, Import a project, Settings, Help and About. "☰ menu" in a
project saves and returns here; "‹ menu" backs out of a sub-page.

- **Projects** keeps everything the old page had: list or album, folders, move,
  zip, delete, import.
- **Settings**: sound on/off, volume and a demo; motion (full or calm); swipe
  between stages on/off; how much storage projects use; reset settings (never
  touches projects). Stored in `localStorage` as `huelite.*`.
- **Help**: the three steps, moving around, gestures, tips.
- **About**: build, what it exports, privacy (nothing leaves the phone), source.

## Sound

`src/sfx.js` - 11 short sounds synthesized live with WebAudio (no audio files).
The rule is "quiet, uniform, and only where it means something":

- **Between stages** (kept as designed): the stage-tab press, a whoong that
  rises going forward and falls going back, a soft ping per control group as
  it lands, and a low buzz for a stage that isn't open yet. The chimes sit on
  the stage's note (Prep C5, Solve E5, Export G5). Swiping makes the same sounds.
- **Everywhere else**: one quiet tick for any button; a soft two-note "done"
  when a job finishes (not when it ends by changing page - the page sound is
  the cue); a warmer three-note one when an export is built; a low double buzz
  if something fails.
- **Main menu**: silent, except a small blip when you pick a project.
- **Never**: sliders, the scroll bar, crop, lasso, the 3D view, colour sheets.

The ♪ button in the header mutes everything (turning sound on blips; off is
silent). Browsers keep audio locked until a touch, so the first tap only
unlocks it, and a sound asked for long before is never replayed late.
`_LIB` and `_useContext` render any sound into an OfflineAudioContext for tests.

## Folders and the album

Projects (from the main menu) has a **list / album** switch. Projects can be filed into folders: "move"
on a project opens a picker (an existing folder, none, or a new name); folders
get collapsible headers with rename and ungroup. The folder is stored as
`group` in `project.json` (phone-only - the desktop's own `folder` field is
left alone), and the collapsed/expanded state and the chosen view are
remembered on the phone.

The **album** is a scrollable grid of cards. A solved or exported project shows
its print from the side (a low, turned view with the height stretched so the
relief reads), made with the 3D renderer at solve time and kept in
IndexedDB as `<id>/side`; an older solved project gets one the first time the
album opens. A project that hasn't been solved shows a greyed-out dashed slab
marked "not solved yet". Re-running Prep clears the stale side view.

The scroll rail is bigger and tucks into the screen edge with a grip showing:
scrolling slides it out for a moment, tapping or dragging the grip pins it
open (and back).

## Imported files

A `.zip` or `project.json` from outside is not trusted: `sanitizeProject`
(state.js) clamps every number, restricts colours to `#RRGGBB` (they end up in
style attributes), validates lasso loops and caps names; unzipping refuses
entries that inflate past 256 MB and PNGs past ~36 megapixels, and the file
itself past 400 MB.

## Motion

All decoration, in `styles.css` (end of file) plus `src/swipe.js`; nothing waits on
an animation, and `prefers-reduced-motion` turns it all off.

- **Stage changes slide**: forward (Prep → Solve → Export) comes in from the
  right, back from the left, trailing a four-stripe edge in the filament-layer
  colours. Controls arrive one group at a time, previews fade up, the frame
  corner marks close in, the main button catches the light once. Opening a
  project or the home screen rises in instead.
- **Swipe left / right between stages.** The screen follows the finger and
  either flies off (far or fast enough) or springs back. A stage that isn't
  unlocked resists like a rubber band and toasts "Finish Prep first". It
  never starts on sliders, the crop/lasso, the 3D view, the scroll rail,
  inputs or the colour sheet, and a mostly-vertical drag is just a scroll.
- **Loader**: coloured layers stack up under a print head, with a dotted label
  (`loader()` in `main.js`; a small inline version while projects load).
- Switching preview views cross-fades; buttons and chips press in; the slider
  handle lifts while held; the colour sheet slides up (or in from the right).
- The entrance replays only on real navigation (`data-enter` on `#app` is set
  for one render), not on a resize or fold/unfold.

## 3D view

`src/engine/view3d.js`. Nothing is meshed on the CPU: the heights go up as a
texture and one instanced draw puts a flat-topped column at every cell, at
the print's real scale (a "relief x3 / x6" button stretches the height to
read it more easily). A wall is only drawn where its neighbour is lower, and
wall colours come from the LUT by layer height, so the filament bands stack
up the way they print. Drag turns, two fingers zoom, double-tap resets; a
coarser copy is drawn while a finger is moving. Solve uses the 360 px proxy,
Export the full prepped resolution. Without WebGL2 it falls back to the old
2D painter (`mesh.renderOblique`).

## Lasso cut

Under Shape, "lasso cut" opens a drawing layer on the crop view; the photo
gets bigger and a toolbar appears under it. Draw a loop with a finger:

| tool | effect |
|---|---|
| cut away | remove what is inside the loop |
| put back | restore what a cut took away (never beyond the base shape) |
| keep only | keep what is inside the loop, remove everything else |

Each loop is one cut; undo steps back, clear removes them all. Cuts apply on
top of whichever shape is chosen (rectangle, oval, cut-out, knock out bg), so
a rough knock-out can be tidied by hand. They are stored in `prep.shape.cuts`
as loops in the photo's own 0..1 coordinates (phone only - the Mac sees the
resulting `shape.png`), so they stay on the subject through rotate, flip and
re-crop. The geometry (`fillPolygon`, `simplify`, `applyCuts`) is in
`shape.js`.

## The engine

`src/engine/` is a port of the desktop's `core/`:

| JS | Desktop |
|---|---|
| `shape.js` | `core/shape.py` |
| `solve.js` | `core/solve.py` |
| `mesh.js` | `core/mesh.py` |
| `bambu3mf.js`, `zip.js` | `core/bambu3mf.py` |
| `imaging.js` | `core/imaging.py` (Pillow) |
| `projectzip.js`, `png.js` | a project folder, `core/project.py` |

On the same input it matches the desktop exactly: the same Prep
adjustments pixel for pixel (Pillow's filters are reproduced, including
its median cut), the same masks, heightmap and mesh, and the same geometry
in `3D/3dmodel.model` inside the 3MF (byte for byte, apart from the two header lines
that Studio needs - see Exporting for Bambu Studio). Keep it that way: when one side changes, change the other. Colour
import is a deliberate difference: the phone clusters colours instead of
using PIL's median cut, so a small but real area (black text on a red badge)
still gets its own slot, and then fits them to the stack (see Colours). The
3D view and the lasso are phone-only too; with no cuts the outline is the
same as the desktop's.

## Moving projects between phone and Mac

Phone → Mac: "zip" on a project (or "save whole project" in Export), then
unzip it into `~/Documents/HueLite/projects/`. Mac → phone: Finder ›
Compress a project folder, then "import a project (.zip)" on the phone.

Saved projects live in the browser, per address: `http://192.168.x.x:5173`
and `http://localhost:5173` each keep their own list.

## Hosted copy (no laptop needed)

`npm run deploy` builds the app and publishes it to the `gh-pages`
branch, which GitHub Pages serves. The app is static, so nothing runs on a
server and photos never leave the phone. Open the Pages address once on
the phone; after that it works offline, and "Add to Home screen" installs
it. A new deploy shows up the next time the app opens with signal, as a
"new version ready - reload" bar; the build time is at the bottom of the
project list.

To take it down: repo Settings > Pages > unpublish, or make the repo
private, or delete the repo.

## Run on a phone (same Wi-Fi as the Mac)

    npm install
    npm run dev          # prints a Network URL, e.g. http://192.168.4.79:5173

Open the Network URL in the phone's browser. Plain http has no share
sheet, so exports save to Downloads instead.

## Build for iPhone (on the Mac, needs Xcode)

    npm install
    npm run build
    npx cap add ios      # first time only
    npm run ios          # builds, syncs, opens Xcode

In Xcode: pick your team under Signing & Capabilities, plug in the iPhone,
and press Run. This is the same flow as Fetch Run.

## Build for Android (needs Android Studio)

    npm install @capacitor/android
    npm run build
    npx cap add android  # first time only
    npx cap sync android && npx cap open android

## To check when touching the engine

- Rotate/flip order must match desktop `core/imaging.py`; the phone rotates and then mirrors.
- The crop is stored as `[x, y, w, h]` in oriented (post-rotate/flip) pixels, like `prep.crop`.
- The shape is cut from the plain crop before any adjustments, like the desktop, so a
  painting preset can't move the edge of the print.
