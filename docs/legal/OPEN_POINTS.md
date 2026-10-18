# Rechtliche Punkte: offen oder unsicher

Stand 18. Oktober 2026. Keine Rechtsberatung. Diese Liste hält fest, was ich nicht abschließend beurteilen kann. Die Texte in `app/legal.html` beschreiben, was der Code tatsächlich tut (geprüft durch Tests), behaupten aber keine vollständige rechtliche Konformität.

| Punkt | Stand | Wer entscheidet |
|---|---|---|
| Impressum (ECG § 5, MedienG § 25) | Name, Anschrift, E-Mail stehen drin. Ob für eine private, kostenlose App eine verkürzte Offenlegung reicht, ist nicht geprüft. | du |
| Datenschutz (DSGVO) | Inhalte, Speicherorte, Fristen und Rechte beschrieben. Kein Verarbeitungsverzeichnis, keine Auftragsverarbeitungs-Prüfung mit Cloudflare und GitHub. Cloudflare bietet ein DPA in den Kontoeinstellungen. | du |
| Übermittlung in die USA (Cloudflare, GitHub) | Beide sind nach EU-US Data Privacy Framework zertifiziert (Stand meines Wissens, nicht nachgeprüft). In der Erklärung nicht ausdrücklich genannt. | du |
| Japanisches Datenschutzrecht (APPI) | Nutzer sind meist Touristen in Japan. Ob das APPI greift, ist nicht geprüft. Es werden keine Namen, Konten oder Kontaktdaten erhoben. | offen |
| Lizenz der Beiträge (CC BY 4.0) | Einsender stimmen beim Foto zu. Bei reinen Texten ohne Foto gibt es keine eigene Zustimmung, nur den Hinweis im Formular. | du, vor öffentlicher Freigabe |
| Personen auf Fotos | Formular bittet um Fotos ohne erkennbare Personen. Prüfung nur durch Moderation, keine automatische Erkennung. | Moderation |
| Melde- und Abhilfeverfahren (DSA) | „Foto melden“, E-Mail, Moderation mit Protokoll vorhanden. Ob Smokr als Hosting-Dienst unter die DSA-Pflichten für Kleinstanbieter fällt, ist nicht geprüft. | offen |
| Amtliche Daten der Bezirke | Nur Tatsachen übernommen, Bewertung in `docs/DATA_QUALITY.md`. | du |
| Jugendschutz | Hinweis „Rauchen erst ab 20“ steht in Impressum und Datenschutz. Keine Altersabfrage in der App. | du |
| Werbung später (Smokr Free) | Nicht umgesetzt. Bräuchte später Einwilligungsbanner und neue Datenschutztexte. | später |
