#!/usr/bin/env node
// Bereitet eine Sicherung aus `wrangler d1 export` für die Wiederherstellung vor.
//
// Problem: D1 nimmt keine SQL-Anweisungen über 100 KB an (SQLITE_TOOBIG). Ein Export schreibt aber
// jedes Foto als eine einzige INSERT-Zeile mit X'…'-Literal, bei 1 MB Foto also über 2 MB.
// Lösung: Zu lange Zeilen werden umgeschrieben. Der Datensatz kommt zuerst ohne Bild in die Tabelle,
// das Bild wird in Hex-Stücken unter 100 KB in einer Hilfstabelle zusammengesetzt und mit unhex()
// übernommen. Danach wird die Hilfstabelle gelöscht.
//
// Aufruf: node worker/tools/d1-restore-prepare.mjs backup.sql restore.sql
// Danach: npx wrangler d1 execute <ZIEL-DATENBANK> --remote --file restore.sql
// Annahme: Die erste Spalte jeder Tabelle mit großen Bildern ist ihr Primärschlüssel (bei photos: id).
import fs from "node:fs";
import readline from "node:readline";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Aufruf: node d1-restore-prepare.mjs <export.sql> <restore.sql>");
  process.exit(2);
}
const LIMIT = 90_000; // sicher unter 100 KB pro Anweisung
const CHUNK = 80_000; // Hex-Zeichen pro Stück

const out = fs.createWriteStream(output);
const rl = readline.createInterface({ input: fs.createReadStream(input, "utf8"), crlfDelay: Infinity });
let rewritten = 0, helper = false;

for await (const line of rl) {
  if (line.length <= LIMIT) { out.write(line + "\n"); continue; }
  const m = line.match(/^INSERT INTO ("[^"]+") \(([^)]*)\) VALUES\(/);
  const blobs = [...line.matchAll(/X'([0-9A-Fa-f]*)'/g)].filter((b) => b[1].length > CHUNK);
  if (!m || !blobs.length) throw new Error(`Zeile zu lang und nicht umschreibbar: ${line.slice(0, 80)}…`);
  const table = m[1];
  const cols = m[2].split(",").map((c) => c.trim());
  const rest = line.slice(m[0].length);
  const first = rest.match(/^('(?:[^']|'')*'|-?[0-9.]+)/);
  if (!first) throw new Error(`Primärschlüssel nicht lesbar in ${table}`);
  // Spalte jedes großen Literals über seine Position in der VALUES-Liste bestimmen
  const values = splitValues(rest.replace(/\);\s*$/, ""));
  let short = line;
  const fills = [];
  for (const b of blobs) {
    const idx = values.findIndex((v) => v === b[0]);
    if (idx < 0) throw new Error(`Spalte für großes Bild in ${table} nicht gefunden`);
    short = short.replace(b[0], "NULL");
    fills.push([cols[idx], b[1]]);
  }
  if (short.length > LIMIT) throw new Error(`Zeile in ${table} bleibt zu lang`);
  if (!helper) { out.write('CREATE TABLE IF NOT EXISTS "_restore_hex" ("k" INTEGER PRIMARY KEY, "x" TEXT NOT NULL);\n'); helper = true; }
  out.write(short + "\n");
  for (const [col, hex] of fills) {
    rewritten++;
    out.write(`INSERT INTO "_restore_hex" ("k","x") VALUES(${rewritten},'');\n`);
    for (let i = 0; i < hex.length; i += CHUNK) {
      out.write(`UPDATE "_restore_hex" SET "x" = "x" || '${hex.slice(i, i + CHUNK)}' WHERE "k" = ${rewritten};\n`);
    }
    out.write(`UPDATE ${table} SET ${col} = unhex((SELECT "x" FROM "_restore_hex" WHERE "k" = ${rewritten})) WHERE ${cols[0]} = ${first[1]};\n`);
  }
}
if (helper) out.write('DROP TABLE "_restore_hex";\n');
out.end();
await new Promise((r) => out.on("finish", r));
console.log(`Fertig: ${rewritten} große Werte in Stücke zerlegt.`);

/** Teilt die VALUES-Liste in einzelne Literale, beachtet '…'-Zeichenketten mit '' als Escape. */
function splitValues(s) {
  const vals = [];
  let i = 0, start = 0, inStr = false;
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      if (c === "'" && s[i + 1] === "'") { i += 2; continue; }
      if (c === "'") inStr = false;
    } else if (c === "'") inStr = true;
    else if (c === ",") { vals.push(s.slice(start, i).trim()); start = i + 1; }
    i++;
  }
  vals.push(s.slice(start).trim());
  return vals;
}
