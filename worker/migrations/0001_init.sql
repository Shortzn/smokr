-- Smokr Community: Einreichungen, Meldungen, Fotos, Missbrauchsschutz, Moderationsprotokoll.
-- Nichts ist öffentlich, bevor ein Admin es freigibt (status = 'approved').

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('public', 'shop', 'room')),
  tobacco TEXT NOT NULL CHECK (tobacco IN ('all', 'heated', 'unknown')),
  access TEXT NOT NULL CHECK (access IN ('public', 'customers', 'unknown')),
  name TEXT,
  floor TEXT,
  note TEXT,
  lang TEXT,
  photo_id TEXT,
  ip_hash TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  dup_of TEXT
);
CREATE INDEX submissions_status ON submissions (status, created_at);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  spot_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('found', 'missing', 'closed', 'position', 'info', 'other')),
  comment TEXT,
  lang TEXT,
  photo_id TEXT,
  ip_hash TEXT,
  reviewed_at TEXT,
  review_note TEXT
);
CREATE INDEX reports_status ON reports (status, created_at);
CREATE INDEX reports_spot ON reports (spot_id, status);

-- Fotos liegen vorerst in D1 (höchstens 1,5 MB pro Bild). Für R2 bräuchte Cloudflare eine Zahlungsmethode.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('submission', 'report')),
  owner_id INTEGER,
  bytes BLOB,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  sha256 TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0,
  reviewed_at TEXT
);
CREATE INDEX photos_status ON photos (status);
CREATE INDEX photos_owner ON photos (owner_type, owner_id);

CREATE TABLE photo_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  photo_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  ip_hash TEXT,
  handled INTEGER NOT NULL DEFAULT 0
);

-- Basis-Plätze, die ein Admin nach Prüfung ausgeblendet hat (z. B. "existiert nicht mehr")
CREATE TABLE hidden_spots (
  spot_id TEXT PRIMARY KEY,
  hidden_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reason TEXT
);

-- Zähler pro Tag: Schlüssel = Aktion + täglich wechselnder IP-Hash, oder "global:<aktion>"
CREATE TABLE rate (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  note TEXT
);
