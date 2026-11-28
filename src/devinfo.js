// What the Dev page shows: the app's versions with what changed in each, and
// notes Claude left for Bryce. Plain data, kept short on purpose: one entry
// per real release, not every commit.

export const APP_VERSION = "0.5.0";

export const VERSIONS = [
  {
    v: "0.5", name: "Print-Brick", dates: "Nov 22 – 25, 2026", current: true,
    changes: [
      "Size presets: The Brick 75 × 115, The Block 150 × 150, The Signature 200 × 200 mm",
      "Rounded corners and a 7 mm full-height rim by default, against corner and edge peeling",
      "Solid prints: 4 mm total, thinnest spot at least 2 mm (the base grows to fit)",
      "Foundations slider 10× finer: 0.001 mm steps up to 0.100",
      "Stack order: swap any two colours, flip the order, or dark → light",
      "Flatter relief: 6 layers per colour by default (was 12), with a relief slider",
      "PRINT-BRICK name and logo raised on the front border",
      "Projects shelf: swipe through prints in 3D, front and back, sort and filter",
      "Stage switching: later stages stay reachable and update when you continue",
      "196-design back-plate library in 20 themes, with zoom and shift",
      "Studio-style buttons and an AMS-style spool panel",
      "Dev page: versions, changelog, notes",
      "Update screen: a ready card, and a little celebration once it installs",
      "Check for updates on the main menu: install now, or wait for the next open",
      "Sealed meshes: fixed the \"open edges\" Studio found in the back-art base layer",
    ],
  },
  {
    v: "0.4", name: "Back of the print", dates: "Nov 16 – 21, 2026",
    changes: [
      "Back stage: line art printed against the plate, read when turned over",
      "Art border: a band round the print carrying the back's design",
      "Back up every project in one .zip, and restore it",
      "Full-screen 3D view, sub-folders, plate-fit warnings",
    ],
  },
  {
    v: "0.3", name: "Sound and menu", dates: "Oct 30, 2026",
    changes: [
      "Synthesized sound effects, quieter by default",
      "Main menu",
      "3MFs that open ready to print in Bambu Studio (A1)",
    ],
  },
  {
    v: "0.2", name: "Every screen", dates: "Oct 17 – 28, 2026",
    changes: [
      "Layouts for every phone and tablet shape, finger-sized controls",
      "Colour fit, 3D view, lasso cuts, folders and album, motion",
    ],
  },
  {
    v: "0.1", name: "First phone build", dates: "Sep 27 – Oct 11, 2026",
    changes: [
      "The desktop engine on the phone: Prep, Solve, Export",
      "Shaped prints, saved projects, project zips, works offline",
    ],
  },
];

/** Notes from Claude for Bryce: things to know, and what is waiting on a decision. */
export const CLAUDE_NOTES = [
  {
    title: "Making HueLite private is half done",
    body: "Back up all projects on the phone (Projects › back up all projects) and put the .zip on the Mac. " +
      "Then Claude can take the public site down, make the GitHub repo private and run HueLite from the Mac over Wi-Fi.",
  },
  {
    title: "Peeling",
    body: "New projects use rounded 3 mm corners and a rim at 100% of the print's height. If a corner still lifts, " +
      "try 6 mm corners in Prep, or add a brim in Bambu Studio. Older projects keep their old rim until you change it in Solve.",
  },
  {
    title: "Front branding colour",
    body: "PRINT-BRICK on the front uses the filament that contrasts most with the rim's top colour. " +
      "With a white top it prints in your darkest slot.",
  },
  {
    title: "Thickness",
    body: "New projects are 4 mm tall with the thinnest spot at least 2 mm (Solve › thickness). The extra is base in slot 1, " +
      "so colours don't change. With the flatter 6-layer relief, a 2 mm base lands right at about 4 mm.",
  },
];
