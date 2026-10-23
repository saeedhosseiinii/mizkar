#!/usr/bin/env python3
"""Build beta2/ from split sources.

Editable sources:
  src/app.js              — application (also copied to beta2/app.js)
  beta2/vendor/*          — mermaid + katex (large, rarely touched)
  beta2/index.html        — shell (links to app.js + vendor)

Usage:
  python3 tools/build.py          # copy src/app.js → beta2/app.js, bump nothing
  python3 tools/build.py --check  # verify beta2/app.js matches src/app.js
"""
from __future__ import annotations
import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src' / 'app.js'
DST = ROOT / 'beta2' / 'app.js'

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    if not SRC.exists():
        print('missing', SRC, file=sys.stderr)
        return 1
    if args.check:
        if not DST.exists() or SRC.read_bytes() != DST.read_bytes():
            print('OUT OF SYNC: src/app.js != beta2/app.js')
            return 2
        print('ok: src/app.js matches beta2/app.js')
        return 0
    shutil.copy2(SRC, DST)
    print('copied src/app.js → beta2/app.js (%d KB)' % (DST.stat().st_size // 1024))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
