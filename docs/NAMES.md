# Namen, Ortstypen und Marker (Phase 5A)

Stand 18. Oktober 2026.

## Namen

Die Lokalisierung läuft nur beim Bauen der Daten (`scripts/localize.py`). Es gibt keinen Übersetzungsdienst und keine laufenden Kosten. Der japanische Originalname bleibt immer sichtbar. Ein übertragener Name trägt in der Detailansicht den Hinweis, dass vor Ort der japanische Name steht.

### Quellen, in dieser Reihenfolge

1. **Englischer Name aus OpenStreetMap:** `name:en` oder `brand:en` des Eintrags selbst. Beispiele: Wendy's First Kitchen, McDonald's.
2. **Lateinischer Name:** Der Name ist schon lateinisch geschrieben.
3. **Zerlegung:** Jeder Teil des japanischen Namens muss bekannt sein:
   - **Eigennamen** aus einem Ortsnamen-Verzeichnis. Das sind rund 34.000 OSM-Objekte mit `name` und `name:en`: Orte, Bahnhöfe, Straßen, Parks, Gebäude (ODbL). Uneinige Einträge fallen weg.
   - **Allgemeine Begriffe** aus `data/i18n/glossary.json`. Diese Liste ist von Hand geprüft und enthält Einrichtung, Ausgänge, Ortszusätze, häufige Katakana-Lehnwörter, Marken und Hinweise in Klammern.
   - **Kurze Kana-Wörter** werden als Hepburn-Lesung umgeschrieben. Lange Katakana-Wörter, die nach Lehnwort aussehen, werden nicht umgeschrieben, weil die Lautschrift irreführen würde.
4. **Sonst keine Übersetzung.** Die App beschreibt den Ort mit unseren eigenen Daten, zum Beispiel „Raucherplatz bei Shimbashi“ oder „Café“, und zeigt den japanischen Namen darunter.

### Beispiele

| Japanisch | Englisch | Deutsch |
|---|---|---|
| 秋葉原昭和通り口喫煙所（区営） | Akihabara Smoking Area – Showa-dori Exit | Raucherplatz Akihabara – Showa-dori-Ausgang |
| オアシス@akiba（区営） | Oasis @ Akiba Smoking Area | Raucherplatz Oasis @ Akiba |
| ミマツたばこ | Mimatsu (Typ: Tabakgeschäft) | Mimatsu (Typ: Tabakgeschäft) |
| 新宿駅東口公衆喫煙所 | Shinjuku Station Public Smoking Area – East Exit | Öffentlicher Raucherplatz Bahnhof Shinjuku – Ostausgang |
| 大門駅Ａ６出口指定喫煙場所 | Daimon Station Designated Smoking Area – Exit A6 | Ausgewiesener Raucherplatz Bahnhof Daimon – Ausgang A6 |
| 新橋駅烏森口指定喫煙場所 | (nicht übersetzt: 烏森 ist unbekannt) Smoking area near Shimbashi | Raucherplatz bei Shimbashi |

### Qualitätskontrolle

| Gruppe | Einträge |
|---|---:|
| Alle Einträge | 2.655 |
| Nur japanischer Name | 1.194 |
| Generischer Name (nur „喫煙所“ o. Ä.) | 23 |
| Ohne Namen | 285 |
| **Verlässlich lokalisiert** | **1.614** |
| davon englischer Name aus OSM | 949 |
| davon zusammengesetzt aus Verzeichnis und Glossar | 409 |
| davon lateinisch | 219 |
| davon Marke | 37 |
| Hepburn-Lesung, sollte von Hand geprüft werden | 126 |
| Nicht übersetzt, sollte von Hand geprüft werden | 607 |

Von den 1.194 rein japanischen Namen sind 443 verlässlich lokalisiert (407 zusammengesetzt, 36 Marke). Dazu kommen 126 Lesungen. 602 bleiben unübersetzt.

**Listen zum Prüfen von Hand:**

- `data/i18n/review.csv` enthält alles, was nicht verlässlich lokalisiert ist.
- `data/i18n/localized.csv` enthält alle zusammengesetzten Namen zur Stichprobe.

Korrekturen kommen ins Glossar oder als OSM-Bearbeitung (`name:en`), nie direkt in die App.

## Ortstyp und Rauchbereich

Die Einordnung macht `scripts/classify.py`, nur aus belegten Angaben:

- **Ortstyp** aus OSM-Tags oder dem Namen:
  - Bahnhof, Flughafen, Einkaufszentrum, Park, Straße oder Platz
  - Café, Restaurant, Imbiss, Bar oder Izakaya, Karaoke, Hotel
  - Konbini, Tabakgeschäft, Geschäft, Pachinko-Halle, Gebäude, Freizeitpark
  - unbekannt

  Beschreibungen zählen dafür bewusst nicht, weil sie oft andere Orte erwähnen.
- **Rauchbereich:**
  - Raucherraum, Raucherkabine, im Freien, Raucherplatz
  - Raucherraum im Lokal, Rauchen im Lokal erlaubt, Aschenbecher vor dem Laden
- **Zugang:**
  - Kostenlos, wenn die Stadt „無料・誰でも利用可“ schreibt oder der Platz städtisch betrieben wird.
  - Nur für Kunden.
  - Bordkarte nötig: am Flughafen nach der Sicherheitskontrolle.
  - Sonst unklar.
- **Weitere Angaben:**
  - Innen oder außen.
  - Stockwerk aus Name oder Beschreibung, zum Beispiel 4F oder B1.
  - Bahnhofsausgang.
  - Tabakart nur, wenn sie genannt ist.

| Ortstyp | Einträge | Rauchbereich | Einträge |
|---|---:|---|---:|
| Café | 718 | Raucherraum im Lokal | 841 |
| unbekannt | 638 | Raucherplatz | 696 |
| Restaurant | 276 | Rauchen im Lokal erlaubt | 545 |
| Bar/Izakaya | 224 | Raucherraum | 273 |
| Konbini | 125 | im Freien | 240 |
| Imbiss | 115 | Aschenbecher | 51 |
| Bahnhof | 93 | Raucherkabine | 9 |
| Pachinko | 89 | | |
| Park | 79 | | |

Stockwerk bekannt: 852 Einträge. Kostenlos belegt: 371. Bordkarte nötig: 4.

## Marker

| Marker | Bedeutung |
|---|---|
| Grüner Kreis, Zigarette | Öffentlicher Raucherplatz oder -raum |
| Oranger Kreis, Tasse | Café, Restaurant, Bar |
| Blauer Kreis, Tasche | Geschäft, Konbini, Pachinko, Hotel, sonstiger Betrieb |
| Violetter Kreis, Gerät | Nur Tabakerhitzer |
| Grauer Kreis, ? | Unbestätigter Konbini (nur wenn eingeblendet) |
| Grauer Kreis, × | Von dir nicht gefunden (nur wenn eingeblendet) |
| Schwarze Nadel | Ausgewählt, der normale Marker darunter verschwindet |
| Schwarzer Kreis mit Zahl | Gruppe, antippen vergrößert |

**Sichtbarkeit:**

- 34 px mit weißem Rand und Schatten, Farbe und Symbol zugleich.
- Die Trefferfläche ist 22 px um den Tippunkt.
- Die Symbole der Grundkarte für Geschäfte und Freizeit sind ausgeblendet, damit die Marker nicht zwischen Kartensymbolen verschwinden. Bahnhöfe bleiben.

**Verlässlichkeit** steht nicht mehr auf dem Marker (früher hohl oder gefüllt), sondern in Liste und Detail.

Ein OSM-Prüfdatum heißt dort „zuletzt von Mitwirkenden geprüft“. Es ist nie eine Vor-Ort-Bestätigung durch Smokr.
