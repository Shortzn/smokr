// Prüft ein JPEG Segment für Segment und baut es ohne Metadaten neu zusammen.
// Entfernt: EXIF und XMP (APP1), weitere APP-Segmente außer JFIF (APP0), ICC-Profil (APP2) und
// Adobe (APP14), Kommentare (COM) sowie alles nach dem Bildende (z. B. angehängte Zweitbilder).
// Wirft bei allem, was kein vollständiges JPEG ist.

const MAX_EDGE = 4096;

export class PhotoError extends Error {}

function u16(b, i) { return (b[i] << 8) | b[i + 1]; }

function isIcc(b, start) {
  // "ICC_PROFILE\0"
  const sig = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00];
  return sig.every((c, k) => b[start + k] === c);
}

export function cleanJpeg(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 128 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) throw new PhotoError("not a JPEG");
  const out = [b.subarray(0, 2)];
  let i = 2;
  let width = 0, height = 0, sawScan = false, end = -1;

  while (i < b.length) {
    if (b[i] !== 0xff) throw new PhotoError("broken marker");
    while (b[i] === 0xff && i < b.length) i++; // Füllbytes
    const marker = b[i];
    const markerStart = i - 1;
    i++;
    if (marker === 0xd9) { end = i; break; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) throw new PhotoError("unexpected marker");
    if (i + 2 > b.length) throw new PhotoError("truncated");
    const len = u16(b, i);
    if (len < 2 || i + len > b.length) throw new PhotoError("bad length");
    const segStart = markerStart, segEnd = i + len;
    const data = i + 2;

    let keep = true;
    if (marker >= 0xe1 && marker <= 0xef) {
      keep = (marker === 0xe2 && isIcc(b, data)) || marker === 0xee;
    }
    if (marker === 0xfe) keep = false;
    if (marker === 0xe0) keep = true;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (len < 8) throw new PhotoError("bad frame");
      height = u16(b, data + 1);
      width = u16(b, data + 3);
    }
    if (keep) out.push(b.subarray(segStart, segEnd));
    i = segEnd;

    if (marker === 0xda) {
      // Bilddaten bis zum nächsten echten Marker kopieren
      sawScan = true;
      const scanStart = i;
      while (i < b.length) {
        if (b[i] === 0xff) {
          const n = b[i + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { i += n === 0xff ? 1 : 2; continue; }
          break;
        }
        i++;
      }
      if (i >= b.length) throw new PhotoError("no end marker");
      out.push(b.subarray(scanStart, i));
    }
  }
  if (!sawScan || end < 0) throw new PhotoError("incomplete image");
  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE) throw new PhotoError("bad size");
  out.push(new Uint8Array([0xff, 0xd9]));

  let total = 0;
  for (const part of out) total += part.length;
  const clean = new Uint8Array(total);
  let o = 0;
  for (const part of out) { clean.set(part, o); o += part.length; }
  return { bytes: clean, width, height };
}
