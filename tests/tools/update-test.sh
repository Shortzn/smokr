#!/bin/sh
# Prüft das Update von einer älteren Version (Standard: main) auf den Arbeitsstand.
# Die alte Version registriert ihren Service Worker nur unter HTTPS; die Testkopie auch lokal.
set -e
REF="${1:-alpha-final}"
DIR="$(mktemp -d)"
git worktree add -f "$DIR/src" "$REF" >/dev/null 2>&1
cp -R "$DIR/src/app" "$DIR/old-app"
git worktree remove --force "$DIR/src"
sed -i.bak 's/location.protocol === "https:"/window.isSecureContext/' "$DIR/old-app/app.js"
OLD_APP="$DIR/old-app" npx playwright test tests/e2e/update.spec.js --project=desktop-chromium
rm -rf "$DIR"
