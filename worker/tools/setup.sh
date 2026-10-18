#!/bin/sh
# Erstes Einrichten der Smokr Community API auf deinem Cloudflare-Konto (kostenlos).
# Voraussetzung: npx wrangler login, Turnstile-Widget angelegt (siehe docs/COMMUNITY.md).
set -e
cd "$(dirname "$0")/.."

echo "Konto:"
npx wrangler whoami

if grep -q '00000000-0000-0000-0000-000000000000' wrangler.toml; then
  echo "Lege D1-Datenbank smokr-community an ..."
  OUT=$(npx wrangler d1 create smokr-community)
  echo "$OUT"
  ID=$(echo "$OUT" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  [ -n "$ID" ] || { echo "Datenbank-ID nicht gefunden."; exit 1; }
  sed -i.bak "s/00000000-0000-0000-0000-000000000000/$ID/" wrangler.toml && rm wrangler.toml.bak
fi

echo "Schema einspielen ..."
npx wrangler d1 migrations apply smokr-community --remote

echo "Turnstile Secret Key einfügen und Enter drücken:"
npx wrangler secret put TURNSTILE_SECRET

node -e "console.log(require('crypto').randomBytes(24).toString('hex'))" | npx wrangler secret put IP_SALT
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_KEY

echo "Admin-Passwort festlegen:"
HASH=$(node tools/hash-password.mjs)
printf '%s' "$HASH" | npx wrangler secret put ADMIN_PASSWORD_HASH

echo "Veröffentlichen ..."
npx wrangler deploy
echo
echo "Fertig. Moderation: <Worker-Adresse>/admin"
