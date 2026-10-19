/* Laufzeit-Einstellungen. Ob die Community sichtbar ist, entscheidet der Server über /v1/status
   (off, private mit Testercode, public). Ohne "api" bleibt sie immer aus.
   Hier stehen nur öffentliche Werte: Die Turnstile-Site-Key ist öffentlich, Secrets liegen im Worker. */
window.SMOKR_CONFIG = {
  api: "https://smokr-api.stefan-boschmeier.workers.dev",
  turnstileSiteKey: "0x4AAAAAAFaO1xQghmWa_hn9",
  contactUrl: "https://github.com/Shortzn/smokr/issues",
  // Rückmeldungen ohne GitHub-Konto (steht auch im Impressum)
  contactEmail: "mail@sthb.me",
  legalUrl: "legal.html",
  // false = privater Test: nur Geräte mit Testercode oder dem Link #community fragen den Server.
  // Erst bei der öffentlichen Freigabe (Variante B) auf true setzen.
  communityPublic: false,
  // Vorübergehend: "Diagnose kopieren" im Formular, nur im privaten Test. Vor der öffentlichen Freigabe entfernen.
  diagnostics: true,
};
