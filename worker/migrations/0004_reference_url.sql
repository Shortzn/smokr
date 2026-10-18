-- Karten-Link, den die Person eingefügt hat, als Hinweis für die Moderation (nicht öffentlich).
-- Gespeichert ohne Klick- und Sitzungsparameter (ved, sa, entry, ei ...).
ALTER TABLE submissions ADD COLUMN ref_url TEXT;
