#!/usr/bin/env python3
"""One-shot helper: pull vendor + app.js out of a monolithic beta2/index.html.

Only needed if someone pastes a single-file build back. Day-to-day edits go in src/app.js.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'beta2' / 'index.html'

def main() -> int:
    html = HTML.read_text(encoding='utf-8')
    if 'src="app.js"' in html and (ROOT / 'beta2' / 'app.js').exists():
        print('already split')
        return 0
    print('This tree is already split, or the monolith layout changed. Abort.')
    return 1

if __name__ == '__main__':
    raise SystemExit(main())
