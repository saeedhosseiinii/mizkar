#!/bin/bash
# Build the beta next to the served app, so the phone can test it at /beta/ with no delay.
set -e
cd /root/workspace/mizkar
python3 dev/apply.py >/dev/null
rm -rf /root/workspace/mizkar/beta
python3 dev/beta.py /root/workspace/mizkar/beta "$@"
grep -o "mzbeta-[0-9TZ]*" beta/sw.js | head -1
curl -sk -o /dev/null -w "served beta: %{http_code}\n" https://45.39.60.14:8901/beta/
