# iPhone-Abnahme und erster Community-Eintrag

Stand 18. Oktober 2026, Version `beta-2`. Abhaken direkt hier oder im Chat melden: Punkt, Ergebnis, bei Fehlern ein Screenshot.

Vor dem Start: Smokr einmal in Safari öffnen und neu laden, damit die neue Version (Service Worker v9) aktiv ist. In der Info muss unter Datenstand das Datum vom 18.10.2026 stehen.

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

## C. Erster Community-Eintrag (erst nach Einrichtung und Freigabe)

Voraussetzung:

- `sh worker/tools/setup.sh` ist gelaufen.
- Ich habe die API in der App eingeschaltet.
- Das Impressum ist online.

Wir testen mit einem echten Platz, den ihr gefunden habt. Erfundene Testdaten kommen nicht in die Datenbank. Muss doch etwas nur zum Testen hinein, beginnt der Name mit `[TEST]`. Es wird danach in der Moderation abgelehnt, das löscht auch das Foto.

- [ ] **C1** Vor Ort „+“ antippen. Unten öffnet sich das Formular, auf der Karte steht eine Nadel.
- [ ] **C2** „Meinen Standort verwenden“ oder die Karte verschieben, bis die Nadel stimmt.
- [ ] **C3** Art, Tabak und Zugang wählen. Name und Hinweise eintippen. Die Tastatur verdeckt die Felder nicht.
- [ ] **C4** „Foto aufnehmen oder auswählen“:
  - Ein Foto direkt mit der Kamera aufnehmen.
  - Beim zweiten Versuch eines aus der Mediathek wählen. Das darf auch ein HEIC-Foto sein.
  - Die Vorschau erscheint.
- [ ] **C5** Zustimmung anhaken und „Zur Prüfung senden“ tippen. Es erscheint ein Dank. Erscheint ein Turnstile-Kästchen, bitte notieren.
- [ ] **C6** Moderation unter `<API-Adresse>/admin` öffnen, mit dem Admin-Passwort anmelden:
  - Ist der Eintrag da, mit Position, Angaben und Foto?
  - Ist das Foto richtig gedreht?
  - Wird eine Dublette in der Nähe angezeigt?
- [ ] **C7** Freigeben. Smokr neu laden: Der Platz erscheint auf der Karte, in der Liste („Community“) und in der Suche nach seinem Namen. Das Foto ist sichtbar.
- [ ] **C8** Beim Platz „Problem melden oder mit Foto bestätigen“ antippen, dann „Raucherplatz ist da“ senden. In der Moderation freigeben. Danach steht beim Platz „1× von Besuchern bestätigt“.
- [ ] **C9** „Foto melden“ antippen. In der Moderation erscheint es unter „Gemeldete Fotos“. Bitte „Behalten“ wählen.

## Ergebnis

| Punkt | Ergebnis | Notiz |
|---|---|---|
| A1 bis A11 | | |
| B1 bis B4 | | |
| C1 bis C9 | | |
