/* Marker: kräftiger Farbkreis mit weißem Symbol, weißem Rand und Schatten.
   Das Symbol zeigt die Art des Ortes, damit es nicht nur an der Farbe hängt:
     Zigarette = öffentlicher Raucherplatz, Tasse = Café/Restaurant/Bar, Tasche = Geschäft/Konbini/Betrieb,
     Stick = nur Tabakerhitzer, ? = unbestätigt, × = von dir nicht gefunden.
   Die Verlässlichkeit steht bewusst nicht auf der Karte, sondern in Liste und Detail. */
(function (root) {
  "use strict";

  const PALETTE = {
    public: "#0a7d3e",
    food: "#e8590c",
    shop: "#1d5fd6",
    heated: "#6c3fd6",
    unverified: "#6b7280",
    gone: "#9ca3af",
    ink: "#000000",
    paper: "#ffffff",
  };
  const FOOD = new Set(["cafe", "restaurant", "fast_food", "bar", "karaoke"]);

  /** "public" | "food" | "shop" | "heated" | "unverified" | "gone" */
  function markerKind(s, reports) {
    if (reports && reports[s.id] && reports[s.id].s === "gone") return "gone";
    if (s.unv) return "unverified";
    if (s.heated) return "heated";
    if (s.k !== "v" && s.acc !== "customers") return "public";
    if (FOOD.has(s.pk) || ["cafe", "restaurant", "fast_food", "pub", "bar", "beer_garden", "club", "karaoke"].includes(s.vt)) return "food";
    return "shop";
  }

  // ---------- Symbole als Pfade auf einem 24er-Raster ----------
  function glyph(ctx, kind, cx, cy, size) {
    const k = size / 24;
    ctx.save();
    ctx.translate(cx - 12 * k, cy - 12 * k);
    ctx.scale(k, k);
    ctx.fillStyle = PALETTE.paper;
    ctx.strokeStyle = PALETTE.paper;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (kind === "public") {
      // Zigarette mit Rauchfaden
      roundRect(ctx, 3, 13, 15, 4.5, 1.2); ctx.fill();
      ctx.globalAlpha = 0.55; roundRect(ctx, 14, 13, 4, 4.5, 1); ctx.fillStyle = "#000"; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = PALETTE.paper;
      roundRect(ctx, 19.5, 13, 2, 4.5, 0.8); ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(19, 10.5); ctx.bezierCurveTo(17, 8.5, 21, 7, 19, 4.5); ctx.stroke();
    } else if (kind === "food") {
      // Tasse
      ctx.lineWidth = 2.2;
      roundRect(ctx, 4, 9, 12, 9.5, 2.2); ctx.fill();
      ctx.beginPath(); ctx.arc(17.5, 13.2, 2.8, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(7.5, 7); ctx.bezierCurveTo(6.5, 5.5, 8.5, 4.5, 7.5, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(12, 7); ctx.bezierCurveTo(11, 5.5, 13, 4.5, 12, 3); ctx.stroke();
      roundRect(ctx, 3, 19.5, 15, 1.8, 0.9); ctx.fill();
    } else if (kind === "shop") {
      // Einkaufstasche
      roundRect(ctx, 4.5, 9, 15, 11.5, 2); ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8.5, 10); ctx.lineTo(8.5, 7.5); ctx.arc(12, 7.5, 3.5, Math.PI, 0); ctx.lineTo(15.5, 10); ctx.stroke();
    } else if (kind === "heated") {
      // Tabakerhitzer: Gerät mit Stick
      roundRect(ctx, 8, 7.5, 8, 14, 3); ctx.fill();
      roundRect(ctx, 10.4, 2.5, 3.2, 6.5, 1.2); ctx.fill();
      ctx.fillStyle = PALETTE.heated;
      ctx.beginPath(); ctx.arc(12, 16.5, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (kind === "unverified") {
      ctx.font = "bold 17px -apple-system, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", 12, 13);
    } else {
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(7, 7); ctx.lineTo(17, 17); ctx.moveTo(17, 7); ctx.lineTo(7, 17); ctx.stroke();
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  /** Normaler Marker: 34 px inklusive Rand und Schatten. */
  function drawMarker(kind, ratio) {
    const size = Math.round(34 * ratio);
    const c = canvas(size, size);
    const ctx = c.getContext("2d");
    const mid = size / 2;
    const r = 13 * ratio;
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 3 * ratio;
    ctx.shadowOffsetY = 1 * ratio;
    ctx.beginPath(); ctx.arc(mid, mid - 0.5 * ratio, r + 2.5 * ratio, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.paper; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath(); ctx.arc(mid, mid - 0.5 * ratio, r, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE[kind]; ctx.fill();
    glyph(ctx, kind, mid, mid - 0.5 * ratio, 17 * ratio);
    return ctx.getImageData(0, 0, size, size);
  }

  /** Ausgewählter Platz: große schwarze Nadel mit dem Farbkreis darin. Spitze unten. */
  function drawPin(kind, ratio) {
    const w = Math.round(48 * ratio), h = Math.round(62 * ratio);
    const c = canvas(w, h);
    const ctx = c.getContext("2d");
    const cx = w / 2, cy = w / 2, r = w * 0.42;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6 * ratio;
    ctx.shadowOffsetY = 2 * ratio;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineTo(cx, h - 3 * ratio);
    ctx.closePath();
    ctx.fillStyle = PALETTE.ink; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE[kind]; ctx.fill();
    glyph(ctx, kind, cx, cy, r * 1.0);
    return ctx.getImageData(0, 0, w, h);
  }

  const KINDS = ["public", "food", "shop", "heated", "unverified", "gone"];
  function addImages(map) {
    const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    for (const kind of KINDS) {
      if (!map.hasImage(`m-${kind}`)) map.addImage(`m-${kind}`, drawMarker(kind, ratio), { pixelRatio: ratio });
      if (!map.hasImage(`pin-${kind}`)) map.addImage(`pin-${kind}`, drawPin(kind, ratio), { pixelRatio: ratio });
    }
  }

  /** Gleicher Marker als Bild für Liste und Legende. */
  const cache = new Map();
  function svg(kind, _unused, size) {
    const s = size || 28;
    const key = `${kind}:${s}`;
    if (!cache.has(key)) {
      const ratio = 2;
      const c = canvas(34 * ratio, 34 * ratio);
      c.getContext("2d").putImageData(drawMarker(kind, ratio), 0, 0);
      cache.set(key, c.toDataURL("image/png"));
    }
    return `<img class="mk" src="${cache.get(key)}" width="${s}" height="${s}" alt="" aria-hidden="true">`;
  }

  root.SmokrMarkers = { PALETTE, KINDS, markerKind, addImages, svg };
})(window);
