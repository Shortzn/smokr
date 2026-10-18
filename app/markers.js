/* Marker-Grafiken: Form UND Farbe unterscheiden die Arten, damit es nicht nur an der Farbe hängt.
   Kreis = öffentlich, abgerundetes Quadrat = Geschäft oder Lokal, Raute = nur Tabakerhitzer.
   Ausgefüllt = verlässliche Quelle, hohl = weniger verlässlich (nur OSM ohne Prüfdatum, Position ungefähr). */
(function (root) {
  "use strict";

  const PALETTE = {
    public: "#0b8043",
    business: "#b45f06",
    heated: "#6a3fd1",
    gone: "#9e9e9e",
    ink: "#000000",
    paper: "#ffffff",
  };

  /** "public" | "business" | "heated" | "gone": bestimmt Form und Farbe. */
  function markerKind(s, reports) {
    if (reports && reports[s.id] && reports[s.id].s === "gone") return "gone";
    if (s.heated) return "heated";
    return s.k === "v" || s.acc === "customers" ? "business" : "public";
  }

  function shapePath(ctx, shape, cx, cy, r) {
    ctx.beginPath();
    if (shape === "circle") {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (shape === "square") {
      const s = r * 0.9, rad = r * 0.38;
      ctx.moveTo(cx - s + rad, cy - s);
      ctx.arcTo(cx + s, cy - s, cx + s, cy + s, rad);
      ctx.arcTo(cx + s, cy + s, cx - s, cy + s, rad);
      ctx.arcTo(cx - s, cy + s, cx - s, cy - s, rad);
      ctx.arcTo(cx - s, cy - s, cx + s, cy - s, rad);
    } else {
      const s = r * 1.12;
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
    }
    ctx.closePath();
  }
  const SHAPE = { public: "circle", business: "square", heated: "diamond", gone: "circle" };

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  /** Normaler Marker. hollow = weniger verlässlich. */
  function drawMarker(kind, hollow, ratio) {
    const size = Math.round(22 * ratio);
    const c = canvas(size, size);
    const ctx = c.getContext("2d");
    const mid = size / 2, r = size * 0.36;
    const color = PALETTE[kind];
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 2 * ratio;
    ctx.shadowOffsetY = 0.5 * ratio;
    shapePath(ctx, SHAPE[kind], mid, mid, r + 1.6 * ratio);
    ctx.fillStyle = PALETTE.paper;
    ctx.fill();
    ctx.shadowColor = "transparent";
    shapePath(ctx, SHAPE[kind], mid, mid, r);
    ctx.fillStyle = color;
    ctx.fill();
    if (hollow) {
      shapePath(ctx, SHAPE[kind], mid, mid, r * 0.5);
      ctx.fillStyle = PALETTE.paper;
      ctx.fill();
    }
    if (kind === "gone") {
      ctx.strokeStyle = PALETTE.paper;
      ctx.lineWidth = 1.6 * ratio;
      ctx.beginPath();
      ctx.moveTo(mid - r * 0.5, mid - r * 0.5); ctx.lineTo(mid + r * 0.5, mid + r * 0.5);
      ctx.moveTo(mid + r * 0.5, mid - r * 0.5); ctx.lineTo(mid - r * 0.5, mid + r * 0.5);
      ctx.stroke();
    }
    return ctx.getImageData(0, 0, size, size);
  }

  /** Ausgewählter Platz: schwarze Nadel mit der Form der Art darin. Spitze unten. */
  function drawPin(kind, ratio) {
    const w = Math.round(40 * ratio), h = Math.round(52 * ratio);
    const c = canvas(w, h);
    const ctx = c.getContext("2d");
    const cx = w / 2, cy = w / 2, r = w * 0.4;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 5 * ratio;
    ctx.shadowOffsetY = 2 * ratio;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 2.22);
    ctx.lineTo(cx, h - 2 * ratio);
    ctx.closePath();
    ctx.fillStyle = PALETTE.ink;
    ctx.fill();
    ctx.shadowColor = "transparent";
    shapePath(ctx, SHAPE[kind], cx, cy, r * 0.48);
    ctx.fillStyle = PALETTE.paper;
    ctx.fill();
    shapePath(ctx, SHAPE[kind], cx, cy, r * 0.34);
    ctx.fillStyle = PALETTE[kind];
    ctx.fill();
    return ctx.getImageData(0, 0, w, h);
  }

  function addImages(map) {
    const ratio = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    for (const kind of ["public", "business", "heated", "gone"]) {
      for (const hollow of [false, true]) {
        const name = `m-${kind}${hollow ? "-weak" : ""}`;
        if (!map.hasImage(name)) map.addImage(name, drawMarker(kind, hollow, ratio), { pixelRatio: ratio });
      }
      if (!map.hasImage(`pin-${kind}`)) map.addImage(`pin-${kind}`, drawPin(kind, ratio), { pixelRatio: ratio });
    }
  }

  /** Gleiche Form als SVG für Liste und Legende. */
  function svg(kind, hollow, size) {
    const s = size || 28, m = s / 2, r = s * 0.34;
    const fill = PALETTE[kind];
    const shape = SHAPE[kind];
    const path = (rr) => {
      if (shape === "circle") return `<circle cx="${m}" cy="${m}" r="${rr}"/>`;
      if (shape === "square") { const q = rr * 0.9; return `<rect x="${m - q}" y="${m - q}" width="${2 * q}" height="${2 * q}" rx="${rr * 0.38}"/>`; }
      const q = rr * 1.12;
      return `<path d="M${m} ${m - q}L${m + q} ${m}L${m} ${m + q}L${m - q} ${m}Z"/>`;
    };
    const cross = kind === "gone" ? `<path d="M${m - r / 2} ${m - r / 2}L${m + r / 2} ${m + r / 2}M${m + r / 2} ${m - r / 2}L${m - r / 2} ${m + r / 2}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` : "";
    return `<svg class="mk" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" aria-hidden="true"><g fill="${fill}">${path(r)}</g>${hollow ? `<g fill="#fff">${path(r * 0.5)}</g>` : ""}${cross}</svg>`;
  }

  root.SmokrMarkers = { PALETTE, markerKind, addImages, svg };
})(window);
