#!/usr/bin/env python3
"""Build the served app from split sources.

Editable sources:
  src/app.js              — application
  src/index.shell.html    — page shell (copy to index.html when the shell changes)
  vendor/*                — mermaid + katex

Usage:
  python3 tools/build.py          # copy src/app.js → app.js
  python3 tools/build.py --check  # verify app.js matches src/app.js
  python3 tools/build.py --shell  # also copy src/index.shell.html → index.html
"""
from __future__ import annotations
import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src' / 'app.js'
DST = ROOT / 'app.js'
SHELL_SRC = ROOT / 'src' / 'index.shell.html'
SHELL_DST = ROOT / 'index.html'

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--shell', action='store_true', help='also copy index shell')
    args = ap.parse_args()
    if not SRC.exists():
        print('missing', SRC, file=sys.stderr)
        return 1
    if args.check:
        if not DST.exists() or SRC.read_bytes() != DST.read_bytes():
            print('OUT OF SYNC: src/app.js != app.js')
            return 2
        print('ok: src/app.js matches app.js')
        return 0
    shutil.copy2(SRC, DST)
    print('copied src/app.js → app.js (%d KB)' % (DST.stat().st_size // 1024))
    if args.shell:
        if not SHELL_SRC.exists():
            print('missing', SHELL_SRC, file=sys.stderr)
            return 1
        shutil.copy2(SHELL_SRC, SHELL_DST)
        print('copied src/index.shell.html → index.html')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
