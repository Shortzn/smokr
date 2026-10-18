# Datenabgleich und neue offizielle Quellen

Stand: 18. Oktober 2026. Reine Recherche. An `app/`, `scripts/build_data.py` und den bestehenden Dateien in `data/official/` wurde nichts geändert. Neue Kandidaten liegen in `data/official/candidates/`, die Rohdaten in `data/raw/official/candidates/`.

## 1. MottoSuitai: was erlaubt ist

### robots.txt

Abgerufen am 18. Oktober 2026 von https://mottosuitai.com/robots.txt (ein Abruf).

- Für alle normalen Crawler (`User-Agent: *`) ist die Seite erlaubt. Gesperrt sind `/api/`, `/account/` und `/private/`. Ausdrücklich erlaubt sind nur `/api/v1/faq` und `/api/v1/llms-full/`.
- Für KI-Agenten ist die ganze Seite gesperrt (`Disallow: /`). Das gilt ausdrücklich für die Kennungen von Anthropic (`ClaudeBot`, `Claude-Web`, `anthropic-ai`), für OpenAI (`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`), Perplexity (`PerplexityBot`, `Perplexity-User`), Google-Extended, Applebot-Extended, Meta, Cohere, You.com, DuckAssist, Amazon, Bytespider und CCBot. Dazu kommen SEO-Crawler wie Ahrefs und Semrush.
- Gesperrt sind also auch die Abrufe, die ein KI-Assistent im Auftrag eines Nutzers macht (`ChatGPT-User`, `Perplexity-User`). Die Absicht ist klar: Die Betreiber wollen nicht, dass KI-Werkzeuge ihre Seiten lesen.

### Nutzungsbedingungen

Eine Seite mit Nutzungsbedingungen (利用規約) konnte ich nicht lesen. Über die Websuche war keine zu finden, und die Seite selbst wollte ich nicht aufrufen, weil robots.txt das für Claude untersagt.

### Folge für diese Recherche

Der Auftrag erlaubte bis zu etwa 15 Seitenaufrufe von Hand. Nach der robots.txt habe ich darauf verzichtet. Aufgerufen wurde nur robots.txt selbst, einmal. Kartenseiten, Bahnhofsseiten, die API und `llms-full` habe ich nicht abgerufen. Aus MottoSuitai wurde nichts übernommen, keine Koordinaten, keine Einträge, keine Texte, keine Fotos.

Eine Suchanfrage hat nebenbei gezeigt, dass es dort eine eigene Seite für den Bahnhof Shinjuku gibt (`/en/search/station/shinjuku-station/`). Mehr weiß ich über deren Abdeckung nicht. Ein qualitativer Vergleich mit MottoSuitai ist deshalb nicht möglich. Die Lücken unten stammen aus Smokrs eigenen Daten und aus den offiziellen Quellen.

Wenn du den Vergleich trotzdem willst, kannst du die Seiten selbst im Browser ansehen. Das ist ein normaler Besuch und fällt nicht unter die Sperre für KI-Agenten.

## 2. Abdeckung von Smokr je Gebiet

Gezählt wurden alle Plätze in `app/data/<region>.json` mit `acc == "public"` im Umkreis von 800 m Luftlinie um den Mittelpunkt. „Offiziell“ heißt: der Eintrag hat ein Feld `off`. „Nur OSM“ ist der Rest der öffentlichen Plätze. „Lokale“ sind alle übrigen Einträge (Cafés, Konbinis, Geschäfte, Zugang unklar oder nur für Kunden).

| Gebiet | Mittelpunkt (lat, lon) | Öffentlich | davon offiziell | nur OSM | Lokale | neue Kandidaten |
|---|---|---:|---:|---:|---:|---:|
| Bahnhof Shinjuku | 35.6896, 139.7006 | 27 | 12 | 15 | 44 | 1 |
| Bahnhof Shibuya | 35.6580, 139.7016 | 23 | 22 | 1 | 34 | 0 |
| Bahnhof Akihabara | 35.6984, 139.7731 | 33 | 28 | 5 | 41 | 0 |
| Ginza (Kreuzung 4-chōme) | 35.6717, 139.7650 | 28 | 23 | 5 | 27 | 0 |
| Asakusa (Kaminarimon) | 35.7111, 139.7964 | 9 | 7 | 2 | 13 | 2 |
| Bahnhof Ikebukuro | 35.7295, 139.7109 | 9 | 6 | 3 | 24 | 0 |
| Bahnhof Shinagawa | 35.6285, 139.7388 | 9 | 9 | 0 | 2 | 0 |
| Bahnhof Kinshichō | 35.6969, 139.8145 | 1 | 0 | 1 | 10 | 6 |
| Oshiage, Skytree | 35.7101, 139.8120 | 1 | 0 | 1 | 4 | 3 |
| Bahnhof Kyoto | 34.9858, 135.7588 | 9 | 8 | 1 | 13 | 0 |
| Shijō-Kawaramachi | 35.0037, 135.7690 | 7 | 2 | 5 | 15 | 0 |
| Gion (Shijō-Hanamikōji) | 35.0036, 135.7752 | 10 | 3 | 7 | 7 | 0 |
| Arashiyama (Togetsukyō) | 35.0128, 135.6777 | 2 | 0 | 2 | 0 | 0 |
| Fushimi Inari Taisha | 34.9671, 135.7727 | 0 | 0 | 0 | 1 | 0 |
| Bahnhof Kamakura | 35.3190, 139.5503 | 1 | 1 | 0 | 3 | 0 |
| Naha, Kokusai-dōri (Mitsukoshi-mae) | 26.2157, 127.6856 | 1 | 0 | 1 | 4 | 0 |
| Osaka Namba (Bahnhof Namba) | 34.6655, 135.5010 | 43 | 43 | 0 | 61 | 0 |
| Osaka Umeda (Bahnhof Osaka) | 34.7025, 135.4959 | 37 | 29 | 8 | 81 | 0 |

Die Mittelpunkte sind gerundete, allgemein bekannte Koordinaten der Bahnhöfe und Plätze. Bei Naha liegt der Punkt in der Mitte der Kokusai-dōri, bei Oshiage zwischen Bahnhof und Skytree.

Zusätzlich für Shinagawa-ku, weil der Bahnhof Shinagawa selbst in Minato-ku liegt:

| Gebiet | Mittelpunkt | Öffentlich | davon offiziell | neue Kandidaten |
|---|---|---:|---:|---:|
| Bahnhof Gotanda | 35.6262, 139.7236 | 1 | 0 | 6 |
| Bahnhof Ōsaki | 35.6197, 139.7286 | 4 | 0 | 5 |
| Bahnhof Ōimachi | 35.6065, 139.7349 | 3 | 0 | 2 |

## 3. Lücken

- **Sumida (Kinshichō, Oshiage, Skytree, Ryōgoku):** Die größte Lücke in Tokio. Smokr hat dort je einen OSM-Platz und keinen offiziellen. Der Bezirk veröffentlicht 8 eigene Plätze und 4 private. Diese Lücke lässt sich jetzt schließen.
- **Shinagawa-ku (Gotanda, Ōsaki, Ōimachi):** Bisher nur OSM. Der Bezirk listet 15 Plätze.
- **Asakusa:** Mit 9 öffentlichen Plätzen eher dünn für so ein Touristenziel. Direkt gegenüber am anderen Flussufer liegt der Platz von Sumida in Azumabashi (etwa 440 m vom Kaminarimon) und der im Sumida-Park (etwa 680 m). Beide fehlen bisher.
- **Shinjuku:** Der Bezirk listet weiterhin genau die 12 Plätze, die Smokr schon hat. Beide Bezirksseiten sind unverändert (Stand 5. August 2024 und 30. März 2026). Mehr gibt es nur über private Betreiber, etwa Raucherräume in Kaufhäusern.
- **Ginza:** Gut abgedeckt. Die Liste von Chūō-ku ist vom 13. Oktober 2026 und enthält auch die privaten Plätze wie GINZA SIX, Pocket of Time und Ginza Novo. Ich habe keine fehlende offizielle Stelle gefunden.
- **Kyoto Arashiyama und Fushimi Inari:** Die Stadt Kyoto hat dort keine Plätze. Auch bei Keifuku (Randen), auf der Seite des Fushimi Inari Taisha und beim Bezirk Ukyō fand ich keine offizielle Angabe. Die Seite von Keifuku war technisch nicht erreichbar.
- **Naha:** Die Stadt veröffentlicht keine Liste. Auch für die städtische Tenbusu Naha und das Kaufhaus Ryūbō fand ich nichts Offizielles.
- **Ikebukuro:** 9 öffentliche Plätze. Toshima listet nur 7 eigene. Hier habe ich nicht weiter gesucht.

## 4. Neue Kandidatenquellen

### Shinagawa-ku (15 Kandidaten), Datei `data/official/candidates/shinagawa.json`

- **Quelle:** https://www.city.shinagawa.tokyo.jp/PC/kankyo/kankyo-kankyo/hpg000011438.html, aktualisiert am 16. März 2026 (令和8年3月16日).
- **Inhalt:**
  - 8 Plätze, die der Bezirk betreibt (公設): Gotanda 2, Ōimachi 2, Ōsaki 3, Nishi-Ōi 1. Zwei davon nur für Tabakerhitzer (Gotanda Westausgang Honmura-bashi, Ōsaki Westausgang an den Gleisen).
  - 4 private öffentliche Plätze (民設), die der Bezirk ausdrücklich als 公衆喫煙場所 listet: Gotanda JP Building, FamilyMart Higashi-Gotanda UG, THE TOBACCO GOTANDA, THE TOBACCO TOGOSHIGINZA.
  - 3 Plätze von Parkverwaltungen: Bunko-no-Mori-Park und zwei Parks der Präfektur Tokio in Yashio.
- **Öffnungszeiten:** stehen bei 8 Plätzen auf der Seite und sind übernommen.
- **Position:** Die Seite nennt keine Koordinaten. Alle 15 Plätze sind über GSI aus der Adresse berechnet (`geo: address`, `geo_precision: block`). Die zwei Parks in Yashio sind groß. Dort kann die Position deutlich danebenliegen.
- **Kontrolle:** Eine Karte des Bezirks (`hpg000011438_11.pdf`, Stand April 2025) zeigt dieselben Plätze in Gotanda, Ōsaki und Ōimachi.
- **Rechte:** Laut „このホームページについて“ hat der Bezirk das Urheberrecht, unerlaubtes Zitieren, Übernehmen und Kopieren ist untersagt. Es gibt keinen Hinweis auf 政府標準利用規約 oder CC BY. Übernommen sind nur Tatsachen (Name, Adresse, Zeiten) mit Link, keine Texte, Fotos oder Karten.
- **Verlässlichkeit:** hoch. Die Seite ist aktuell und nennt die Plätze einzeln mit Adresse.

### Sumida-ku (12 Kandidaten), Datei `data/official/candidates/sumida.json`

- **Quelle:** https://www.city.sumida.lg.jp/kurashi/volunteer/rojyou_kinnen/suishintiku.html, aktualisiert am 2. Oktober 2025.
- **Inhalt:**
  - 8 Plätze des Bezirks (区指定喫煙所): Kinshichō Südausgang, Kinshi-Park, Ryōgoku Westausgang, Hikifune (Container), Oshiage Bahnhof, Tōbu-bashi, Azumabashi (Uruoi-Platz), Sumida-Park.
  - 4 private Plätze in Kaufhäusern in Kinshichō: Tokyo Rakutenchi, PARCO, Marui, Termina.
- **Status der privaten Plätze:** Sie stammen aus einer Testphase vom 15. Oktober bis 15. November 2025. Die Seite sagt, dass ihre Veröffentlichung danach enden kann, und wurde seitdem nicht aktualisiert. Diese 4 sind deshalb `status: unknown`.
- **Position:** Die Seite nennt nur Adressen ohne Hausnummer. Alle 12 Plätze sind über GSI berechnet (`block`). Rakutenchi und PARCO haben dieselbe Adresse und deshalb denselben Punkt.
- **Rechte:** Laut „著作権等について“ (Stand 2019) liegen die Rechte beim Bezirk, unerlaubte Nutzung und Übernahme sind außerhalb des Urheberrechtsgesetzes untersagt. Kein 政府標準利用規約, keine CC BY. Übernommen sind nur Name und Adresse mit Link.
- **Verlässlichkeit:** hoch für die 8 Plätze des Bezirks, mittel für die 4 privaten.
- **Geschlossen:** Der Platz am Westausgang von Tōbu Hikifune (Higashi-Mukōjima 2-26-6) wurde laut Bezirk am 4. Juni 2018 aufgegeben. In Smokr gibt es dort keinen Eintrag, also nichts zu korrigieren.

### Shinjuku, privater Betreiber (1 Kandidat), Datei `data/official/candidates/shinjuku.json`

- **Quelle:** Keiō-Kaufhaus Shinjuku, Serviceseite https://www.keionet.com/info/shinjuku/service/ (Raucherraum im 8. Stock auf der Restaurantseite), bestätigt durch den Etagenplan 8. Stock. Die Adresse stammt von der Zugangsseite. Die Seiten tragen kein Datum, als Datum steht der Abruftag.
- **Zugang:** `customers`, ein Raucherraum im Kaufhaus, nur während der Öffnungszeiten.
- **Position:** Die Berechnung aus der Adresse landet genau auf dem Punkt des städtischen Platzes am Westausgang (`shinjuku-2`), weil beide im selben Block liegen. Vor einer Übernahme müsste die Position von Hand gesetzt werden.
- **Rechte:** Privater Betreiber. Übernommen ist nur die Tatsache, dass es den Raum gibt, mit Link.
- **Verlässlichkeit:** mittel.
- **Nicht geprüft:** Die Seite von Isetan Shinjuku zum Raucherraum (mistore.jp) hat auf beide Versuche nicht geantwortet (Zeitüberschreitung). Bei Odakyū, Lumine und Takashimaya fand ich keine offizielle Seite, nur Blogs.

### Keine neuen Kandidaten

- **Ginza, Asakusa (Taitō), Shibuya, Akihabara:** Die Quellen sind schon drin und frisch, nichts Neues gefunden.
- **Kyoto Arashiyama, Fushimi Inari:** keine offizielle Quelle.
- **Naha:** keine offizielle Quelle.

### Nicht verwendete Quelle: CLUB JT

Die Karte von JT (clubjt.jp) listet in allen Problemgebieten Plätze. Der Bezirk Sumida verlinkt sie sogar selbst. Sie ist aber eine private Datenbank. Ihre Nutzungsbedingungen habe ich nicht geprüft, und ich habe nichts daraus übernommen. Taugt höchstens als Hinweis, wo man suchen kann.

## 5. Was nicht geprüft werden konnte

- **MottoSuitai, Abdeckung und Nutzungsbedingungen:** rechtlich, wegen der robots.txt, siehe Abschnitt 1.
- **Isetan Shinjuku:** technisch, Zeitüberschreitung bei zwei Versuchen.
- **Keifuku (Randen), Bahnhof Arashiyama:** technisch, der Server `randen.keifuku.co.jp` war per DNS nicht erreichbar. Auf `www.keifuku.co.jp` und `inari.jp` fand ich das Wort 喫煙 nicht.
- **Genaue Positionen:** Shinagawa und Sumida nennen keine Koordinaten. Die Lagepläne als Bilder auf der Seite von Shinagawa habe ich nicht ausgewertet. Damit ließen sich die Positionen von Hand verbessern.
- **Weitere Bahnbetreiber:** JR East und Tokyo Metro haben in den Bahnhöfen keine Raucherräume. Eine Liste mit öffentlichen Plätzen von Keiō, Odakyū oder Tōbu habe ich nicht gefunden.

## 6. Mögliche Doppelungen und veraltete Einträge in Smokr

### Gleiche Position, verschiedene Plätze

Das sind Plätze, die die Berechnung aus der Adresse auf denselben Punkt gelegt hat. Doppelt sind sie nicht, aber auf der Karte liegen sie übereinander:

- `off-shibuya-15` THE TOBACCO SHIBUYA SECOND und `off-shibuya-27` Shibuya PARCO
- `off-chiyoda-52` 三久ビル喫煙所 und `off-chiyoda-56` paspa霞が関
- `off-chiyoda-6` スモーキングスペース サンディベル und `off-chiyoda-7` Smoking Space SHIOTANI

Mehrere Etagen im selben Gebäude (Minato, Osaka, Flughafen Naha) sind gewollt und kein Fehler.

### Offizieller Platz und OSM-Eintrag fast an derselben Stelle

Diese Paare wurden nicht zusammengelegt und erscheinen wohl doppelt:

| Abstand | Offiziell | OSM |
|---:|---|---|
| 7 m | `off-minato-9` 桜田公園内指定喫煙場所 | `osm-n6438702043` |
| 3 m | `off-kyoto-13` 高台寺公園内喫煙場所 | `osm-n5273140616` |
| 12 m | `off-kyoto-1` 四条西木屋町喫煙場所 | `osm-n4899309421` |
| 4 m | `off-osaka-30` 堂島ニ丁目喫煙所 | `osm-n5174657854` |

Bei `off-osaka-13` 小松原町喫煙所 gibt es in OSM drei Teilflächen (Zigaretten und Tabakerhitzer getrennt). Das ist eher eine genauere Beschreibung als eine Doppelung.

### Kandidaten, die schon als OSM-Eintrag in Smokr sind

Werden die Kandidaten übernommen, sollten diese OSM-Plätze damit zusammengelegt werden:

- `cand-shinagawa-3` Ōimachi West und `osm-n6089943989` (35 m)
- `cand-shinagawa-5` Ōsaki West Busplatz und `osm-n10896014947` und `osm-n10897584275` (33 bis 36 m). OSM unterscheidet dort zwischen Tabakerhitzer und Zigarette, der Bezirk nennt einen Platz.
- `cand-shinagawa-6` Ōsaki West an den Gleisen und `osm-n10896014948` (48 m)
- `cand-shinagawa-8` Nishi-Ōi und `osm-n10873319011` (22 m)
- `cand-shinagawa-13` Bunko-no-Mori-Park und `osm-n5808540253` (33 m)
- `cand-sumida-1` Kinshichō Süd und `osm-w678971211` (19 m)
- `cand-sumida-7` Azumabashi und `osm-n14288614937` (28 m)

### Veraltete oder unklare Stände

- **Shinjuku:** Die Liste der 7 städtischen Plätze ist vom 5. August 2024 und unverändert. Eine neuere Fassung gibt es nicht.
- **Kōtō:** Die 6 offiziellen Plätze haben `status: unknown` und kein Datum, erscheinen aber in der App.
- **Kyoto:** `kyoto-7` (みやこ夢てらす) und `kyoto-8` (八条西口) liegen nach den Koordinaten der Stadt nur 4 m auseinander, obwohl es zwei verschiedene Orte sind. Das sollte man an der Karte der Stadt prüfen.
- **Geschlossene Plätze:** 14 offizielle Einträge in Tokio sind `closed` und werden in der App nicht gezeigt. Das stimmt so.
- **Sumida, private Plätze:** Ob die 4 Kaufhausplätze aus der Testphase noch gelistet sind, ist offen.

## 7. Dateien

- `data/official/candidates/shinagawa.json`: 15 Kandidaten
- `data/official/candidates/sumida.json`: 12 Kandidaten, davon 4 mit `status: unknown`
- `data/official/candidates/shinjuku.json`: 1 Kandidat, nur für Kunden
- `data/raw/official/candidates/`: gespeicherte Seiten der Bezirke und Betreiber, Rechtehinweise, PDFs von Shinagawa, GSI-Cache

Die Felder entsprechen `data/official/tokyo.json`. Neu dazu kommen `access`, `license` und, wo nötig, `note`. Bei Sumida gibt es zusätzlich `area`. Die IDs beginnen mit `cand-`, damit sie nicht mit bestehenden IDs zusammenstoßen.
