// Erzeugt den Wert für das Secret ADMIN_PASSWORD_HASH.
// Aufruf: node worker/tools/hash-password.mjs   (fragt das Passwort ab, zeigt es nicht an)
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const ITER = 100000; // Höchstwert, den Cloudflare Workers für PBKDF2 erlauben
const b64 = (u8) => Buffer.from(u8).toString("base64url");

async function hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

if (process.argv[2] === "--stdin") {
  let data = "";
  process.stdin.on("data", (d) => { data += d; });
  process.stdin.on("end", async () => { console.log(await hash(data.replace(/\r?\n$/, ""))); });
} else {
  // Abfrage über stderr, damit nur der Hash auf stdout landet (für $(...) im Setup-Skript)
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl._writeToOutput = (s) => { if (s.startsWith("Admin")) process.stderr.write(s); };
  rl.question("Admin-Passwort (mindestens 16 Zeichen, wird nicht angezeigt): ", async (pw) => {
    rl.close();
    process.stderr.write("\n");
    if (pw.length < 16) { console.error("Zu kurz."); process.exit(1); }
    process.stdout.write(await hash(pw));
  });
}
