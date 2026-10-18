#!/bin/sh
# Startet den Worker lokal (frische D1) und führt die Community-Abläufe im Browser aus.
set -e
cd "$(dirname "$0")/../../worker"
rm -rf .wrangler/state
npx wrangler d1 migrations apply smokr-community --local >/dev/null
npx wrangler dev --local --ip 127.0.0.1 --port 8787 >/tmp/smokr-worker.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8787/health >/dev/null && break; sleep 0.5; done
cd ..
SMOKR_API=http://127.0.0.1:8787 npx playwright test tests/e2e/community.spec.js --workers=1 "$@"
