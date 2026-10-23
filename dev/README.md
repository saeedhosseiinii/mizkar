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
