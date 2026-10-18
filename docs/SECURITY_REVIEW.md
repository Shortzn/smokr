# Sicherheitsprüfung

Stand: 18. Oktober 2026. Jede Aussage hier ist durch Code-Lesen und einen automatischen Test belegt. Wo nur gelesen wurde, steht das dabei.

## Aufbau

| Teil | Wo | Wer erreicht es |
|---|---|---|
| App (statisch) | GitHub Pages, `https://shortzn.github.io/smokr/` | alle |
| Community-API | Cloudflare Worker `smokr-api`, `https://smokr-api.stefan-boschmeier.workers.dev` | alle, schreiben nur mit Testercode |
| Datenbank | Cloudflare D1 `smokr-community` | nur der Worker |
| Spam-Schutz | Cloudflare Turnstile, Widget „Smokr“ für `shortzn.github.io` | Formulare |
| Moderation | `/admin` im Worker | nur mit Admin-Passwort |
| Bereitstellung | GitHub Actions „Worker“ mit Secret `CLOUDFLARE_API_TOKEN` | nur Repo-Admin |

Cloudflare-Ressourcen am 18.10.2026: genau ein Worker (`smokr-api`), genau eine Datenbank (`smokr-community`). Staging-Worker und -Datenbanken werden bei jedem Testlauf angelegt und am Ende gelöscht (nachgeprüft).

## Prüfpunkte

| Risiko | Schutz | Beleg |
|---|---|---|
| Einsendungen ohne Freigabe | Modus `private`: Einsendungen, Meldungen und Foto-Meldungen nur mit gültigem Testercode, geprüft im Worker | API-Test „Privater Modus“, live: Einsendung ohne Code gibt 403 |
| Testercodes erraten | 16 Zeichen aus 32 (80 Bit), nur Hash gespeichert, 20 Fehlversuche pro Gerät und Tag | API-Tests „Widerrufene Codes“, „Zu viele Fehlversuche“ |
| SQL-Injection | Alle Werte über gebundene Parameter; Tabellennamen nur aus fester Liste | Code gelesen (`prepare(...).bind(...)`) |
| XSS in der App | Alle Texte mit `esc()`; Foto-IDs nur 32 Hex-Zeichen | Browser-Test „Community-Texte vom Server werden nie als HTML ausgeführt“ (7 Profile) |
| XSS im Admin | Nur `textContent`, kein `innerHTML`; strenge CSP | Code gelesen, CSP-Header im API-Test |
| CSRF im Admin | Gleicher Ursprung plus eigener Header `x-smokr-admin` | API-Test (Moderation ohne Header: 403) |
| CORS | Nur `https://shortzn.github.io` (Staging: nur der Testserver) | API-Test fremder Ursprung: 403 |
| Sitzung | HMAC-signiertes Cookie, `HttpOnly`, `Secure`, `SameSite=Strict`, Pfad `/admin`, 12 h | API-Test prüft Attribute und gefälschte Sitzung |
| Admin-Passwort raten | PBKDF2 100.000 Runden, 8 Versuche pro Gerät und Tag | Code gelesen, Grenze im Browser-Test aufgefallen und bestätigt |
| Manipulierte Uploads | JPEG wird Segment für Segment geprüft; PNG, Müll, abgeschnittene Bilder, Skript davor: 400 | API-Test „Manipulierte Fotos“ |
| Metadaten in Fotos | Neu kodiert im Browser, EXIF/GPS/XMP/Kommentare im Worker entfernt | API-Test „Metadaten sind entfernt“ |
| Große Anfragen | Über 2 MB abgewiesen, Foto über 1 MB abgewiesen | API-Test |
| Speicher volllaufen | Fotobudget 300 MB (D1 erlaubt 500 MB), dann 507, Einsendung ohne Foto geht weiter | API-Test „Speicherbudget“ |
| Massenmeldungen | Turnstile, Tageslimits pro Gerät und global, Dubletten-Abweisung | API-Tests „Ratenbegrenzung“, „Doppelte Einsendungen“ |
| Ungeprüfte Fotos öffentlich | Direkte URL gibt 404 bis zur Freigabe; abgelehnt heißt gelöscht | API-Tests |
| Anonyme Löschung | Eine Meldung „gibt es nicht“ ändert nichts; nur der Admin blendet aus | API-Test „Meldungen“ |
| Personenbezug | Kein Konto, IP nur als täglich gesalzener Hash, nach 30 Tagen gelöscht; Texte abgelehnter Beiträge nach 30 Tagen gelöscht | Code, Test „Nächtliches Aufräumen“ |
| Kontakt zu Cloudflare ohne Grund | Ohne Testercode oder Testlink fragt die App die API gar nicht an | Browser-Test, live geprüft |
| Secrets im Repository | Keine; Suche über alle 28 Commits nach Token-, Schlüssel- und Hash-Mustern | 18.10.2026, nur ein Code-Kommentar zum Hash-Format |
| Secrets in Logs | Workflow maskiert Konto-ID und Testpasswort; Token nur über Umgebungsvariable | Workflow-Läufe angesehen |

## Offene Risiken

- **Cache in mehreren Rechenzentren:** Nach einer Moderation kann ein Nutzer an einem anderen Cloudflare-Standort die Community-Liste noch bis zu 60 Sekunden alt sehen. Unkritisch.
- **Testercode im Browser:** Wer Zugriff auf ein entsperrtes Gerät hat, kann den Code lesen. Er erlaubt nur Einsendungen zur Prüfung, nichts wird ohne Moderation öffentlich. Widerruf im Admin wirkt sofort.
- **Login-Sperre pro Gerät:** Ein Angreifer mit vielen IP-Adressen kann mehr als 8 Passwörter pro Tag probieren. Schutz ist dann allein die Passwortstärke (Zufallspasswort, 24+ Zeichen).
- **Token-Rechte:** Der Bereitstellungs-Token darf Workers und D1 im Konto ändern. Er liegt nur als GitHub-Secret vor. Die Kopie im iCloud-Ordner sollte gelöscht werden.
- **Kein echter iPhone-Test** der Formulare und des Admins (nur emulierte Profile).

## Sicherung

| Weg | Was | Getestet |
|---|---|---|
| D1 Time Travel | Automatisch, 7 Tage (Free) | Ja, auf Staging: Zurücksetzen entfernt eine Markierung |
| Export aus dem Admin | JSON aller Einträge, Protokoll und Testercodes (ohne Hashes), ohne Bilddaten | API-Test |
| Vollständiger Export | `wrangler d1 export` plus `worker/tools/d1-restore-prepare.mjs` für Bilder über 100 KB | Ja, auf Cloudflare: alle Tabellen und Fotos byte-identisch |

Ablauf einer Wiederherstellung steht in `docs/COMMUNITY.md`, Abschnitt „Sicherung und Wiederherstellung“.
