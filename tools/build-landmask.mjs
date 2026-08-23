/**
 * Erzeugt aus Natural-Earth-Laendergrenzen das Punktraster fuer den Hero.
 * Ausgabe: src/landmask.js - pro Rasterzelle ein Laenderindex (0 = Wasser).
 * Damit weiss die Karte zur Laufzeit ohne Netzwerkzugriff, welches Land unter
 * dem Cursor liegt - auch dort, wo Humanity First (noch) nicht aktiv ist.
 *
 * Projektion: equirectangular, Antarktis abgeschnitten. Haelt die Punktzeilen
 * gerade und gibt ein Hero-taugliches Seitenverhaeltnis.
 *
 * Aufruf: node tools/build-landmask.mjs <ne_110m_admin_0_countries.geojson>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const COLS = Number(process.env.COLS || 200);   // groeber = groessere Punkte
const LAT_TOP = 83;
const LAT_BOTTOM = -56;
const ROWS = Math.round((COLS * (LAT_TOP - LAT_BOTTOM)) / 360);
const SUB = 3;                                   // Subsamples pro Zelle und Achse
const FINE = 14;                                 // feinere Abtastung fuer Inselstaaten

const geo = JSON.parse(readFileSync(process.argv[2], 'utf8'));

// Ein Eintrag pro Land; Index 0 bleibt fuer Wasser frei.
const countries = [];
const shapes = [];

for (const f of geo.features) {
  const p = f.properties;
  const name = p.NAME_DE || p.NAME_LONG || p.NAME || p.ADMIN;
  const idx = countries.length + 1;
  countries.push({ name, iso: p.ISO_A2_EH || p.ISO_A2 || '', continent: p.CONTINENT || '' });

  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of polys) {
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    shapes.push({ idx, rings, minX, maxX, minY, maxY });
  }
}

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryAt(lon, lat) {
  for (const s of shapes) {
    if (lon < s.minX || lon > s.maxX || lat < s.minY || lat > s.maxY) continue;
    if (!inRing(s.rings[0], lon, lat)) continue;
    let hole = false;
    for (let h = 1; h < s.rings.length; h++) {
      if (inRing(s.rings[h], lon, lat)) { hole = true; break; }
    }
    if (!hole) return s.idx;
  }
  return 0;
}

const cells = new Uint8Array(COLS * ROWS);
let land = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    // Mehrfach abtasten: kleine Inselstaaten (Mauritius, Sao Tome) fallen
    // sonst durch das Raster - und die sind fuer uns Programmstandorte.
    const votes = new Map();
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const lon = -180 + ((c + (sx + 0.5) / SUB) / COLS) * 360;
        const lat = LAT_TOP - ((r + (sy + 0.5) / SUB) / ROWS) * (LAT_TOP - LAT_BOTTOM);
        const id = countryAt(lon, lat);
        if (id) votes.set(id, (votes.get(id) || 0) + 1);
      }
    }
    if (!votes.size) continue;
    // Das Land mit den meisten Treffern gewinnt die Zelle.
    let bestId = 0, bestN = 0;
    for (const [id, n] of votes) if (n > bestN) { bestN = n; bestId = id; }
    cells[r * COLS + c] = bestId;
    land++;
  }
}

// --- Kleinstaaten retten -------------------------------------------------
// Bei dieser Rasterweite verschwinden Laender unter ~50.000 km2 komplett -
// darunter Nordmazedonien, Gambia, Mauritius und Sao Tome, wo wir aktiv sind.
// Jedes Land bekommt daher mindestens eine Zelle: die mit dem hoechsten
// Trefferanteil. Ueberschrieben wird nur, wenn das bisherige Land dort noch
// andere Zellen behaelt.
const cellCount = new Map();
for (const v of cells) if (v) cellCount.set(v, (cellCount.get(v) || 0) + 1);

let rescued = 0;
for (let idx = 1; idx <= countries.length; idx++) {
  if (cellCount.get(idx)) continue;
  const mine = shapes.filter((s) => s.idx === idx);
  if (!mine.length) continue;

  let best = null;
  for (const s of mine) {
    const c0 = Math.max(0, Math.floor(((s.minX + 180) / 360) * COLS));
    const c1 = Math.min(COLS - 1, Math.ceil(((s.maxX + 180) / 360) * COLS));
    const r0 = Math.max(0, Math.floor(((LAT_TOP - s.maxY) / (LAT_TOP - LAT_BOTTOM)) * ROWS));
    const r1 = Math.min(ROWS - 1, Math.ceil(((LAT_TOP - s.minY) / (LAT_TOP - LAT_BOTTOM)) * ROWS));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        // Feiner abtasten als im Hauptdurchlauf: Inselstaaten sind kleiner
        // als ein Neuntel einer Zelle und werden von SUB=3 einfach verfehlt.
        let hits = 0;
        for (let sy = 0; sy < FINE; sy++) {
          for (let sx = 0; sx < FINE; sx++) {
            const lon = -180 + ((c + (sx + 0.5) / FINE) / COLS) * 360;
            const lat = LAT_TOP - ((r + (sy + 0.5) / FINE) / ROWS) * (LAT_TOP - LAT_BOTTOM);
            if (countryAt(lon, lat) === idx) hits++;
          }
        }
        if (!hits) continue;
        const occupant = cells[r * COLS + c];
        if (occupant && (cellCount.get(occupant) || 0) <= 1) continue;
        // Freie Wasserzellen bevorzugen, damit eine Insel kein Nachbarland
        // verdraengt; erst danach zaehlt die Trefferzahl.
        const rank = (o, h) => (o ? 0 : 1000) + h;
        if (!best || rank(occupant, hits) > rank(best.occupant, best.hits)) {
          best = { r, c, hits, occupant };
        }
      }
    }
  }

  if (!best) {
    console.warn(`  ! ${countries[idx - 1].name} passt in kein Raster-Feld`);
    continue;
  }
  cells[best.r * COLS + best.c] = idx;
  if (best.occupant) cellCount.set(best.occupant, cellCount.get(best.occupant) - 1);
  cellCount.set(idx, 1);
  rescued++;
}
console.log(`Kleinstaaten mit Garantiezelle: ${rescued}`);

const b64 = Buffer.from(cells).toString('base64');

writeFileSync(
  new URL('../src/landmask.js', import.meta.url),
  `// AUTOGENERIERT von tools/build-landmask.mjs - nicht per Hand aendern.\n` +
    `// Quelle: Natural Earth 110m admin_0_countries (public domain).\n` +
    `// cells: ein Byte je Rasterzelle, 0 = Wasser, sonst Index+1 in COUNTRIES.\n` +
    `export const LANDMASK = {\n` +
    `  cols: ${COLS},\n  rows: ${ROWS},\n  latTop: ${LAT_TOP},\n  latBottom: ${LAT_BOTTOM},\n` +
    `  cells: "${b64}",\n};\n\n` +
    `export const COUNTRIES = ${JSON.stringify(countries)};\n`
);

console.log(`Raster ${COLS}x${ROWS} = ${COLS * ROWS} Zellen, davon ${land} Land (${((land / (COLS * ROWS)) * 100).toFixed(1)}%)`);
console.log(`Laender: ${countries.length} | base64: ${(b64.length / 1024).toFixed(1)} KB`);
