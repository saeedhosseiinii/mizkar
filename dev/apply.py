#!/usr/bin/env python3
"""
Build index.html (repository root) from the pristine app plus the notebook module.

The repository keeps one built file (index.html); this script is how it is assembled, so the
notebook sources (nb.js / nb.css / nb.markup.html) stay readable and the app code stays untouched
except for the few marked patches below. Re-running it is idempotent: the base always comes from
git HEAD (or --base FILE), never from the previously built index.html.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

DEV = Path(__file__).resolve().parent           # dev/ inside the repository
REPO = DEV.parent
OUT = REPO / 'index.html'
MARK = '/* === NOTEBOOK (Git) — Mizkar === */'

# ---------------------------------------------------------------- the patches to the app itself
VERSION = '2026-10-22T23:28Z'      # bumped with every phase; version.json carries the change log
PRISTINE = '5740cb72b996348edb2e293732870d495eb4744d'   # the upstream commit without the notebook

# a regex patch, for things whose old value changes every build (the version string)
REGEX_PATCHES = [
    (r'<meta name="app-version" content="[^"]*">',
     '<meta name="app-version" content="' + VERSION + '">',
     'app version meta'),
]

PATCHES = [
    # IndexedDB: one database, several stores (the notebook needs notes/meta/queue/search)
    (
        "      var rq = indexedDB.open('mizkar', 1);\n      rq.onupgradeneeded = function(){ rq.result.createObjectStore('kv'); };\n",
        "      var rq = indexedDB.open('mizkar', 2);\n"
        "      rq.onupgradeneeded = function(){\n"
        "        var db = rq.result;\n"
        "        ['kv', 'notes', 'queue', 'search', 'meta'].forEach(function(n){ if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); });\n"
        "      };\n",
        "IndexedDB stores",
    ),
    (
        "  function idbGet(key){\n    return idb().then(function(db){ return new Promise(function(resolve, reject){\n      var rq = db.transaction('kv').objectStore('kv').get(key);\n",
        "  function idbGet(key, store){\n    return idb().then(function(db){ return new Promise(function(resolve, reject){\n      var rq = db.transaction(store || 'kv').objectStore(store || 'kv').get(key);\n",
        "idbGet store",
    ),
    (
        "  function idbSet(key, value){\n    return idb().then(function(db){ return new Promise(function(resolve, reject){\n      var tx = db.transaction('kv', 'readwrite');\n      tx.objectStore('kv').put(value, key);\n",
        "  function idbSet(key, value, store){\n    return idb().then(function(db){ return new Promise(function(resolve, reject){\n      var tx = db.transaction(store || 'kv', 'readwrite');\n      tx.objectStore(store || 'kv').put(value, key);\n",
        "idbSet store",
    ),
    # front matter at the top of a note renders as a properties strip (see renderFrontMatter)
    (
        "function renderMarkdown(text, o){\n  o = Object.assign({}, o || {});\n  var ctx = { slugs: {}, headings: [] };\n  var lines = String(text).replace(/[\\u0000-\\u0003]/g, '').split(/\\r?\\n/);",
        "function renderMarkdown(text, o){\n  o = Object.assign({}, o || {});\n  var ctx = { slugs: {}, headings: [] };\n  var fmHtml = '';\n  var fmMatch = String(text).match(/^\\uFEFF?---[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n---[ \\t]*(\\r?\\n|$)/);\n  if (fmMatch){ fmHtml = renderFrontMatter(fmMatch[1]); text = String(text).slice(fmMatch[0].length); }\n  var lines = String(text).replace(/[\\u0000-\\u0003]/g, '').split(/\\r?\\n/);",
        "front matter strip (extract)",
    ),
    (
        "  var html = renderBlocks(lines, o, ctx);\n  if (html.indexOf('\\u0003TOC\\u0003') !== -1){",
        "  var html = fmHtml + renderBlocks(lines, o, ctx);\n  if (html.indexOf('\\u0003TOC\\u0003') !== -1){",
        "front matter strip (render)",
    ),
    (
        "function renderMarkdown(text, o){",
        "/** The `key: value` block at the top of a note: a properties strip, not body text. */\n"
        "function renderFrontMatter(raw){\n"
        "  var props = [], tags = [];\n"
        "  String(raw).split(/\\r?\\n/).forEach(function(line){\n"
        "    var m = line.match(/^\\s*([A-Za-z_\\u0600-\\u06FF][\\w\\u0600-\\u06FF .-]*)\\s*:\\s*(.*)$/);\n"
        "    if (!m) return;\n"
        "    var k = m[1].trim(), v = m[2].trim();\n"
        "    if (!v) return;\n"
        "    if (/^\\[.*\\]$/.test(v)) v = v.slice(1, -1).split(',').map(function(s){ return s.trim().replace(/^[\"']|[\"']$/g, ''); }).filter(Boolean).join('، ');\n"
        "    if (/^(tags?|tag)$/i.test(k)) tags.push(v);\n"
        "    else props.push([k, v]);\n"
        "  });\n"
        "  if (!props.length && !tags.length) return '';\n"
        "  return '<div class=\"fmprops\" data-ui>'\n"
        "    + props.map(function(p){ return '<span class=\"fmrow\"><b>' + escapeHtml(p[0]) + '</b><i dir=\"auto\">' + escapeHtml(p[1]) + '</i></span>'; }).join('')\n"
        "    + tags.map(function(t){ return '<span class=\"fmtag\">' + escapeHtml('#' + t.replace(/\\s*،\\s*/g, ' #')) + '</span>'; }).join('')\n"
        "    + '</div>';\n"
        "}\n"
        "function renderMarkdown(text, o){",
        "renderFrontMatter helper",
    ),
    # [[wikilinks]] in the preview open the note they point at (the notebook module handles the click)
    (
        "  s = s.replace(/\\\\([\\\\`*_{}\\[\\]()#+\\-.!|~])/g, function(m, c){ return hold(c); });\n",
        "  s = s.replace(/\\\\([\\\\`*_{}\\[\\]()#+\\-.!|~])/g, function(m, c){ return hold(c); });\n"
        "  s = s.replace(/\\[\\[([^\\[\\]|]{1,140})(?:\\|([^\\[\\]]{1,140}))?\\]\\]/g, function(m, target, label){\n"
        "    return hold('<a class=\"nb-wlink\" href=\"#\" data-nb-link=\"' + encodeURIComponent(target) + '\">' + (label || target) + '</a>');\n"
        "  });\n",
        "wikilinks in the preview",
    ),
    # a secret note never reaches browser storage or recent texts in plaintext
    (
        "      localStorage.setItem('fs2-state', JSON.stringify({\n        text: ta.value,",
        "      localStorage.setItem('fs2-state', JSON.stringify({\n        text: currentTab() && currentTab().secret ? '' : ta.value,",
        "saveState: no secret text",
    ),
    (
        "localStorage.setItem('fs2-state', JSON.stringify({ text: ta.value, fmt: state.fmt,",
        "localStorage.setItem('fs2-state', JSON.stringify({ text: currentTab() && currentTab().secret ? '' : ta.value, fmt: state.fmt,",
        "saveState fallback: no secret text",
    ),
    (
        "  function remember(text, fmt, kind, tab){\n    if (!text || !text.trim() || text.length > HISTORY_ITEM_MAX) return;",
        "  function remember(text, fmt, kind, tab){\n    if (!text || !text.trim() || text.length > HISTORY_ITEM_MAX) return;\n"
        "    var curTab = currentTab();\n"
        "    if ((tab && tab.secret) || (curTab && curTab.secret && text === ta.value) || tabs.some(function(x){ return x.secret && x.text === text; })) return;",
        "recent texts: no secret text",
    ),
    # «امروز» in place of the empty page once the notebook is in use (dev/home.js)
    (
        "    zoomWrap.innerHTML = html || EMPTY_HTML;\n",
        "    zoomWrap.innerHTML = html || (typeof nbHomeHtml === 'function' && nbHomeHtml()) || EMPTY_HTML;\n",
        "home page",
    ),
    # notes in the command palette: the quick way to jump to any of them
    (
        "      list.push({ label: 'تب: ' + tabLabel(t), icon: 'file', kw: 'tab switch', run: function(){ switchTab(t.id); } });\n    });\n",
        "      list.push({ label: 'تب: ' + tabLabel(t), icon: 'file', kw: 'tab switch', run: function(){ switchTab(t.id); } });\n    });\n"
        "    if (typeof nbPaletteItems === 'function') list.push.apply(list, nbPaletteItems());\n",
        "palette notes",
    ),
    # every tab switch has to fix up secret notes and read-only ones
    (
        "    body.classList.remove('drawer-open');\n    ta.scrollTop = 0;\n    out.scrollTop = 0;\n    setFormat(t.fmt || 'auto');\n    saveState();\n  }",
        "    body.classList.remove('drawer-open');\n    ta.scrollTop = 0;\n    out.scrollTop = 0;\n    setFormat(t.fmt || 'auto');\n    saveState();\n    if (typeof nbAfterSwitch === 'function') nbAfterSwitch();\n  }",
        "switchTab → nbAfterSwitch",
    ),
    # a notebook note is a tab that remembers its path, so tabs must survive a reload with it
    (
        "'<div class=\"tab' + (t.name ? ' named' : '') + (t.pinned ? ' pinned' : '') + '\"",
        "'<div class=\"tab' + (t.name ? ' named' : '') + (t.pinned ? ' pinned' : '') + (t.nb ? ' nb-tab' : '') + '\"",
        "tab class",
    ),
    (
        "+ (kind && kind !== 'markdown' ? '<span class=\"tab-f\">' + escapeHtml(FMT_LABELS[kind] || kind) + '</span>' : '')\n",
        "+ (t.nb ? '<span class=\"tab-f nb-f\" title=\"یادداشت دفترچه\">دفترچه</span>' : (kind && kind !== 'markdown' ? '<span class=\"tab-f\">' + escapeHtml(FMT_LABELS[kind] || kind) + '</span>' : ''))\n",
        "tab notebook chip",
    ),
    (
        "text: t.id === activeTab ? '' : t.text, fmt: t.id === activeTab ? state.fmt : t.fmt }; }),",
        "text: t.id === activeTab || t.secret ? '' : t.text, fmt: t.id === activeTab ? state.fmt : t.fmt, nb: t.nb || undefined, secret: t.secret || undefined }; }),",
        "saveState nb",
    ),
    (
        "var full = { activeTab: activeTab, at: Date.now(), tabs: tabs.map(function(t){ return { id: t.id, name: t.name || undefined, pinned: t.pinned || undefined, text: t.text, fmt: t.fmt }; }) };",
        "var full = { activeTab: activeTab, at: Date.now(), tabs: tabs.map(function(t){ return { id: t.id, name: t.name || undefined, pinned: t.pinned || undefined, text: t.secret ? '' : t.text, fmt: t.fmt, nb: t.nb || undefined, secret: t.secret || undefined }; }) };",
        "saveState nb (idb fallback)",
    ),
    (
        "return { id: t.id, name: typeof t.name === 'string' ? t.name.slice(0, TAB_NAME_MAX) : '', pinned: !!t.pinned, text: t.text, fmt: t.fmt || 'auto', undo: [], redo: [] };",
        "return { id: t.id, name: typeof t.name === 'string' ? t.name.slice(0, TAB_NAME_MAX) : '', pinned: !!t.pinned, text: t.text, fmt: t.fmt || 'auto', nb: typeof t.nb === 'string' ? t.nb : undefined, secret: !!t.secret, undo: [], redo: [] };",
        "restore nb (localStorage)",
    ),
    (
        "tabs = full.tabs.filter(function(t){ return t && t.id && typeof t.text === 'string'; }).map(function(t){ return { id: t.id, name: t.name || '', pinned: !!t.pinned, text: t.text, fmt: t.fmt || 'auto', undo: [], redo: [] }; });",
        "tabs = full.tabs.filter(function(t){ return t && t.id && typeof t.text === 'string'; }).map(function(t){ return { id: t.id, name: t.name || '', pinned: !!t.pinned, text: t.text, fmt: t.fmt || 'auto', nb: t.nb || undefined, secret: !!t.secret, undo: [], redo: [] }; });",
        "restore nb (IndexedDB)",
    ),
    # the app's tab menu gains the notebook's own entries (dev/nb.js publishes nbTabMenuItems)
    (
        """if (closedTabs.length) items.push(null, ['undo', 'بازگرداندن آخرین تب بسته‌شده', '', reopenTab]);
""",
        """if (closedTabs.length) items.push(null, ['undo', 'بازگرداندن آخرین تب بسته‌شده', '', reopenTab]);
    if (typeof nbTabMenuItems === 'function') items = items.concat(nbTabMenuItems(t));\n""",
        "tab menu items",
    ),
]


def js_string_array(lines):
    body = []
    for ln in lines:
        body.append("  '" + ln.replace('\\', '\\\\').replace("'", "\\'") + "',")
    return 'var NB_CSS = [\n' + '\n'.join(body) + '\n].join(\'\\n\');\n'


def markup_sections():
    raw = (DEV / 'nb.markup.html').read_text(encoding='utf-8')
    parts = {}
    for chunk in re.split(r'^<!--@([a-z]+)-->\n', raw, flags=re.M)[1:]:
        pass
    toks = re.split(r'<!--@([a-z]+)-->\n', raw)
    for i in range(1, len(toks), 2):
        parts[toks[i]] = toks[i + 1]
    return parts


def replace_once(text, old, new, what):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'anchor «{what}» matched {n} times, expected exactly 1')
    return text.replace(old, new)


def main():
    base_from = None
    for i, a in enumerate(sys.argv):
        if a == '--base' and i + 1 < len(sys.argv):
            base_from = Path(sys.argv[i + 1])
    pristine = DEV / 'base.html'
    if base_from:
        html = base_from.read_text(encoding='utf-8')
    elif pristine.exists():
        html = pristine.read_text(encoding='utf-8')
    else:
        html = subprocess.run(['git', '-C', str(REPO), 'show', PRISTINE + ':index.html'], check=True,
                              capture_output=True).stdout.decode('utf-8')
    if MARK in html:
        raise SystemExit('the base already contains the notebook module — build from git HEAD instead')

    for pattern, new, what in REGEX_PATCHES:
        html, n = re.subn(pattern, lambda m: new, html, count=1)
        if n != 1:
            raise SystemExit(f'regex anchor «{what}» matched {n} times, expected exactly 1')
    for old, new, what in PATCHES:
        html = replace_once(html, old, new, what)
    print(f'patched the app: {len(PATCHES) + len(REGEX_PATCHES)} places')

    m = markup_sections()
    html = replace_once(html, '\n</svg>\n\n<header class="bar">', '\n' + m['icon'] + '</svg>\n\n<header class="bar">', 'svg sprite')
    html = replace_once(html, '    <button class="ib" type="button" data-action="open"',
                        m['btn'] + '    <button class="ib" type="button" data-action="open"', 'toolbar button')
    html = replace_once(html, '  <div class="pop-wrap st-upd-wrap">',
                        m['status'] + '  <div class="pop-wrap st-upd-wrap">', 'status bar')
    html = replace_once(html, '<button id="btnExitRead"', m['sidebar'] + '<button id="btnExitRead"', 'sidebar + dialogs')
    print('inserted markup: icon, toolbar, status, sidebar')

    css = (DEV / 'nb.css').read_text(encoding='utf-8') + '\n' + (DEV / 'ui.css').read_text(encoding='utf-8')
    module = js_string_array(css.split('\n')) + '\n' + (DEV / 'nb.js').read_text(encoding='utf-8')
    # the home page and the calmer layout share the notebook's scope (dev/home.js, dev/ui.js)
    module = module.replace('  /* --- init --- */', (DEV / 'home.js').read_text(encoding='utf-8') + '\n' + (DEV / 'ui.js').read_text(encoding='utf-8') + '\n' + (DEV / 'inplace.js').read_text(encoding='utf-8') + '\n  /* --- init --- */', 1)
    html = replace_once(html, '  /* --- init --- */', module + '\n  /* --- init --- */', 'init marker')
    print(f'inserted the notebook module: {len(module)} chars')

    OUT.write_text(html, encoding='utf-8')
    print(f'wrote {OUT} ({OUT.stat().st_size} bytes)')

    # the two files the phone needs for offline use and for «share»
    for name in ('sw.js', 'manifest.webmanifest'):
        src = DEV / name
        if src.exists():
            target = REPO / name
            if not target.exists() or target.read_text(encoding='utf-8') != src.read_text(encoding='utf-8'):
                target.write_text(src.read_text(encoding='utf-8'), encoding='utf-8')
                print(f'wrote {target}')


if __name__ == '__main__':
    main()
