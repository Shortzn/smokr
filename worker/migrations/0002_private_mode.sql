-- Privater Testmodus, Korrekturvorschläge mit Position, Dubletten-Schutz.

-- Testercodes: nur der SHA-256-Hash wird gespeichert, der Code selbst wird einmal angezeigt
CREATE TABLE testers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  label TEXT,
  code_hash TEXT NOT NULL UNIQUE,
  revoked_at TEXT,
  last_used_at TEXT,
  uses INTEGER NOT NULL DEFAULT 0
);

-- Meldung "falsche Position": vorgeschlagene neue Position
ALTER TABLE reports ADD COLUMN sug_lat REAL;
ALTER TABLE reports ADD COLUMN sug_lon REAL;

-- Wer etwas eingereicht hat (nur Testercode-ID, keine Person)
ALTER TABLE submissions ADD COLUMN tester_id INTEGER;
ALTER TABLE reports ADD COLUMN tester_id INTEGER;

-- Schneller Dubletten-Check (gleiches Gerät, kurz hintereinander, gleicher Ort)
CREATE INDEX submissions_ip ON submissions (ip_hash, created_at);
CREATE INDEX photos_sha ON photos (sha256);
