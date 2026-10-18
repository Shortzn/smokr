#!/bin/sh
# Sicherung und Wiederherstellung auf echtem Cloudflare prüfen. NUR gegen eine Staging-Datenbank.
# Aufruf (im Workflow "Worker", staging): sh tests/tools/backup-restore-test.sh smokr-community-staging
#
# 1. Ein großes Foto (600 KB) in die Staging-Datenbank schreiben, in Stücken wie bei der Wiederherstellung.
# 2. Export mit `wrangler d1 export`, vorbereiten mit d1-restore-prepare.mjs, in eine frische Datenbank einspielen.
# 3. Vergleichen: Zeilen pro Tabelle, Bildgrößen, Anfang und Ende jedes Bildes.
# 4. Time Travel: Lesezeichen merken, Markierung schreiben, zurücksetzen, Markierung muss weg sein.
set -eu
SRC="$1"
case "$SRC" in *staging*) ;; *) echo "Nur gegen Staging-Datenbanken"; exit 2 ;; esac
DST="$SRC-restore"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$ROOT/node_modules/.bin/wrangler"
T=$(mktemp -d)
trap 'rm -rf "$T"; (cd "$T" 2>/dev/null || cd /; "$W" d1 delete "$DST" -y >/dev/null 2>&1) || true' EXIT
cd "$T"
q() { "$W" d1 execute "$1" --remote -y --json --command "$2" 2>/dev/null; }

echo "== 1. Großes Foto schreiben"
node -e "
const c=require('crypto'); const hex=c.randomBytes(600*1024).toString('hex');
const id=c.randomBytes(16).toString('hex'); const out=[];
out.push(\"CREATE TABLE IF NOT EXISTS _restore_hex (k INTEGER PRIMARY KEY, x TEXT NOT NULL);\");
out.push(\"INSERT INTO _restore_hex (k, x) VALUES (999, '');\");
for (let i=0;i<hex.length;i+=80000) out.push(\"UPDATE _restore_hex SET x = x || '\"+hex.slice(i,i+80000)+\"' WHERE k = 999;\");
out.push(\"INSERT INTO photos (id, owner_type, bytes, size, width, height, sha256, consent, status) VALUES ('\"+id+\"', 'submission', unhex((SELECT x FROM _restore_hex WHERE k = 999)), 614400, 1600, 1200, '\"+id+id+\"', 1, 'rejected');\");
out.push('DROP TABLE _restore_hex;');
require('fs').writeFileSync('big.sql', out.join('\n')+'\n');"
"$W" d1 execute "$SRC" --remote -y --file big.sql >/dev/null

echo "== 2. Export, vorbereiten, einspielen"
"$W" d1 export "$SRC" --remote --output backup.sql >/dev/null
node "$ROOT/worker/tools/d1-restore-prepare.mjs" backup.sql restore.sql
"$W" d1 create "$DST" >/dev/null
"$W" d1 execute "$DST" --remote -y --file restore.sql >/dev/null

echo "== 3. Vergleichen"
SQL="SELECT 'submissions' AS t, COUNT(*) AS n, 0 AS b FROM submissions UNION ALL SELECT 'reports', COUNT(*), 0 FROM reports UNION ALL SELECT 'testers', COUNT(*), 0 FROM testers UNION ALL SELECT 'audit', COUNT(*), 0 FROM audit UNION ALL SELECT 'photos', COUNT(*), COALESCE(SUM(length(bytes)),0) FROM photos"
PH="SELECT id, length(bytes) AS n, substr(hex(bytes),1,40) AS a, substr(hex(bytes),-40) AS z FROM photos ORDER BY id"
q "$SRC" "$SQL" > a1.json; q "$DST" "$SQL" > b1.json
q "$SRC" "$PH" > a2.json; q "$DST" "$PH" > b2.json
node -e "
const fs=require('fs'); const r=(f)=>JSON.parse(fs.readFileSync(f,'utf8'))[0].results;
const [a1,b1,a2,b2]=['a1.json','b1.json','a2.json','b2.json'].map(r);
console.log('Quelle:', JSON.stringify(a1)); console.log('Kopie: ', JSON.stringify(b1));
if (JSON.stringify(a1)!==JSON.stringify(b1)) { console.error('Zeilen oder Bildgrößen weichen ab'); process.exit(1); }
if (JSON.stringify(a2)!==JSON.stringify(b2)) { console.error('Bildinhalte weichen ab'); process.exit(1); }
if (!a2.some((p)=>p.n===614400)) { console.error('großes Foto fehlt'); process.exit(1); }
console.log('Wiederherstellung vollständig:', a2.length, 'Fotos identisch');"

echo "== 4. Time Travel"
BM=$("$W" d1 time-travel info "$SRC" --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);process.stdout.write(j.bookmark||'')})")
[ -n "$BM" ] || { echo "Kein Lesezeichen"; exit 1; }
q "$SRC" "INSERT INTO audit (action, target, note) VALUES ('tt_marker', 'restore-test', NULL)" >/dev/null
N1=$(q "$SRC" "SELECT COUNT(*) AS n FROM audit WHERE action = 'tt_marker'" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(String(JSON.parse(d)[0].results[0].n)))")
# Ohne Terminal bestätigt wrangler die Rückfrage selbst; die Namensprüfung oben schützt die Produktion
"$W" d1 time-travel restore "$SRC" --bookmark "$BM" >/dev/null
N2=$(q "$SRC" "SELECT COUNT(*) AS n FROM audit WHERE action = 'tt_marker'" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(String(JSON.parse(d)[0].results[0].n)))")
echo "Markierung vor dem Zurücksetzen: $N1, danach: $N2"
[ "$N1" = "1" ] && [ "$N2" = "0" ] || { echo "Time Travel hat nicht zurückgesetzt"; exit 1; }
echo "Sicherung und Wiederherstellung: bestanden"
