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

## Entwurf (Englisch, Stand Phase 5)

**Titel:** We kept walking to "smoking areas" in Japan that didn't exist, so I built a free map from official city lists. Beta testers welcome.

> Hi! On our trip through Japan (Tokyo, Kamakura, Kyoto, Okinawa, Osaka) the smoking-area apps we tried kept sending us to places that didn't exist anymore, to konbini ashtrays that had been removed years ago, or to spots that turned out to be inside a café where you have to order first. Some apps were Japanese only.
>
> So I built **Smokr**, a free web app: **https://shortzn.github.io/smokr/**
>
> **What it does today:**
> - **Data:** Most public spots come from the **official ward and city lists** (for example Chiyoda, Minato, Chuo, Taito and the City of Osaka), plus OpenStreetMap.
> - **Map symbols:** Every marker shows **what kind of place** it is: public smoking area, café or restaurant, shop, or heated-tobacco-only (IQOS etc.).
> - **Details:** The list shows access ("free", "customers only", "boarding pass needed"), floor, and where the data comes from.
> - **Names:** Japanese names are shown in **English** where they could be translated reliably, for example "Shinjuku Station Public Smoking Area – East Exit". The original Japanese name always stays visible so you can match it with signs.
> - **Konbini:** Old konbini ashtray entries are hidden by default because many are gone.
> - **Directions:** One tap opens walking directions in Apple Maps or Google Maps.
> - **App:** English, German and Japanese. No account, no ads, no tracking. Works offline once loaded, and you can add it to your home screen.
>
> **Known limitations, honestly:**
> - Distances are straight-line.
> - About a third of the Japanese names couldn't be translated reliably, so the app describes those ("Smoking area near Shimbashi") instead of guessing.
> - Some OpenStreetMap entries are old.
> - Kamakura and Okinawa have few official spots.
>
> I'm looking for real feedback from people in Japan:
> - Did you find the spot?
> - Was the position or the access info right?
> - Which names were confusing?
>
> Reply here or open an issue: https://github.com/Shortzn/smokr/issues
>
> Please follow local rules. Many areas fine you for smoking on the street.

Ist die Community eingeschaltet, kommt dieser Absatz dazu:

> **New:** You can add missing smoking areas yourself, confirm existing ones, report wrong ones, and add your own photo of the entrance or sign. It's free and needs no account. Every submission is reviewed before it appears.

### Stand der Regelprüfung

- **Automatisch nicht prüfbar:** Reddit blockt automatische Abrufe. Auch eine Websuche lieferte die Regeln von r/JapanTravel und r/JapanTravelTips nicht.
- **Was sich feststellen ließ:** Das Wiki von r/JapanTravel verweist auf die Regelliste in der Seitenleiste ([Wiki-Spiegel](https://pol1.lr.ggtyler.dev/r/JapanTravel/wiki/index)). Andere Reise-Subreddits erlauben Eigenwerbung oft nur nach Freigabe durch die Moderatoren oder in Sammel-Threads ([Beispiel r/canadatravel](https://pol1.lr.ggtyler.dev/r/canadatravel/wiki/index)).
- **Vorgehen:** Vor jedem Post die Seitenleiste lesen und im Zweifel per Modmail fragen. Ein Entwurf für die Modmail steht unten.

### Modmail-Entwurf

> Hi mods, I built a free, non-commercial web map of smoking areas in Japan based on official ward and city lists (no ads, no account, no tracking). Would a short post asking travelers for feedback on data quality be okay here, or is there a thread where it fits better? Thanks!

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
