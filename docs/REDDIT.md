# Reddit- und Community-Beta: Vorbereitung

Nichts wird automatisch gepostet. Du entscheidest, wann und wo.

## Vor dem Posten

- [ ] **iPhone-Test:** Die echten iPhone-Tests aus `docs/BETA.md` sind gemacht.
- [ ] **Impressum und Datenschutz** sind online, falls die Community-Funktionen eingeschaltet sind.
- [ ] **Regeln des Subreddits gelesen:** Seitenleiste und Wiki. Ich konnte sie nicht automatisch abrufen, Reddit blockt das.
  - Viele Reise-Subreddits verbieten Eigenwerbung ganz oder erlauben sie nur in festen Sammel-Threads.
  - Im Zweifel vorher den Moderatoren schreiben und fragen, ob ein Beta-Aufruf passt.
- [ ] **Konto:** Ein Konto mit normaler Vorgeschichte verwenden, kein frisch angelegtes nur für den Post.
- [ ] **Offenheit:** Offen sagen, dass die App von dir ist.
- [ ] **Nur echtes Feedback:** Keine bestellten Kommentare, keine Bewertungen von Freunden, keine Zweitkonten.

## Mögliche Orte (Regeln jeweils prüfen)

| Ort | Passt, weil | Achtung |
|---|---|---|
| r/JapanTravelTips | Praktische Reisetipps | Eigenwerbung oft nur eingeschränkt erlaubt |
| r/JapanTravel | Sehr groß | Strenge Regeln, eher in einem Sammel-Thread fragen |
| r/Tokyo, r/osaka, r/Kyoto, r/okinawa | Lokale Frage | Lokale Regeln unterschiedlich |
| r/iqos | Tabakerhitzer-Nutzer, Filter „Nur IQOS“ | Kleiner, Thema passt genau |
| Kommentare in bestehenden Threads | Jemand fragt konkret nach Raucherplätzen in Japan | Nur antworten, wenn die Frage wirklich passt, kein Copy-Paste |

## Entwurf (Englisch, Stand 18. Oktober 2026, vor öffentlicher Community)

**Titel:** We're traveling through Japan and kept walking to smoking areas that weren't there, so we built a free map. Looking for honest feedback.

> Hi all. We are on a trip through Japan right now (Tokyo, Kamakura, Kyoto, Okinawa, Osaka). As smokers who try to follow the rules, the hardest part has been finding a place where smoking is actually allowed. The apps we tried sent us to spots that were gone, to konbini ashtrays that were removed years ago, or into a café where you have to order first. A few were only in Japanese.
>
> So we built **Smokr**, a free web app: **https://shortzn.github.io/smokr/**
>
> **What it does:**
> - Uses the **official lists** of Tokyo wards and the City of Osaka where they exist, plus OpenStreetMap. Every spot says where its information comes from and how old it is.
> - Tells you **what kind of place** it is and whether it's free: public smoking area, café or restaurant, shop, heated tobacco only, customers only.
> - Shows names in English or German where they can be translated reliably, and always keeps the Japanese name so you can match it with signs.
> - Hides old konbini ashtray entries by default, because many are gone.
> - One tap for walking directions in Apple Maps or Google Maps. No account, no ads, no tracking. Works offline once loaded.
>
> **What it doesn't do (yet):**
> - Not every spot has been checked on site. Official lists can be outdated, and some positions are only known by street address.
> - Distances are straight lines, not walking time.
> - Kyoto, Kamakura and Okinawa have few official spots.
>
> If you're in Japan, we'd really like to hear from you: did you find the spot, was the position or access info right, which names were confusing? Each spot has a button to email us a correction. Adding new spots and photos yourself is coming once we've tested moderation properly.
>
> Please follow local rules. Many areas fine you for smoking on the street, and smoking is 20+ in Japan.

Erst wenn die Community öffentlich ist (Variante B, nach deiner Freigabe), den vorletzten Absatz so ersetzen:

> You can add missing smoking areas yourself, confirm existing ones, report wrong ones and add a photo of the entrance or sign. It's free and needs no account. Every submission is reviewed before it appears.

### Stand der Regelprüfung

- **Automatisch nicht prüfbar:** Reddit blockt automatische Abrufe. Auch eine Websuche lieferte die Regeln von r/JapanTravel und r/JapanTravelTips nicht.
- **Was sich feststellen ließ:** Das Wiki von r/JapanTravel verweist auf die Regelliste in der Seitenleiste ([Wiki-Spiegel](https://pol1.lr.ggtyler.dev/r/JapanTravel/wiki/index)). Andere Reise-Subreddits erlauben Eigenwerbung oft nur nach Freigabe durch die Moderatoren oder in Sammel-Threads ([Beispiel r/canadatravel](https://pol1.lr.ggtyler.dev/r/canadatravel/wiki/index)).
- **Vorgehen:** Vor jedem Post die Seitenleiste lesen und im Zweifel per Modmail fragen. Ein Entwurf für die Modmail steht unten.

### Modmail-Entwurf

> Hi mods, I built a free, non-commercial web map of smoking areas in Japan based on official ward and city lists (no ads, no account, no tracking). Would a short post asking travelers for feedback on data quality be okay here, or is there a thread where it fits better? Thanks!

## Kurzbeschreibung (für Kommentare oder Profil)

> Smokr: free map of smoking areas in Japan, built on official city lists. Shows where each spot's data comes from, marks IQOS-only spots, opens walking directions in Apple/Google Maps. No account, no tracking, works offline. Beta: https://shortzn.github.io/smokr/

## Feedback-Ablauf

1. **Wege:** Rückmeldungen kommen als Reddit-Kommentare, als GitHub Issue, per Mail an die Adresse im Impressum oder, sobald die Community öffentlich ist, über „Problem melden“ in der App.
2. **Sammeln:** Du sammelst sie einmal am Tag, ich sortiere sie nach der Liste unten ein.
3. **Datenfehler** (Platz fehlt, existiert nicht) gehen in die Moderation oder eine Korrektur der Daten. **Bedienprobleme** werden Issues mit Gerät und Browser.
4. **Antworten:** Kurz und ehrlich antworten, ob und wann es behoben wird.

## Prioritäten für gemeldete Probleme

| Stufe | Beispiele | Reaktion |
|---|---|---|
| P0 kritisch | App lädt nicht, weiße Seite, Route öffnet falschen Ort, Datenleck, Foto mit privaten Daten | Sofort. Foto zurückziehen, notfalls Rollback auf `alpha-final` |
| P1 hoch | Offizieller Platz existiert nicht mehr, falscher Zugang („öffentlich“, aber nur für Kunden), Standort funktioniert auf einem Gerät nicht | Innerhalb eines Tages |
| P2 mittel | Position ungenau, Übersetzung unklar, Blatt ruckelt auf einem Gerät | Nächste Version |
| P3 niedrig | Wünsche wie neue Städte, Kompass, Dark Mode | Sammeln, später entscheiden |
