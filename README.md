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
| Previews: simulated print, ~30° angle, height, source | done |
| Export: Bambu 3MF + STL + slot note, cost/purge estimate, share sheet or download | done |
| Prep adjustments (brightness, contrast, denoise, decimate...) | not yet |
| Saving projects between launches (IndexedDB) | not yet |

The project data mirrors the desktop `project.json` schema, so projects can
move between the phone and the Mac later.

## The engine

`src/engine/` is a port of the desktop's `core/`:

| JS | Desktop |
|---|---|
| `shape.js` | `core/shape.py` |
| `solve.js` | `core/solve.py` |
| `mesh.js` | `core/mesh.py` |
| `bambu3mf.js`, `zip.js` | `core/bambu3mf.py` |

On the same input it matches the desktop exactly: the same masks,
heightmap and mesh, and a byte-identical `3D/3dmodel.model` inside the
3MF. Keep it that way: when one side changes, change the other. Colour
import is the one deliberate difference: the phone clusters colours
instead of using PIL's median cut, so a small but real area (black text
on a red badge) still gets its own slot.

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
