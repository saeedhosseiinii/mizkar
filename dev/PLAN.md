# Mizkar notebook — next round of changes (plan for the implementer)

This plan is for the model that implements the next round on the `notebook` branch. Read `dev/README.md`
first: it explains the build (`dev/apply.py`), the beta (`dev/beta.py`) and the tests.

## Ground rules

- **Never edit `index.html` by hand.** Change `dev/*.js|css|html` and rebuild with `python3 dev/apply.py`.
  New modules go in the same scope as `nb.js` (see how `home.js`, `ui.js`, `inplace.js` are inserted).
  Anything the app (outside the notebook closure) must call is published on `window` (see the end of `nb.js`).
- **The main site stays untouched.** Ship only to `/beta/` with `python3 dev/beta.py <main-worktree>/beta "note" …`,
  committed on `main` as the `beta/` folder. `beta.py` gives the beta its own storage; keep it that way.
- **Every item gets tests** in `dev/test_ui.js` (jsdom + fake GitHub) or `dev/test_nb.js` (pure engine). The full
  suites must stay green (`node dev/test_nb.js`, `node dev/test_ui.js`; jsdom from `npm i jsdom`).
- **One commit per item**, message says what the user gets. No mention of AI tools in commits.
- **RTL first.** The UI is Persian and right-to-left. Strings are Persian; follow the existing tone (short,
  plain, no jargon). Check every new piece at 360px wide and at 1440px wide.
- **Nothing silently loses data.** Moves, deletes and drops of notes are undoable (toast with «بازگشت») or
  confirmed; a secret (encrypted) note never gets its plaintext written anywhere (see `nbPersistable`).

## Priorities

1. Layout regroup + sidebar toggle (§1), right-click map (§2), all-Shamsi dates (§3), pending-changes list (§8)
2. Mobile app feel (§4), recent texts in the sidebar (§7)
3. Drag and drop (§5)
4. Polish and extras (§6)
5. Sharing through Gist (§9)
6. Mobile-first shell (§10), when the user approves it

---

## 1. Layout: the app shell

**Today:** the top bar is brand (right) … then `.bar-end` on the left with: notebook toggle, «ویرایش»,
recent texts, Ctrl+K, «ابزارها», settings, export. The notebook sidebar (`#nb`) is a drawer that slides in
from the right, under the tab strip; its toggle lives in the top bar far from it.

**Wanted:**

1. **Every control except «خروجی» moves to the right side** of the top bar (next to the brand, in this order
   from the right): sidebar toggle · «ویرایش/خواندن» · recent texts · «ابزارها» · Ctrl+K · settings.
   «خروجی» (export) stays alone on the left. Keep the same buttons/actions; only the placement changes
   (do it in `ui.js`/`ui.css`, not by editing the base markup).
2. **The sidebar toggle sits on the sidebar's own edge**, on the right: a slim handle/button attached to
   the drawer that opens and closes it in place (`nbSidebar()`), visible when the drawer is closed too
   (a small tab on the right edge of the window). The top-bar notebook button can then go.
3. **Docked on wide screens:** at ≥1100px the open sidebar pushes the page instead of covering it (the preview
   and the outline shift left; `nb.css` already has a ≥1100px block to start from). Below that it overlays.
   The open/closed state and its width (it already has a grip) are remembered.
4. **Collapsed rail (optional, desktop):** when closed, a 44px icon rail on the right with: دفترچه · امروز ·
   جستجو · تقویم · کارها · موقت. Clicking an icon opens the drawer on that section.

**Accept:** at 1440px the top bar shows everything but export on the right; the drawer opens/closes from its
own edge handle; at ≥1100px the open drawer does not hide the text; state survives a reload.

## 2. Right-click (and long-press) map

A long press (≈450ms, finger still) opens the same menu on touch screens. Use one menu component (`nbMenu`
or the tab `ctx-menu`) so all menus look and behave alike (keyboard: arrows, Enter, Esc).

| Where | Menu |
|---|---|
| Notebook tree — empty space | ✅ exists: new note / folder / collection / quick capture / pull / push |
| Notebook tree — folder | ✅ exists; add «یادداشت از قالب…» (pick a template) and «باز کردن همه در تب» |
| Notebook tree — note | ✅ exists; add «انتقال به مجموعه…» (§5.2), «سنجاق در تب» , «باز کردن در تب تازه» |
| Calendar — a day | **new:** one item per collection with a calendar: «روزانه — باز/ساختن», «جلسه ها — یادداشت تازه…»; then «یادداشت های این روز» (list) and «کارهای این روز» |
| Calendar — month header | **new:** «فقط مجموعهٔ …» (filter the dots to one collection), «همهٔ مجموعه ها», «برو به امروز» |
| Calendar — a collection dot/legend | **new:** «یادداشت های این مجموعه» → switches the sidebar to the notes of that collection (tree scrolled to its folder, or search filtered by it) |
| «کارها» — a task | **new:** «تاریخ سررسید…» (Shamsi picker, writes 📅), «امروز» / «فردا» / «بدون تاریخ», «باز کردن یادداشت», «انجام شد» |
| «امروز» page — a note or a task | **new:** same as the tree note / task menus |
| Preview (reading a note) | **new:** «ویرایش اینجا» (in-place edit at that block — `ipEdit`), «کپی پیوند این سرتیتر» (for headings: `[[note#heading]]`), «کپی متن بلوک» |
| Editor (in-place, a selection) | **new:** «پیوند به یادداشت…» (wraps the selection in `[[ ]]` with the suggest list), «یادداشت تازه از انتخاب» (moves the selection into a new note and leaves a link), «کار کن» (prefix `- [ ] `) |
| Tab | ✅ exists; add «ذخیره در دفترچه…» for temp tabs, «نمایش در درخت» for note tabs |
| Search result | **new:** open / open in new tab / copy link |
| Attachments | ✅ exists |

Keep the browser's own menu where it matters: inside text fields when nothing is selected, and on links in
the preview (or add «باز کردن پیوند» / «کپی نشانی» to ours).

**Accept:** every row above opens its menu by right-click and by long-press; each item works and is tested.

## 3. Dates: Shamsi everywhere

**Today:** the calendar grid is Shamsi, but the new-note dialog uses `<input type="date">` (Gregorian,
`nbPanelDate`), templates write `date: {{gdate}}` and `{{date}}` falls back to the Gregorian date, a new note
from `nbWikiOpen` writes a Gregorian `date:`.

**Wanted:**

1. **A Shamsi date picker** component (month grid in Persian, week from `C.weekStart`, today marked, typing
   `1405/08/05` or Persian digits works) replacing every `<input type="date">`; reuse it for task due dates (§2).
2. **Templates speak Shamsi:** `{{date}}` becomes the Shamsi date (`1405-08-05`); the samples in
   `NB_TEMPLATES` use `{{date}}` for both the title and the front matter. `{{gdate}}` stays available.
3. **Front matter:** write `date: 1405-08-05` (Shamsi) and also `created: 2026-10-27` (ISO) so tools that
   need a Gregorian date (Obsidian's calendar plugins, Dataview) still work. Reading accepts either.
4. **Everywhere the UI shows a date** (history, recent notes, «امروز», task due labels, sync times, commit
   times in note history) it is Shamsi with Persian digits.
5. The calendar shows Persian month and weekday names only; an optional small Gregorian day number in the
   corner of each cell (setting «نمایش تاریخ میلادی کنار روزها», default off).

**Accept:** no Gregorian date is visible anywhere in the notebook with default settings; a note made today has
`date: <Shamsi>` and `created: <ISO>`; the picker accepts typed Persian digits.

## 4. Mobile: feel like an app

1. **Bottom navigation** (≤760px): «امروز» · «دفترچه» · «جستجو» · «تقویم» · «+» (new note / quick capture
   sheet). The top bar shrinks to: title of the current note, «ویرایش/خواندن», «⋯» (everything else).
2. **Sheets, not drawers:** sidebar sections, dialogs and menus open as bottom sheets with a grab handle,
   swipe down to close, and the Android/iOS back button closes the top sheet (push a history state when a
   sheet opens, `popstate` closes it).
3. **Touch targets** ≥44px; no hover-only controls (tab ✎/pin, row actions): show them always or via long-press.
4. **Long-press = right-click** everywhere (§2); light haptic (`navigator.vibrate(10)`) when a menu opens.
5. **Editing on a phone:** the Markdown toolbar sits above the soft keyboard (`visualViewport`, the notebook
   already tracks `--nb-kb`); the in-place editor keeps the caret line visible while typing.
6. **Pull to refresh** on the notes list and «امروز» runs a pull (`nbPull({loud:true})`).
7. **Viewport:** `100dvh` instead of `100vh`, `env(safe-area-inset-*)` padding for notches and the home
   indicator, `theme-color` following light/dark, `overscroll-behavior: contain` on scroll areas.
8. **Hide desktop-only tools** on phones: hand mode, zoom buttons, outline panel, two-column view.
9. **Quick capture from anywhere:** the share target already parks text; on open, «ثبت سریع» shows it.

**Accept:** at 360×740 every flow (open «امروز», tick a task, open a note, edit, back, search, calendar, new
note from template, sync) works with one thumb and no horizontal scroll; Back closes sheets before leaving.

## 5. Drag and drop

Use pointer events (mouse drags at once; touch after a long press, like the tab bar already does — see
`tabDrag` in the app) so it works on phones. Show a drop indicator; Esc cancels; every move is one undo.

1. **Tree:** drag a note onto a folder → move it there (`nbMoveNote`); drag a folder onto a folder → move the
   folder with its notes (like `nbRenameFolder`); drop on empty space → to the root.
2. **Into a collection:** dropping a note on a collection's folder (or choosing «انتقال به مجموعه…»)
   renames it with that collection's pattern: dated patterns take the date from the note's front matter
   (`date`/`created`), else today; `{title}` from the note's title. Ask once if the name would collide.
3. **Tasks onto the calendar:** drag a task (from «کارها» or «امروز») onto a day → sets/changes its `📅`.
4. **Notes onto the editor:** drop a tree note into the in-place editor → inserts `[[title]]` at the drop point.
5. **Temp tab onto a folder:** drag a temp tab from the tab bar onto a tree folder → «ذخیره در دفترچه» there.
6. **Files from the computer:** `.md` → imported as notes into the folder they are dropped on; images → into
   `attachments/` and linked when dropped on the editor (attachments already exist: `nbAddAttachment`).

**Accept:** each drag above works with a mouse and with touch, shows where it will land, and can be undone.

## 6. Polish and extras

1. **Connect wizard:** first open of the notebook → three steps (make a private repository — with a link and a
   short how-to; make a fine-grained token for that repository only, Contents read/write — with a link; paste
   and test). Today this is a raw settings form.
2. **Front matter form:** the properties strip in the preview becomes editable (status, tags, date with the
   Shamsi picker) without touching YAML.
3. **Trash:** deleted notes stay recoverable from «سطل بازیافت» until they are pushed (and from git history after).
4. **Keyboard map:** `?` shows all shortcuts; consistent ones for: new note, quick capture, today, search,
   calendar, tasks, toggle sidebar, read/edit.
5. **Consistent motion and spacing:** one easing/duration for drawers, sheets, menus; one radius scale; one
   spacing scale; skeleton rows while the first pull runs instead of an empty tree.
6. **Empty states with one clear action** for: empty notebook, no tasks, empty day, no search results.
7. **Claude Sessions:** the KB script on the user's machine (`/var/www/kb/tools`) will push its notes into
   `Claude Sessions/`; keep that folder read-only and give it its own filter in search.

## 7. Recent texts move into the sidebar («موقت»)

**Today:** recent texts (up to 200, stored in IndexedDB, `historyLoad()`/`remember()` in the app) open from a
clock button in the top bar as a popover; the sidebar has a separate «موقت» section listing open temp tabs.
Both are about «not in the notebook» texts, in two places.

**Wanted:**

1. The «موقت» section gets two parts: **«باز»** (open temp tabs, as today) and **«اخیر»** (the recent texts),
   with one search box on top that filters both.
2. «اخیر» is grouped by day: «امروز» · «دیروز» · «این هفته» · «قدیمی‌تر». Each row: title, kind (JSON, Log,
   … or «تب بسته‌شده»), size, time; hover (or long-press) shows the first lines.
3. Row actions (buttons on hover/focus, and the same in right-click / long-press): «باز کردن» ·
   «ذخیره در دفترچه…» (pick folder/collection, like temp tabs) · «حذف»; plus «پاک کردن همه» at the bottom.
4. The clock button leaves the top bar; Ctrl+K keeps its «متن اخیر: …» entries; the bottom navigation (§4)
   reaches it through «دفترچه» → «موقت».
5. Secret notes never appear here (`remember()` already refuses them — keep it that way).

**Accept:** no clock button in the top bar; «موقت» shows open tabs and the grouped recent texts with one search;
opening, saving to the notebook and deleting work from the row and from its menu.

## 8. What is waiting to be sent

**Today:** the status chip says «تغییر منتظر ارسال ۲» and its popover has «گرفتن»/«ارسال», but not *which*
files are waiting. Files the user did not touch directly also count (a template made with a collection,
`.mizkar/config.json` after collection changes), which is confusing.

**Wanted:**

1. The chip's popover lists the pending files (`nbDirtyList()` plus pending attachments): title, folder, and
   what happened — «تازه» (new), «ویرایش» (changed), «حذف» (deleted), «جابه‌جا» (moved: shown as one row
   old → new, not as a delete plus a new file). System files get a plain label: `.mizkar/config.json` →
   «تنظیمات مجموعه‌ها», `templates/…` → «قالب».
2. Each row: click opens the note; a small diff view («چه چیزی عوض شده») against the last pulled version
   (the app has a line diff: `nbDiffLines`, and a compare view); «دور انداختن تغییر» puts the file back to the
   pulled version (or removes a new file, or restores a deleted one) after a confirmation, with «بازگشت».
3. «ارسال همه» at the bottom; if sending is blocked, the popover says why in one line (no repository/token,
   token locked, offline, conflict) with the button that fixes it.
4. The sidebar footer («۲ تغییر منتظر ارسال») opens the same list.

**Accept:** with two edited notes and one deleted, the popover shows three rows with the right labels; discarding
one brings back the pulled text and the count drops; «ارسال همه» sends the rest in one commit.

## 9. Sharing through GitHub Gist (password optional) and «اشتراک‌ها»

**Today:** «لینک اشتراک» puts the whole text inside the link (`makeShareLink`, `#z=…`). Long notes make links
too long for Telegram, a link cannot be taken back, and nobody knows what was shared.

**Wanted:**

1. «اشتراک‌گذاری…» on a note (menu, ⋯, Ctrl+K) opens a small sheet with three choices:
   - «باز» — anyone with the link reads it. The gist holds the plain Markdown.
   - «کلید در لینک» — the gist holds AES-GCM ciphertext; the random key is in the link's fragment
     (`#g=<id>.<key>`), which never reaches GitHub. Whoever has the full link reads it without typing anything;
     github.com shows only ciphertext.
   - «رمزدار» — the same ciphertext, the key comes from a password (PBKDF2, the code secret notes already use);
     the link is `#g=<id>` and the reader is asked for the password. The password is never stored.
   The default is «باز» for normal notes. A secret note can only be shared «رمزدار» or «کلید در لینک», and
   the sheet says so.
2. The gist is created with the connected GitHub token (`POST /gists`, `public:false` = unlisted). The token
   needs the Gists permission (fine-grained: Account → Gists → read/write; classic: `gist` scope). If it does
   not have it, the sheet says that in one line and shows the steps instead of failing at send time.
   One gist per share, file `<slug>.md` (or `<slug>.mizkar` for ciphertext), description
   `mizkar-share: <title>` so the app can find its own gists again.
3. Opening a link: the app reads `#g=` on load (next to `readShareHash`), fetches the gist without a token
   (`GET https://api.github.com/gists/<id>`; for a large file follow `raw_url`), decrypts if needed and opens
   it read-only in a temporary tab, like the current share link. Deleted gist → «این اشتراک برداشته شده».
   Wrong password → asks again, nothing else happens.
4. «اشتراک‌ها» — one list of everything shared, reachable from the note's ⋯ («اشتراک‌های این یادداشت»), the
   settings page, and Ctrl+K. The source of truth is GitHub (`GET /gists`, filtered by the description
   prefix), so the list is the same on every device; a local copy keeps it usable offline and remembers each
   link's key for «کلید در لینک» shares (never the password). Each row: note title, mode (باز / کلید / رمز),
   date, and actions «کپی لینک», «به‌روزرسانی» (re-send the note's current text into the same gist, same link),
   «برداشتن» (`DELETE /gists/<id>` after a confirm; the link stops working).
5. Optional expiry («بعد از ۱ روز / ۷ روز / ۳۰ روز / هرگز») stored in the gist description; the app deletes
   expired shares the next time it runs online and says so in a toast. The sheet states plainly that a gist
   cannot expire by itself.
6. Not in this round: images (warn «تصویرها همراهش نمی‌روند» when the note has attachments), GitLab snippets.

**Accept:** with a token that has Gists, sharing a note «باز» gives a link that opens the text in a fresh
browser; «رمزدار» asks for the password and a wrong one opens nothing; the gist's page on github.com shows
only ciphertext for the two encrypted modes; «اشتراک‌ها» lists all three, «به‌روزرسانی» changes what the same
link shows, and «برداشتن» makes the link say it was removed. Tests: the fake GitHub in `dev/test_ui.js` gets
`/gists` (create, list, patch, delete, get); the crypto round-trip and the link parsing go in `dev/test_nb.js`.

## 10. A mobile-first app shell (proposed — starts only after the user says go)

**Why:** the shell grew from a desktop page by patches. Today there are 7 different width breakpoints (600, 640,
700, 760, 900, 1099, 1100), 8+ separate overlay systems (`.pop`, `.ctx-menu`, `#nbMenu`, `#nbMini`, `#nbMini2`,
`#nbModal`, `.modal`, the palette, the sheets) with z-indexes from 96 to 450, and three different controls that
open the same drawer (edge tab, rail, top-bar button). The user finds opening the side menu and reaching the
settings awkward, and uses the app on the phone a lot. The engine (storage, sync, merge, encryption, collections,
in-place editor, tests) is good and stays; only the shell around it changes.

**Wanted:**

1. **One layout system, three sizes:** phone ≤ 640, tablet 641–1099, desktop ≥ 1100. Every rule uses these three;
   the old breakpoints go. Spacing, radius and z-index are tokens (`--z-bar`, `--z-drawer`, `--z-sheet`,
   `--z-menu`, `--z-toast`), never raw numbers.
2. **One layer manager:** a single `layer.open(kind, el)` / `layer.close()` for menus, dialogs, sheets and the
   palette. On the phone every layer is a bottom sheet; on desktop a popover or a centred dialog. It owns Esc,
   the phone's Back (one history entry), focus return and the backdrop. The current `nbBack*`, `nbMenu`,
   `nbModalBox` and the app's `.pop` all go through it.
3. **Phone:** no drawer. A bottom bar with «امروز · یادداشت‌ها · جستجو · تقویم · بیشتر» switches full-screen
   pages. A note opens as its own page with a top bar: ← back, the title, the sync dot, ⋯ (everything that is
   now in the right-click menu). «بیشتر» holds «موقت», «کارها», «اشتراک‌ها» and «تنظیمات».
4. **Desktop:** the notebook panel is always on the right, with one toggle in one fixed place (top bar, right
   end) and the sections as tabs at its top. The edge tab and the rail go. The panel's width is remembered.
5. **Settings as a page, not a long dialog:** one «تنظیمات» with a short list — اتصال (connect wizard: provider,
   repository, token with a «آزمایش»), همگام‌سازی (auto send, sync when back online, interval), مجموعه‌ها,
   پوشه‌های فقط خواندنی, ظاهر, امنیت (secret notes, token lock), اشتراک‌ها (§9). The app's own settings and the
   notebook's settings live in this same page. Reachable from the top bar on desktop and «بیشتر» on the phone.
6. **Right-click and long-press stay** (the map in §2), but every action they offer is also reachable from a
   visible ⋯ button, so nothing depends on knowing about the long-press.

**How (in order, each step shippable to the beta):** tokens + breakpoints → layer manager (move the existing
layers onto it) → phone pages and bottom bar → note page top bar → desktop panel → settings page → remove the
old chrome (edge tab, rail, `#nbMini2`, duplicated CSS blocks in `nb.css` §«بازبینی موبایل»).

**Accept:** at 360×740 every section is reachable in one tap from the bottom bar, Back always closes the top
layer and never leaves the app while something is open, no popover is clipped or hidden under another bar;
at 1440 the panel opens and closes from one button and never covers a menu or dialog; the full test suites
stay green and gain tests for the layer manager.

## Not in scope now

- A WYSIWYG/CodeMirror editor (the in-place editor in `inplace.js` is the chosen direction for now).
- Server-side features (server PDF, bots). Sharing goes through GitHub Gist (§9), no server of our own.
