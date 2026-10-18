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

## Entwurf (Englisch)

**Titel:** I built a free map of smoking areas in Japan (official city lists, works offline). Looking for beta testers.

> Hi! While traveling in Japan I kept walking to "smoking areas" from other apps that didn't exist, or turned out to be inside a café. So I built **Smokr**, a free web app:
>
> **https://shortzn.github.io/smokr/**
>
> - Covers Tokyo, Kamakura, Kyoto, Okinawa and Osaka.
> - Most public spots come from the **official ward and city lists** (for example Chiyoda, Shinjuku, Minato and the City of Osaka), plus OpenStreetMap.
> - Every spot shows **where the data comes from** and how exact the position is.
> - Public spots and cafés/shops (where you may need to buy something) are clearly separated.
> - **Heated-tobacco-only** spots (IQOS etc.) are marked, and you can filter them out if you smoke cigarettes.
> - One tap opens **walking directions** in Apple Maps or Google Maps.
> - English, German and Japanese. No account, no ads, no tracking. Works offline once loaded. Add it to your home screen to use it like an app.
>
> **Known limitations, honestly:**
> - Distances are straight-line, not walking distance.
> - Some spots from OpenStreetMap are old. They're drawn hollow so you can tell.
> - Old konbini ashtray entries are hidden by default because many are gone.
> - Kamakura and Okinawa have few official spots, so the map is sparse there.
>
> If you're in Japan, I'd love to hear: Did you find the spot? Was the position right? What was confusing? Reply here or open an issue on GitHub: https://github.com/Shortzn/smokr/issues
>
> Please follow local rules. Many areas fine you for smoking on the street.

Ist die Community-Funktion eingeschaltet, kommt dieser Satz dazu:

> You can also add missing spots and confirm existing ones with a photo, right in the app. Submissions are reviewed before they appear.

## Kurzbeschreibung (für Kommentare oder Profil)

> Smokr: free map of smoking areas in Japan, built on official city lists. Shows where each spot's data comes from, marks IQOS-only spots, opens walking directions in Apple/Google Maps. No account, no tracking, works offline. Beta: https://shortzn.github.io/smokr/

## Feedback-Ablauf

1. **Wege:** Rückmeldungen kommen als Reddit-Kommentare, als GitHub Issue oder, wenn eingeschaltet, über „Problem melden“ in der App.
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
