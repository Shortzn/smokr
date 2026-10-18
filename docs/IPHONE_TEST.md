# iPhone-Abnahme und erster Community-Eintrag

Stand 18. Oktober 2026 (Nachtauftrag). Abhaken direkt hier oder im Chat melden: Punkt, Ergebnis, bei Fehlern ein Screenshot.

Vor dem Start: Smokr einmal in Safari öffnen und zweimal neu laden, damit die neue Version aktiv ist. In der Info muss unter Datenstand das Datum vom 18.10.2026 stehen. Neu in Tokio: Plätze in Gotanda, Ōsaki, Ōimachi, Kinshichō, Ryōgoku und Oshiage.

## A. Safari

- [ ] **A1 Start:** Die Karte erscheint. Kopfzeile (Stadt, Suche, Filter) und Standort-Knopf werden nicht von der Dynamic Island oder der Safari-Leiste verdeckt.
- [ ] **A2 Standort:** Antippen. Safari fragt. „Erlauben“ wählen. Die Liste heißt „Near you“ bzw. „In deiner Nähe“, die Karte springt zu dir.
- [ ] **A3 Blatt ziehen:** Mit dem Finger auf und zu ziehen. Es soll nicht ruckeln und die Seite nicht verrutschen. Ganz offen scrollt die Liste. Oben angekommen zieht eine Abwärtsbewegung das Blatt wieder herunter.
- [ ] **A4 Marker:**
  - Sind grüne, orange, blaue und violette Marker auf hellen Straßen und grauen Gebäuden gut zu sehen?
  - Lässt sich ein Marker mit dem Finger leicht treffen?
  - Erscheint die schwarze Nadel?
- [ ] **A5 Liste:** Jede Zeile zeigt Name, japanischen Originalnamen, Typ, Zugang, Stockwerk und Luftlinie. Sind die Namen verständlich? Unverständliche Namen bitte notieren.
- [ ] **A6 Route:** „Route starten“ öffnet Apple Karten mit Fußweg. Der Link „Google Maps“ öffnet Google Maps.
- [ ] **A7 Suche:**
  - Ein Bahnhof auf Englisch, zum Beispiel „Akihabara“.
  - Derselbe Bahnhof auf Japanisch: 秋葉原.
  - Ein Ortstyp, zum Beispiel „Café“.
  - Die Tastatur verdeckt keine Ergebnisse.
- [ ] **A8 Sprache:** Unter Filter, Sprache: Englisch, Deutsch und Japanisch durchschalten. Alles ist übersetzt und lesbar.
- [ ] **A9 Stadtwechsel:** Mit aktivem GPS nach Kyoto wechseln. Die Liste zeigt Kyoto und springt nicht zurück. Der Standort-Knopf holt dich zurück.
- [ ] **A10 Offline:** Flugmodus an, Smokr neu laden. Die Liste ist da, Hinweis „Offline“. Flugmodus aus, der Hinweis verschwindet.
- [ ] **A11 Alte Rückmeldungen:** Wurden früher Plätze als „Nicht gefunden“ markiert, sind sie weiter ausgeblendet. Unter Filter lassen sie sich einblenden.

## B. Home-Bildschirm

- [ ] **B1 Installieren:** Teilen, dann „Zum Home-Bildschirm“, Name „Smokr“. Starten: Vollbild ohne Safari-Leisten.
- [ ] **B2 Standort:** Er wird hier eigens erlaubt.
- [ ] **B3 Route:** „Route starten“ öffnet Apple Karten. Danach zurück zu Smokr, der Zustand ist noch da.
- [ ] **B4 Drehen:** Querformat zeigt das Seitenpanel. Zurück ins Hochformat: Das Blatt sitzt richtig.

## C. Erster echter Raucherplatz (privater Test)

**Voraussetzung, einmalig (du):**
1. Bereitstellungs-Token als GitHub-Secret anlegen und den Workflow „Worker“ erst mit `staging`, dann mit `production` laufen lassen. Anleitung: `docs/COMMUNITY.md`, Abschnitt „Neue Worker-Versionen veröffentlichen“.
2. Moderation öffnen: `https://smokr-api.stefan-boschmeier.workers.dev/admin`, mit dem Passwort aus der Passwörter-App anmelden. Oben steht „Community: privat (nur mit Testercode)“.
3. Unter „Testzugänge“ einen Namen eintragen (zum Beispiel „Stefan iPhone“) und „Testercode erstellen“. Der Code erscheint **nur einmal**. In die Passwörter-App kopieren. Für jede Person einen eigenen Code.

Wir testen mit einem echten Platz, den ihr gefunden habt. Erfundene Plätze kommen nicht in die Datenbank. Muss doch etwas nur zum Testen hinein, beginnt der Name mit `[TEST]` und wird danach abgelehnt. Das löscht auch das Foto.

- [ ] **C1 Freischalten:** In Safari `https://shortzn.github.io/smokr/#community` öffnen. Ein Fenster „Privater Test“ fragt nach dem Testcode. Den Testercode aus der Moderation einfügen, „Freischalten“. Danach erscheint unten rechts der „+“-Knopf.
- [ ] **C2 Platz hinzufügen:** Vor Ort „+“ antippen. Unten öffnet sich das Formular, auf der Karte steht eine Nadel.
- [ ] **C3 Standort per Karte:** „Meinen Standort verwenden“ oder die Karte verschieben, bis die Nadel genau auf dem Platz steht.
- [ ] **C4 Angaben:** Art, Tabak und Zugang wählen. Name, Stockwerk oder Ausgang und eine kurze Beschreibung eintippen. Die Tastatur verdeckt die Felder nicht.
- [ ] **C5 Foto:** „Foto aufnehmen oder auswählen“. Ein echtes iPhone-Foto vom Platz oder Schild, ohne erkennbare Personen. HEIC aus der Mediathek geht auch. Die Vorschau erscheint.
- [ ] **C6 Absenden:** Zustimmung anhaken und „Zur Prüfung senden“. Es erscheint ein Dank. Erscheint ein Turnstile-Kästchen, bitte notieren.
- [ ] **C7 Admin öffnen:** Moderation neu laden.
  - Ist der Eintrag da, mit Position, Angaben und Foto?
  - Ist das Foto richtig gedreht?
  - Unter „Testzugänge“ steht beim Code „genutzt 1×“.
  - Bei Bedarf über „Korrigieren“ Name, Stockwerk oder Position anpassen.
- [ ] **C8 Freigeben.**
- [ ] **C9 Auf der Karte:** Smokr neu laden. Der Platz erscheint auf der Karte, in der Liste („Community“) und in der Suche nach seinem Namen. Das Foto ist sichtbar.
- [ ] **C10 Sprachen:** Unter Filter die Sprache auf Englisch und auf Deutsch stellen. Beim Platz stimmen Art, Zugang und Herkunft in beiden Sprachen. Dein Name und deine Beschreibung bleiben, wie du sie geschrieben hast.
- [ ] **C11 Meldung mit Position:** Bei einem anderen Platz „Problem melden oder mit Foto bestätigen“, dann „Falsche Position“. Die Nadel erscheint, Karte auf die richtige Stelle schieben, senden. In der Moderation steht die vorgeschlagene Position mit Abstand.
- [ ] **C12 Ohne Code:** In einem privaten Safari-Tab Smokr ohne `#community` öffnen. Es gibt keinen „+“-Knopf.

## Ergebnis

| Punkt | Ergebnis | Notiz |
|---|---|---|
| A1 bis A11 | | |
| B1 bis B4 | | |
| C1 bis C12 | | |
