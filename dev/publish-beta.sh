#!/bin/bash
# Build the beta into the main branch's beta/ folder (a worktree of `main`), ready to commit there.
# Usage: dev/publish-beta.sh ../mizkar-main "what changed" ["…"]
set -e
cd "$(dirname "$0")/.."
MAIN="${1:?path to a worktree of the main branch}"; shift
python3 dev/apply.py >/dev/null
python3 dev/beta.py "$MAIN/beta" "$@"
echo "now commit $MAIN/beta on main (only that folder)"
