#!/bin/sh
# Einrichtung der Smokr Community API auf deinem Cloudflare-Konto. Kostenlos (Workers Free, D1, Turnstile).
#
# Du gibst nur zwei Dinge ein, beide verdeckt:
#   1. ein Cloudflare-API-Token (Rechte siehe docs/COMMUNITY.md)
#   2. ein Admin-Passwort für die Moderation (mindestens 16 Zeichen)
# Alles andere legt das Skript selbst an: workers.dev-Adresse, D1-Datenbank, Turnstile-Widget,
# zufällige Schlüssel. Geheimnisse liegen nur kurz in einer privaten Temp-Datei und werden danach gelöscht.
# Das Skript schaltet die Community in der App NICHT ein; das passiert erst nach Freigabe in app/config.js.
set -eu
# Smokr ist seit 18.10.2026 eingerichtet. Ein zweiter Lauf würde das Turnstile-Secret neu erzeugen und die
# laufende API stören. Neue Versionen gehen über den GitHub-Workflow "Worker" (docs/COMMUNITY.md).
if [ "${SMOKR_ALLOW_SETUP:-}" != "ja-neu-einrichten" ]; then
  echo "Smokr ist bereits eingerichtet. Bitte den GitHub-Workflow \"Worker\" verwenden (docs/COMMUNITY.md)."
  echo "Nur für eine komplette Neueinrichtung: SMOKR_ALLOW_SETUP=ja-neu-einrichten sh worker/tools/setup.sh"
  exit 1
fi
cd "$(dirname "$0")/.."
umask 077
export WRANGLER_SEND_METRICS=false
TMP=$(mktemp -d)
cleanup() { stty echo 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT INT TERM
API=https://api.cloudflare.com/client/v4

# Übergabe-Ordner im iCloud Drive: Token als Datei hinein, Admin-Passwort kommt als Datei heraus.
HANDOFF="${SMOKR_HANDOFF:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Smokr}"
INTERACTIVE=0
[ -t 0 ] && INTERACTIVE=1

ask_secret() {
  # $1 = Frage; Antwort steht danach in $REPLY_SECRET
  printf "%s" "$1" >&2
  stty -echo
  IFS= read -r REPLY_SECRET
  stty echo
  printf "\n" >&2
}
# API-Aufruf; das Token geht über stdin an curl und erscheint nie in der Prozessliste
cf() {
  method="$1"; path="$2"; body="${3:-}"
  if [ -n "$body" ]; then
    printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
      curl -sS -K - -X "$method" -H "content-type: application/json" --data "$body" "$API$path"
  else
    printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
      curl -sS -K - -X "$method" "$API$path"
  fi
}
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const v=($1);if(v===undefined||v===null){process.exit(3)}process.stdout.write(String(v))})"; }

echo "== Smokr Community: Einrichtung =="

# ---------- 1. Zugang ----------
# Token-Datei: cloudflare-token.txt oder eine andere .txt im Übergabeordner (Kurzbefehle nennen sie oft "Text.txt")
TOKEN_FILE="$HANDOFF/cloudflare-token.txt"
if [ ! -f "$TOKEN_FILE" ] && [ -d "$HANDOFF" ]; then
  for f in "$HANDOFF"/*.txt; do
    case "$(basename "$f")" in LIESMICH.txt|smokr-admin-passwort.txt) continue ;; esac
    [ -f "$f" ] && TOKEN_FILE="$f" && break
  done
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$TOKEN_FILE" ]; then
  CLOUDFLARE_API_TOKEN=$(tr -d ' \r\n\t' < "$TOKEN_FILE")
  echo "Token aus dem iCloud-Übergabeordner gelesen."
fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  [ "$INTERACTIVE" = 1 ] || { echo "Kein Token: $TOKEN_FILE fehlt."; exit 1; }
  ask_secret "Cloudflare-API-Token (wird nicht angezeigt): "
  CLOUDFLARE_API_TOKEN="$REPLY_SECRET"
fi
export CLOUDFLARE_API_TOKEN
cf GET "/user/tokens/verify" > "$TMP/verify.json"
if ! json 'j.success && j.result.status==="active" ? 1 : null' < "$TMP/verify.json" >/dev/null; then
  echo "Das Token ist ungültig oder abgelaufen."; exit 1
fi
cf GET "/accounts?per_page=20" > "$TMP/accounts.json"
COUNT=$(json 'j.result.length' < "$TMP/accounts.json")
if [ "$COUNT" -lt 1 ]; then echo "Das Token sieht kein Konto. Bitte Kontoberechtigungen prüfen."; exit 1; fi
CLOUDFLARE_ACCOUNT_ID=$(json 'j.result[0].id' < "$TMP/accounts.json")
NAME=$(json 'j.result[0].name' < "$TMP/accounts.json")
if [ "$COUNT" -gt 1 ]; then echo "Mehrere Konten sichtbar, verwende: $NAME"; else echo "Konto: $NAME"; fi
export CLOUDFLARE_ACCOUNT_ID

# ---------- 2. workers.dev-Adresse ----------
cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" > "$TMP/sub.json"
SUB=$(json 'j.result && j.result.subdomain' < "$TMP/sub.json" || true)
if [ -z "$SUB" ]; then
  if [ -n "${SMOKR_SUBDOMAIN:-}" ]; then SUB="$SMOKR_SUBDOMAIN"
  elif [ "$INTERACTIVE" = 1 ]; then
    printf "Noch keine workers.dev-Adresse. Wunschname (Kleinbuchstaben, z. B. smokr-stefan): "
    read -r SUB
  else echo "Keine workers.dev-Adresse und kein SMOKR_SUBDOMAIN gesetzt."; exit 1; fi
  cf PUT "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" "{\"subdomain\":\"$SUB\"}" > "$TMP/subput.json"
  json 'j.success ? 1 : null' < "$TMP/subput.json" >/dev/null || { echo "Adresse nicht verfügbar:"; cat "$TMP/subput.json"; exit 1; }
fi
WORKER_URL="https://smokr-api.$SUB.workers.dev"
echo "API-Adresse: $WORKER_URL"

# ---------- 3. Datenbank ----------
if grep -q '00000000-0000-0000-0000-000000000000' wrangler.toml; then
  echo "Lege D1-Datenbank smokr-community an ..."
  npx wrangler d1 create smokr-community > "$TMP/d1.txt" 2>&1 || { cat "$TMP/d1.txt"; exit 1; }
  ID=$(grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$TMP/d1.txt" | head -1)
  [ -n "$ID" ] || { cat "$TMP/d1.txt"; echo "Datenbank-ID nicht gefunden."; exit 1; }
  sed -i.bak "s/00000000-0000-0000-0000-000000000000/$ID/" wrangler.toml && rm -f wrangler.toml.bak
fi
echo "Schema einspielen ..."
npx wrangler d1 migrations apply smokr-community --remote

# ---------- 4. Turnstile ----------
cf GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/challenges/widgets?per_page=50" > "$TMP/widgets.json"
SITEKEY=$(json '(j.result||[]).filter(w=>w.name==="Smokr").map(w=>w.sitekey)[0]' < "$TMP/widgets.json" || true)
if [ -n "$SITEKEY" ]; then
  echo "Turnstile-Widget vorhanden, erzeuge neues Secret ..."
  cf POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/challenges/widgets/$SITEKEY/rotate_secret" '{"invalidate_immediately":true}' > "$TMP/widget.json"
else
  echo "Lege Turnstile-Widget an ..."
  cf POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/challenges/widgets" '{"name":"Smokr","domains":["shortzn.github.io"],"mode":"managed"}' > "$TMP/widget.json"
fi
json 'j.success ? 1 : null' < "$TMP/widget.json" >/dev/null || { echo "Turnstile fehlgeschlagen (Token-Recht Turnstile: Edit?)"; exit 1; }
SITEKEY=$(json 'j.result.sitekey' < "$TMP/widget.json")

# ---------- 5. Admin-Passwort ----------
if [ "$INTERACTIVE" = 1 ]; then
  while :; do
    ask_secret "Admin-Passwort für die Moderation (mindestens 16 Zeichen): "
    P1="$REPLY_SECRET"
    ask_secret "Noch einmal: "
    if [ "$P1" != "$REPLY_SECRET" ]; then echo "Stimmt nicht überein."; continue; fi
    if [ "${#P1}" -lt 16 ]; then echo "Zu kurz."; continue; fi
    break
  done
else
  # Ohne Terminal: starkes Zufallspasswort, nur als Datei im privaten iCloud-Übergabeordner
  P1=$(node -e "const c=require('crypto');const a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let s='';for(const b of c.randomBytes(24))s+=a[b%a.length];process.stdout.write(s.match(/.{1,4}/g).join('-'))")
  printf 'Smokr Admin-Passwort (Moderation unter %s/admin):\n%s\n\nBitte in die Passwörter-App übernehmen und diese Datei danach löschen.\n' "$WORKER_URL" "$P1" > "$HANDOFF/smokr-admin-passwort.txt"
  echo "Admin-Passwort erzeugt und im iCloud-Übergabeordner abgelegt."
fi
HASH=$(printf '%s' "$P1" | node tools/hash-password.mjs --stdin)
P1=""; REPLY_SECRET=""

# ---------- 6. Secrets-Datei (nur im Temp-Ordner, 0600) und Veröffentlichung ----------
node -e "
const fs=require('fs'),c=require('crypto');
const w=JSON.parse(fs.readFileSync(process.argv[1]+'/widget.json','utf8'));
fs.writeFileSync(process.argv[1]+'/secrets.json', JSON.stringify({
  TURNSTILE_SECRET: w.result.secret,
  IP_SALT: c.randomBytes(24).toString('hex'),
  SESSION_KEY: c.randomBytes(32).toString('hex'),
  ADMIN_PASSWORD_HASH: fs.readFileSync(0,'utf8').trim(),
}), { mode: 0o600 });
" "$TMP" <<EOF
$HASH
EOF
HASH=""
rm -f "$TMP/widget.json"
echo "Veröffentliche den Worker ..."
npx wrangler deploy --secrets-file "$TMP/secrets.json"
rm -f "$TMP/secrets.json"
# Das Token wird nach der Einrichtung nicht mehr gebraucht
[ -f "$TOKEN_FILE" ] && rm -f "$TOKEN_FILE" && echo "Token-Datei aus dem iCloud-Übergabeordner gelöscht."

# ---------- 7. Prüfen und öffentliche Werte notieren ----------
sleep 3
HEALTH=$(curl -sS "$WORKER_URL/health" || true)
printf '{\n  "api": "%s",\n  "turnstileSiteKey": "%s"\n}\n' "$WORKER_URL" "$SITEKEY" > deployed.json
echo
echo "Fertig."
echo "  API:         $WORKER_URL   ($HEALTH)"
echo "  Moderation:  $WORKER_URL/admin"
echo "  Site Key:    $SITEKEY   (öffentlich)"
echo "Die öffentlichen Werte stehen in worker/deployed.json. Die App bleibt ohne Community, bis du sie freigibst."
