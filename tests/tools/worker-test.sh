#!/bin/sh
# Startet den Worker lokal mit frischer D1 und führt die API-Tests aus.
# Braucht worker/.dev.vars mit Testwerten (siehe docs/COMMUNITY.md).
set -e
cd "$(dirname "$0")/../../worker"
rm -rf .wrangler/state
npx wrangler d1 migrations apply smokr-community --local >/dev/null
# Kleines Fotobudget, damit der Test die Speichergrenze erreicht; Modus wie in Produktion
npx wrangler dev --local --ip 127.0.0.1 --port 8787 \
  --var COMMUNITY_MODE:private --var PHOTO_BUDGET_BYTES:20000 >/tmp/smokr-worker.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8787/health >/dev/null && break; sleep 0.5; done
cd ..
node --test --test-concurrency=1 tests/worker/api.test.js
