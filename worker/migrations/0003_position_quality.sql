-- Wie genau ist die Position, und woher kommt sie? (Suche nach Namen oder Adresse findet das Gebäude,
-- nicht unbedingt den Raucherplatz darin.)
--   pos_quality: exact (am Raucherplatz) | building (Gebäude oder Eingang) | approx (nur ungefähr)
--   pos_source:  gps | map | search | address | link
--   address:     gefundene Adresse oder Ortsbezeichnung, wie sie die Suche geliefert hat
ALTER TABLE submissions ADD COLUMN pos_quality TEXT;
ALTER TABLE submissions ADD COLUMN pos_source TEXT;
ALTER TABLE submissions ADD COLUMN address TEXT;
