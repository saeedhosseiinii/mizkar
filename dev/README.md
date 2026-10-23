# dev — building Mizkar

`index.html` in the repository root is a **built** file: one HTML file with the styles, the two
vendored libraries and the app in it, so the app keeps working from a `file://` path and offline.
This folder holds what it is built from.

```
dev/
├── nb.js              the notebook module: sidebar, search, calendar, links, Git sync, IndexedDB
├── sw.js              the service worker (offline shell + the «share» POST handler)
├── manifest.webmanifest  the PWA manifest, including the share target
├── nb.css             its styles (appended to the app's own stylesheet)
├── nb.markup.html     the drawer, dialogs and the toolbar/status bits it needs
├── home.js            «امروز» (the empty page once the notebook is in use), «کارها» (tasks with due dates),
│                      recent notes, notes in the Ctrl+K palette — shares nb.js's scope
├── ui.js / ui.css     the calmer layout: format chips → status-bar menu, one read/edit switch,
│                      «ابزارها» menu, preview «⋯» menu (nothing removed: buttons move into menus)
├── beta.py            builds /beta/ from index.html with its own storage namespace (see below)
├── apply.py           assembles index.html from the pristine upstream file + the three above
├── test_nb.js         engine tests: Jalali dates, paths, templates, zip, diff, merge
└── test_ui.js         end-to-end tests: the real page under jsdom against a fake GitHub
```

## Build

```bash
python3 dev/apply.py                 # writes index.html
python3 dev/apply.py --base base.html   # or from an explicit file
```

`apply.py` never builds from a previous build: it starts from the upstream commit recorded in
`PRISTINE` (`git show <sha>:index.html`), applies the marked patches to the app, inserts the
notebook module and the version stamp. Re-running it is idempotent, and every anchor is asserted,
so a change to the app code that breaks an anchor fails loudly instead of silently.

## Tests

```bash
npm install jsdom        # only needed for test_ui.js
node dev/test_nb.js      # pure engine, no DOM
node dev/test_ui.js      # the real page in jsdom, GitHub replaced by an in-memory fake
```

`test_ui.js` strips the two vendored libraries for speed and drives the actual UI. It covers the
whole notebook: connecting to the fake repository (GitHub shapes, and GitLab shapes through the
same calls), a Shamsi-dated note opened as a tab, one batched commit for many changes, a pull that
brings another device's edit, a forced conflict and its resolution, deletion, the idle timer
committing on its own, full-text search with Persian normalisation, tags and backlinks, renaming
that rewrites `[[links]]`, the link suggestion popup, the Shamsi calendar, an encrypted note whose
ciphertext is what reaches the repository, an image attachment riding up in the same commit, the
read-only `Claude Sessions` folder, and switching between two notebooks.

## Beta

```bash
python3 dev/apply.py && python3 dev/beta.py beta "what changed" …
```

The beta is served at `/mizkar/beta/` on the same origin as the main site, so everything per-origin gets its
own name: IndexedDB `mizkar-beta` (the notebook upgrades its database to version 2, which would lock the main
site — still at version 1 — out of `mizkar`), storage keys `mzb-*` instead of `fs2-*`, offline cache `mzbeta-*`.
The first run copies the main site's tabs, settings and recent texts, reading only. The main site's worker
leaves `/beta/` to the network (one line in its `sw.js`).

## Review fixes (after the first delivery)

- secret notes: nothing decrypted is written to IndexedDB, saved tabs or recent texts (`localCipher` holds
  unsent text, encrypted); a note turns secret only once the passphrase is known; remote edits to a secret
  note are taken (unchanged locally) or merged plain to plain; PBKDF2 600 000 rounds, rounds read from the header
- token lock («قفل توکن»): tokens rest only encrypted; sync pauses while locked; the status chip unlocks
- GitHub push: `base_tree` is the base commit's tree; blobs upload four at a time
- the app's hooks into this module (`nbAfterSwitch`, `nbHomeHtml`, `nbPaletteItems`) are published on
  `window`: the module is a closure, and `typeof nbAfterSwitch` in the app was always `undefined`
