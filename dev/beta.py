#!/usr/bin/env python3
"""
Build the beta (served at /mizkar/beta/) from the freshly built index.html.

The beta lives next to the main site on the same origin, so it gets its own namespace for everything that
is per-origin: IndexedDB `mizkar-beta` (the main site keeps `mizkar` at version 1, which the notebook would
upgrade to 2 and lock the main site out of), browser storage keys `mzb-*` instead of `fs2-*`, and an offline
cache `mzbeta-*` that the main site's worker never deletes. On its first run the beta copies the main site's
tabs, settings and recent texts — reading only, never writing to the main site's storage.

Usage: python3 dev/apply.py && python3 dev/beta.py [OUT_DIR] "change note" ["change note" ...]
"""
import datetime
import json
import re
import shutil
import sys
from pathlib import Path

DEV = Path(__file__).resolve().parent
REPO = DEV.parent
args = sys.argv[1:]
OUT = Path(args.pop(0)) if args and not args[0].startswith('-') and ('/' in args[0] or args[0] == 'beta') else REPO / 'beta'
NOTES = args
VERSION = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')

IMPORT_FROM_MAIN = """  /* beta: its own storage; the first run copies the main site's tabs, settings and recent texts (read only) */
  (function(){
    try {
      if (!localStorage.getItem('mzb-state')) ['state', 'theme', 'zoom'].forEach(function(k){
        var v = localStorage.getItem('fs2-' + k);
        if (v != null) localStorage.setItem('mzb-' + k, v);
      });
    } catch(e){}
    window.__mzbHistory = (window.indexedDB && indexedDB.databases ? indexedDB.databases() : Promise.resolve([])).then(function(list){
      if (!list.some(function(d){ return d.name === 'mizkar'; })) return null;
      return new Promise(function(resolve){
        var rq = indexedDB.open('mizkar');          // no version: the main site's database is never upgraded
        rq.onupgradeneeded = function(){ rq.transaction.abort(); };
        rq.onerror = function(){ resolve(null); };
        rq.onsuccess = function(){
          var db = rq.result;
          if (!db.objectStoreNames.contains('kv')){ db.close(); return resolve(null); }
          var g = db.transaction('kv').objectStore('kv').get('history');
          g.onsuccess = function(){ db.close(); resolve(Array.isArray(g.result) ? g.result : null); };
          g.onerror = function(){ db.close(); resolve(null); };
        };
      });
    }).catch(function(){ return null; });
  })();
"""


def once(text, old, new, what, count=1):
    n = text.count(old)
    if n != count:
        raise SystemExit(f'beta: anchor «{what}» matched {n} times, expected {count}')
    return text.replace(old, new)


def main():
    html = (REPO / 'index.html').read_text(encoding='utf-8')
    html = once(html, "indexedDB.open('mizkar', 2)", "indexedDB.open('mizkar-beta', 2)", 'IndexedDB name')
    n = html.count("'fs2-")
    if n < 5:
        raise SystemExit(f'beta: expected the fs2- storage keys, found {n}')
    html = html.replace("'fs2-", "'mzb-")
    # the import reads the main keys by their real names
    html = once(html, '  var root = document.documentElement, body = document.body;\n',
                '  var root = document.documentElement, body = document.body;\n' + IMPORT_FROM_MAIN, 'DOM start')
    html = once(html, "  idbGet('history').then(function(saved){\n",
                "  Promise.all([idbGet('history'), window.__mzbHistory || null]).then(function(r){\n    var saved = r[0] || r[1];\n",
                'history loader')
    html = once(html, '<title>میزکار</title>', '<title>میزکار — آزمایشی</title>', 'title')
    html = once(html, '<span class="brand-name">میزکار</span>',
                '<span class="brand-name">میزکار <sup style="color:#f59e0b;font-size:.62em;font-weight:800">آزمایشی</sup></span>', 'brand')
    html, k = re.subn(r'<meta name="app-version" content="[^"]*">', '<meta name="app-version" content="' + VERSION + '">', html, count=1)
    if k != 1:
        raise SystemExit('beta: app-version meta not found')

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'index.html').write_text(html, encoding='utf-8')

    sw = (DEV / 'sw.js').read_text(encoding='utf-8')
    sw = once(sw, "var CACHE = 'mizkar-v3';", "var CACHE = 'mzbeta-" + VERSION.replace(':', '').replace('-', '') + "';", 'sw cache')
    sw = once(sw, "/^mizkar-/.test(k)", "/^mzbeta-/.test(k)", 'sw cleanup')
    sw = once(sw, "SHARE_DB = 'mizkar'", "SHARE_DB = 'mizkar-beta'", 'sw share db')
    (OUT / 'sw.js').write_text(sw, encoding='utf-8')

    man = json.loads((DEV / 'manifest.webmanifest').read_text(encoding='utf-8'))
    man['name'] = 'میزکار (آزمایشی)'
    man['short_name'] = 'میزکار β'
    (OUT / 'manifest.webmanifest').write_text(json.dumps(man, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    for icon in ('icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'):
        shutil.copyfile(REPO / icon, OUT / icon)

    vfile = OUT / 'version.json'
    data = json.loads(vfile.read_text(encoding='utf-8')) if vfile.exists() else {'changes': []}
    data['version'] = VERSION
    if NOTES:
        data['changes'] = [{'v': VERSION, 'items': NOTES}] + data.get('changes', [])[:29]
    vfile.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'beta {VERSION} → {OUT} ({(OUT / "index.html").stat().st_size} bytes)')


if __name__ == '__main__':
    main()
