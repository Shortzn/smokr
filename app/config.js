/* Laufzeit-Einstellungen. Ob die Community sichtbar ist, entscheidet der Server über /v1/status
   (off, private mit Testercode, public). Ohne "api" bleibt sie immer aus.
   Hier stehen nur öffentliche Werte: Die Turnstile-Site-Key ist öffentlich, Secrets liegen im Worker. */
window.SMOKR_CONFIG = {
  api: "https://smokr-api.stefan-boschmeier.workers.dev",
  turnstileSiteKey: "0x4AAAAAAFaO1xQghmWa_hn9",
  contactUrl: "https://github.com/Shortzn/smokr/issues",
  legalUrl: "legal.html",
};
