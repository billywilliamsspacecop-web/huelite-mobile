# HueLite Mobile (iPhone)

Standalone iPhone version of HueLite. Plain JS + Vite, wrapped with Capacitor.
Everything runs on the phone, with no server.

## Status

| Part | State |
|---|---|
| App shell: Prep → Solve → Export stepper, stage locking, dark theme | done |
| Photo picker (library/camera), EXIF-aware, capped at 4096px for iOS canvas limits | done |
| Touch crop: drag/resize, Free / 1:1 / 4:5 / 3:2, rotate, flip | done |
| Print width (mm) + output sizing (800px long edge on phone) | done |
| Adjustments, depth solve, mesh, 3MF, cost/purge panel, share sheet | waiting on engine port from desktop `core/` |
| Saving projects between launches (IndexedDB) | with engine port |

The project data mirrors the desktop `project.json` schema, so projects can
move between the phone and the Mac later.

## Run in a browser (quick check)

    npm install
    npm run dev          # open the printed URL, or the Network URL on your phone

## Build for iPhone (on the Mac, needs Xcode)

    npm install
    npm run build
    npx cap add ios      # first time only
    npm run ios          # builds, syncs, opens Xcode

In Xcode: pick your team under Signing & Capabilities, plug in the iPhone,
and press Run. This is the same flow as Fetch Run.

## To check during the engine port

- Rotate/flip order must match desktop `core/imaging.py`; the phone rotates and then mirrors.
- The crop is stored as `[x, y, w, h]` in oriented (post-rotate/flip) pixels, like `prep.crop`.
