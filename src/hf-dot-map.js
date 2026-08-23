import { LANDMASK, COUNTRIES } from './landmask.js';
import { ICONS } from './icons.js';

/* ================================================================== *
 * Design-Tokens
 * ================================================================== */

/**
 * Grundraster (Laender ohne Programm). Reines Grau - nie eine Datenfarbe,
 * damit "hier sind wir nicht" und "hier sind wir wenig" nicht verwechselbar
 * sind. Stufe 0 ist Ruhe, die oberen Stufen entstehen unter dem Cursor.
 */
const IDLE_RAMP = ['#dde4ec', '#c6d1dd', '#adbccd', '#95a8bd'];

/**
 * Sequenzielle Rampe fuer die Reichweite - ein Hue (HF-Blau), streng monoton
 * dunkler. Die oberste Gruppe kippt bewusst auf Gold: das sind die
 * Schwerpunktregionen, in der Legende als eigene Stufe ausgewiesen.
 */
const DATA_RAMP = ['#a8d0ee', '#7ab7e4', '#4a9bd8', '#1c7cc0', '#0a5f9e', '#064a7d'];
const ACCENT_RAMP = ['#f5b942', '#e8951c'];
const ACCENT_FROM = 0.9;          // ab dieser Intensitaet gilt die Akzentfarbe

const LEVELS = 26;                // Quantisierung -> Sprite-Stufen

/**
 * Punktgroessen in Rasterabstaenden. Die Groesse variiert absichtlich nur
 * leicht - die Aussage tragen Farbe und Helligkeit. Groessere Punkte wirken
 * schnell unproportional, und ab 0.5 beruehren sie ihre Nachbarn.
 */
const DOT_MIN = 0.30;             // Radius im Grundzustand
const DOT_MAX = 0.40;             // Radius am heissesten Punkt
const DOT_BOOST = 0.48;           // Radius unter dem Cursor (< 0.5 = kein Kontakt)
const AURA_RADIUS = 108;          // Reichweite des Cursor-Spotlights in px
const AURA_LIFT = 0.92;           // Spitzenstufe der Aura (1 = volle Rampe)
const AURA_EASE = 11;             // Traegheit: wie schnell die Aura nachzieht (1/s)
const AURA_FADE = 4.5;            // Ein- und Ausblenden der Aura (1/s)

/**
 * Intro: die Punkte fallen von oben ein, ein Kontinent nach dem anderen.
 * Reihenfolge von West nach Ost, damit es wie ein Lauf ueber die Karte wirkt
 * und nicht wie Springen. Was hier nicht steht (Antarktis, Inselreste), faellt
 * zuletzt.
 */
const CONTINENT_ORDER = [
  'North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania',
];
const INTRO_CONTINENT_GAP = 180;  // ms Versatz zwischen zwei Kontinenten
const INTRO_SPREAD = 250;         // ms Streuung innerhalb eines Kontinents
const INTRO_FALL_MS = 470;        // Falldauer eines einzelnen Punkts
const INTRO_FALL_DIST = 26;       // px Fallhoehe
const INTRO_ALPHA_STEPS = 12;     // Alpha quantisieren: weniger Canvas-State-Wechsel

/**
 * Hover-Zoom: die Karte fahrt sanft an den Cursor heran. Der Punkt unter dem
 * Cursor bleibt dabei stehen (Anker-Zoom) - sonst rutscht das Land unter der
 * Maus weg, waehrend man es anschaut.
 *
 * Der Zoom laeuft ueber eine Feder statt ueber eine Rampe: das ergibt einen
 * leichten Ueberschwinger beim Heranfahren, was sich wie eine Kamera anfuehlt.
 * ZOOM_STIFF/ZOOM_DAMP ergeben eine Fahrt von rund einer halben Sekunde mit
 * etwa 5 % Ueberschwinger.
 */
const ZOOM_MAX = 1.34;
const ZOOM_STIFF = 70;            // Federkonstante (1/s^2)
const ZOOM_DAMP = 11.5;           // Daempfung (1/s) - unterdaempft, ca. 5 % Ueberschwinger
const ZOOM_ANCHOR_EASE = 3.6;     // Traegheit des Ankers - bewusst langsam

/* ================================================================== *
 * Hilfsfunktionen
 * ================================================================== */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (v) => v * v * (3 - 2 * v);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Farbe aus einer Stopliste an Position t (gleichmaessig verteilte Stops). */
function rampAt(stops, t) {
  t = clamp01(t);
  const seg = (stops.length - 1) * t;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  return mixRgb(hexToRgb(stops[i]), hexToRgb(stops[i + 1]), seg - i);
}

function decodeCells({ cells }) {
  const bin = atob(cells);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const fmt = (n) => n.toLocaleString('de-DE');

/* ================================================================== *
 * Die Karte
 * ================================================================== */

export class HFDotMap {
  constructor(root, data, opts = {}) {
    this.root = root;
    this.data = data;
    // minHeight: Unter dieser Hoehe ist eine Weltkarte nicht mehr lesbar.
    // Statt weiter zu schrumpfen laeuft sie seitlich ueber und wird auf
    // focusLon zentriert - auf dem Handy sieht man zuerst den Schwerpunkt.
    this.opts = { maxHeight: 620, minHeight: 250, focusLon: 25, ...opts };

    this.cells = decodeCells(LANDMASK);
    this.programs = new Map(data.programs.map((p) => [p.id, p]));

    // Standorte nach Land, damit der Cursor jedes Land sofort zuordnen kann.
    this.byIso = new Map(data.locations.map((l) => [l.iso, l]));
    this.isoOfCountry = COUNTRIES.map((c) => c.iso);

    this.activeProgram = null;   // fixierter Filter
    this.hoverProgram = null;    // Programm unter dem Cursor (Bubble)
    this.cursor = null;       // Bildschirmkoordinaten
    this.cursorWorld = null;  // ... in Kartenkoordinaten umgerechnet
    this.zoom = 1;
    this.zoomVel = 0;
    this.zoomTarget = 1;
    this.anchor = null;       // Fixpunkt des Zooms
    this.auraPos = null;      // zieht dem Cursor traege nach
    this.auraStrength = 0;    // blendet ein und aus
    this.lastFrame = 0;
    this.hoverCell = -1;
    this.introStart = null;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Auf Touch gibt es kein Verlassen der Flaeche - der Zoom bliebe nach dem
    // Antippen haengen. Dort bleibt die Karte deshalb unzoomt.
    this.canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;

    this._buildDom();
    this._bindEvents();
    this._resize();
  }

  /* ---------------- DOM ---------------- */

  _buildDom() {
    this.root.classList.add('hfmap');
    this.root.innerHTML = `
      <canvas class="hfmap__canvas"></canvas>
      <svg class="hfmap__leaders" aria-hidden="true"></svg>
      <div class="hfmap__bubbles"></div>
      <div class="hfmap__tooltip" role="status" aria-live="polite"></div>
    `;
    this.canvas = this.root.querySelector('.hfmap__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.leaders = this.root.querySelector('.hfmap__leaders');
    this.bubbleLayer = this.root.querySelector('.hfmap__bubbles');
    this.tooltip = this.root.querySelector('.hfmap__tooltip');
    this.canvas.setAttribute('role', 'img');
  }

  _bindEvents() {
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(this.root);

    // pointerdown mitnehmen: auf dem Touchscreen gibt es kein Bewegen vor
    // dem Antippen, sonst bliebe die Karte dort stumm.
    const track = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.cursorWorld = this._toWorld(this.cursor);
      if (!this.anchor) this.anchor = { ...this.cursor };
      this._armZoom();
      this._updateHover();
    };
    this.canvas.addEventListener('pointerenter', track);
    this.canvas.addEventListener('pointermove', track);
    this.canvas.addEventListener('pointerdown', track);
    this.canvas.addEventListener('pointerleave', () => {
      this.cursor = null;
      this.cursorWorld = null;
      this.hoverCell = -1;
      this.zoomTarget = 1;
      this.root.classList.remove('is-zoomed');
      this._hideTip();
    });
    this.canvas.addEventListener('click', () => {
      const iso = this._isoAt(this.cursorWorld);
      const loc = iso && this.byIso.get(iso);
      if (!loc) return;
      const site = this.siteByIso.get(iso);
      this.root.dispatchEvent(new CustomEvent('hfmap:select', {
        detail: { loc, site, programs: this.programs },
      }));
    });
  }

  /**
   * Der Zoom setzt sofort ein, sobald der Zeiger die Karte beruehrt. Eine
   * Anlaufsperre braucht es nicht: die Feder laeuft ohnehin weich an, und wer
   * die Karte nur durchquert, loest damit hoechstens ein sanftes Anheben und
   * Zurueckfedern aus.
   */
  _armZoom() {
    if (!this.canHover || this.reducedMotion || this.zoomTarget === ZOOM_MAX) return;
    this.zoomTarget = ZOOM_MAX;
    this.root.classList.add('is-zoomed');
  }

  /**
   * Feder auf den Zielzoom, Anker zieht dem Cursor traege nach. Beides
   * zeitbasiert. Der Anker folgt bewusst langsam: er ist der Fixpunkt der
   * Kamera, und ein schnell springender Fixpunkt macht die Karte unruhig.
   */
  _updateZoom(dt) {
    if (this.cursor && this.anchor) {
      const k = 1 - Math.exp(-ZOOM_ANCHOR_EASE * dt);
      this.anchor.x += (this.cursor.x - this.anchor.x) * k;
      this.anchor.y += (this.cursor.y - this.anchor.y) * k;
    }

    const dist = this.zoomTarget - this.zoom;
    if (Math.abs(dist) < 0.0004 && Math.abs(this.zoomVel) < 0.0015) {
      this.zoom = this.zoomTarget;
      this.zoomVel = 0;
      if (this.zoom === 1) this.anchor = this.cursor ? { ...this.cursor } : null;
      return;
    }
    this.zoomVel += (dist * ZOOM_STIFF - this.zoomVel * ZOOM_DAMP) * dt;
    this.zoom += this.zoomVel * dt;
    // Der Ueberschwinger darf nach oben laufen, aber nie unter 1 rutschen -
    // sonst zieht sich die Karte beim Verlassen kurz zusammen.
    if (this.zoom < 1) { this.zoom = 1; this.zoomVel = 0; }
    // Der Cursor zeigt nach dem Zoomschritt auf eine andere Kartenstelle.
    this.cursorWorld = this._toWorld(this.cursor);
  }

  /* ---------------- Layout ---------------- */

  _resize() {
    const w = this.root.clientWidth;
    if (!w) return;
    if (this.introStart === null && document.visibilityState === 'hidden') {
      // Die Einblendung nicht im Hintergrund verbrennen.
      document.addEventListener('visibilitychange', () => this._resize(), { once: true });
    }

    const aspect = LANDMASK.cols / LANDMASK.rows;
    const h = Math.max(this.opts.minHeight, Math.min(w / aspect, this.opts.maxHeight));
    const mapW = h * aspect;

    this.w = w;
    this.h = h;
    this.spacing = mapW / LANDMASK.cols;

    if (mapW <= w) {
      this.offsetX = (w - mapW) / 2;
      this.root.classList.remove('is-cropped');
    } else {
      const focusX = ((this.opts.focusLon + 180) / 360) * mapW;
      this.offsetX = Math.max(w - mapW, Math.min(0, w / 2 - focusX));
      this.root.classList.add('is-cropped');
    }


    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.root.style.height = `${h}px`;
    this.leaders.setAttribute('viewBox', `0 0 ${w} ${h}`);

    this._buildGrid();
    this._buildSprites();
    this._recompute();
    this._start();
  }

  /** Rasterpunkte in Bildschirmkoordinaten, plus Index fuer die Cursor-Aura. */
  _buildGrid() {
    const { cols, rows } = LANDMASK;
    const xs = [];
    const ys = [];
    const country = [];
    const cellIdx = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = this.cells[r * cols + c];
        if (!id) continue;
        xs.push(this.offsetX + (c + 0.5) * this.spacing);
        ys.push((r + 0.5) * this.spacing);
        country.push(id);
        cellIdx.push(r * cols + c);
      }
    }

    this.gx = Float32Array.from(xs);
    this.gy = Float32Array.from(ys);
    this.gCountry = Uint8Array.from(country);
    this.gCell = Int32Array.from(cellIdx);
    this.weight = new Float32Array(xs.length);
    this.owner = new Int32Array(xs.length).fill(-1);
    this.accent = new Uint8Array(xs.length);

    // Uniformes Bucket-Gitter: die Aura muss pro Frame nur ihre Nachbarschaft
    // durchlaufen, nicht alle 5.500 Punkte.
    this.bucketSize = Math.max(24, AURA_RADIUS / 2);
    this.bucketCols = Math.ceil(this.w / this.bucketSize) + 1;
    this.buckets = new Map();
    for (let i = 0; i < this.gx.length; i++) {
      const key = this._bucketKey(this.gx[i], this.gy[i]);
      let list = this.buckets.get(key);
      if (!list) this.buckets.set(key, (list = []));
      list.push(i);
    }

    // Zellindex -> Punktindex, fuer die Landzuordnung unter dem Cursor.
    this.pointOfCell = new Map();
    for (let i = 0; i < this.gCell.length; i++) this.pointOfCell.set(this.gCell[i], i);

    this._buildIntroSchedule();
  }

  /**
   * Startzeit je Punkt: erst der Kontinent, dann innerhalb des Kontinents
   * leicht diagonal gestaffelt. Die Punkte werden nach dieser Zeit sortiert -
   * dadurch laeuft die Zeichenschleife des Intros in Alpha-Reihenfolge und
   * braucht nur eine Handvoll Canvas-State-Wechsel statt tausender.
   */
  _buildIntroSchedule() {
    const n = this.gx.length;
    const delay = new Float32Array(n);
    const group = new Int8Array(n);
    const lastGroup = CONTINENT_ORDER.length;

    // Ausdehnung je Kontinent bestimmen. Die Staffelung innerhalb einer Gruppe
    // muss relativ zu ihrer eigenen Ausdehnung laufen - sonst erscheint
    // Nordamerika (links oben) fast auf einmal und Ozeanien haengt hinterher.
    const box = [];
    for (let i = 0; i < n; i++) {
      const country = COUNTRIES[this.gCountry[i] - 1];
      const g = country ? CONTINENT_ORDER.indexOf(country.continent) : -1;
      const gi = g < 0 ? lastGroup : g;
      group[i] = gi;
      const b = box[gi] || (box[gi] = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
      if (this.gx[i] < b.x0) b.x0 = this.gx[i];
      if (this.gx[i] > b.x1) b.x1 = this.gx[i];
      if (this.gy[i] < b.y0) b.y0 = this.gy[i];
      if (this.gy[i] > b.y1) b.y1 = this.gy[i];
    }

    for (let i = 0; i < n; i++) {
      const b = box[group[i]];
      const fx = b.x1 > b.x0 ? (this.gx[i] - b.x0) / (b.x1 - b.x0) : 0;
      const fy = b.y1 > b.y0 ? (this.gy[i] - b.y0) / (b.y1 - b.y0) : 0;
      // Diagonal von oben links nach unten rechts, das Gewicht liegt auf y -
      // passend dazu, dass die Punkte von oben einfallen.
      const diag = fx * 0.4 + fy * 0.6;
      delay[i] = group[i] * INTRO_CONTINENT_GAP + diag * INTRO_SPREAD;
    }

    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => delay[a] - delay[b]);

    this.introDelay = delay;
    this.introOrder = Int32Array.from(order);
    this.introTotal = (n ? delay[order[n - 1]] : 0) + INTRO_FALL_MS;
  }

  /** Bildschirm- in Kartenkoordinaten, unter Beruecksichtigung des Zooms. */
  _toWorld(pt) {
    if (!pt) return null;
    if (this.zoom === 1 || !this.anchor) return { x: pt.x, y: pt.y };
    return {
      x: (pt.x - this.anchor.x) / this.zoom + this.anchor.x,
      y: (pt.y - this.anchor.y) / this.zoom + this.anchor.y,
    };
  }

  _bucketKey(x, y) {
    return Math.floor(y / this.bucketSize) * this.bucketCols + Math.floor(x / this.bucketSize);
  }

  /* ---------------- Sprites ---------------- */

  _buildSprites() {
    this.spriteCache = new Map();
    this.idleSet = this._makeSet('idle');
    this._bakeBase();
  }

  _sprite(level, rgb, glowScale, boost) {
    const t = level / (LEVELS - 1);
    const rMax = boost ? DOT_BOOST : DOT_MAX;
    // Untergrenze in echten Pixeln: auf schmalen Viewports faellt der Radius
    // sonst unter ein Pixel und die Punkte verwaschen.
    const r = Math.max(0.85, this.spacing * (DOT_MIN + (rMax - DOT_MIN) * t));
    const glow = glowScale && t > 0.5 ? r * (t - 0.5) * glowScale : 0;
    const size = Math.ceil((r + glow) * 2 + 2);
    const cv = document.createElement('canvas');
    // Mit Zoom-Reserve rendern: der Canvas-Transform skaliert die Sprites beim
    // Zeichnen, und in dieser Auflösung bleiben sie bis ZOOM_MAX scharf.
    const res = this.dpr * ZOOM_MAX;
    cv.width = cv.height = Math.max(2, Math.ceil(size * res));
    const c = cv.getContext('2d');
    c.scale(res, res);
    const mid = size / 2;
    if (glow > 0) {
      c.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.45 * t})`;
      c.shadowBlur = glow * this.dpr * ZOOM_MAX;
    }
    c.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    c.beginPath();
    c.arc(mid, mid, r, 0, Math.PI * 2);
    c.fill();
    return { cv, half: size / 2, size };
  }

  /**
   * Ein Sprite-Satz je Farbmodus: 'idle' (Grau, Cursor-Aura), 'data'
   * (Blau-Rampe + Goldakzent) oder eine Programmfarbe als Hex.
   */
  _makeSet(key, boost) {
    const cacheKey = boost ? `${key}#boost` : key;
    if (this.spriteCache.has(cacheKey)) return this.spriteCache.get(cacheKey);
    const set = [];
    for (let l = 0; l < LEVELS; l++) {
      const t = l / (LEVELS - 1);
      let rgb;
      let glow = 0;
      if (key === 'idle') {
        rgb = rampAt(IDLE_RAMP, t);
      } else if (key === 'data') {
        rgb = rampAt(DATA_RAMP, t);
        glow = 2.2;
      } else if (key === 'accent') {
        rgb = rampAt(ACCENT_RAMP, t);
        glow = 4.6;
      } else {
        // Programmmodus: von hell nach satt in der Programmfarbe.
        rgb = mixRgb(hexToRgb('#dbe6f0'), hexToRgb(key), clamp01(0.2 + t * 0.95));
        glow = 2.4;
      }
      set.push(this._sprite(l, rgb, glow, boost));
    }
    this.spriteCache.set(cacheKey, set);
    return set;
  }

  /** Grundraster einmal backen - pro Frame ist es dann ein einziger Blit. */
  _bakeBase() {
    const cv = document.createElement('canvas');
    cv.width = Math.round(this.w * this.dpr);
    cv.height = Math.round(this.h * this.dpr);
    const c = cv.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sp = this.idleSet[0];
    for (let i = 0; i < this.gx.length; i++) {
      c.drawImage(sp.cv, 0, 0, sp.cv.width, sp.cv.height,
        this.gx[i] - sp.half, this.gy[i] - sp.half, sp.size, sp.size);
    }
    this.baseCanvas = cv;
  }

  /* ---------------- Daten -> Gewichte ---------------- */

  /** Sichtbare Standorte und ihre Kennzahlen fuer den aktuellen Filter. */
  _visibleSites() {
    const filter = this.activeProgram;
    const sites = [];
    for (const loc of this.data.locations) {
      const acts = filter ? loc.activities.filter((a) => a.program === filter) : loc.activities;
      if (!acts.length) continue;
      const beneficiaries = acts.reduce((s, a) => s + a.beneficiaries, 0);
      const projects = acts.reduce((s, a) => s + (a.projects || 0), 0);
      const top = acts.reduce((m, a) => (a.beneficiaries > m.beneficiaries ? a : m), acts[0]);
      sites.push({ loc, acts, beneficiaries, projects, topProgram: top.program });
    }
    return sites;
  }

  _recompute() {
    this.sites = this._visibleSites();
    this.siteByIso = new Map(this.sites.map((s) => [s.loc.iso, s]));

    const values = this.sites.map((s) => s.beneficiaries);
    const lo = Math.log(Math.min(...values) + 1);
    const hi = Math.log(Math.max(...values) + 1);
    const span = hi - lo || 1;

    // Logarithmisch: sonst frisst Pakistan die Karte und Mauritius verschwindet.
    for (const s of this.sites) {
      s.t = (Math.log(s.beneficiaries + 1) - lo) / span;
      s.pos = this._focusPoint(s.loc);
      s.phase = ((s.loc.iso.charCodeAt(0) * 31 + s.loc.iso.charCodeAt(1) * 7) % 100) / 100 * Math.PI * 2;
    }

    this._buildWeights();
    this._buildBubbles();
    this.emitChange();
  }

  /** Kernpunkt eines Standorts: lat/lon aus den Daten, auf das Raster gerundet. */
  _focusPoint(loc) {
    const { cols, rows, latTop, latBottom } = LANDMASK;
    const c = Math.max(0, Math.min(cols - 1, Math.round(((loc.lon + 180) / 360) * cols - 0.5)));
    const r = Math.max(0, Math.min(rows - 1, Math.round(((latTop - loc.lat) / (latTop - latBottom)) * rows - 0.5)));
    return {
      x: this.offsetX + (c + 0.5) * this.spacing,
      y: (r + 0.5) * this.spacing,
    };
  }

  /**
   * Zwei Ebenen: das ganze Land bekommt eine Grundintensitaet nach Reichweite
   * (praezise Flaeche), darueber ein radialer Kern um den Schwerpunkt (der
   * sichtbare Hotspot, der auch ueber Grenzen strahlt).
   */
  _buildWeights() {
    this.weight.fill(0);
    this.owner.fill(-1);

    const idxOfIso = new Map();
    this.sites.forEach((s, i) => idxOfIso.set(s.loc.iso, i));

    // 1) Flaechenfuellung je Land
    for (let i = 0; i < this.gCountry.length; i++) {
      const iso = this.isoOfCountry[this.gCountry[i] - 1];
      const si = idxOfIso.get(iso);
      if (si === undefined) continue;
      this.weight[i] = 0.09 + 0.24 * this.sites[si].t;
      this.owner[i] = si;
    }

    // 2) Radialer Kern je Standort
    const unit = this.spacing;
    for (let si = 0; si < this.sites.length; si++) {
      const s = this.sites[si];
      // Bewusst nichtlinear: Radius quadratisch, Intensitaet kubisch. Sonst
      // gluehen mittlere Standorte wie Schwerpunkte und die Karte wird eine
      // blaue Flaeche statt einer Aussage.
      s.radius = unit * (1.6 + 7.0 * s.t * s.t);
      const peak = 0.20 + 0.74 * Math.pow(s.t, 2.2);
      const r2 = s.radius * s.radius;
      for (let i = 0; i < this.gx.length; i++) {
        const dx = this.gx[i] - s.pos.x;
        if (dx > s.radius || dx < -s.radius) continue;
        const dy = this.gy[i] - s.pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const add = smoothstep(1 - Math.sqrt(d2) / s.radius) * peak;
        if (add <= 0.004) continue;
        this.weight[i] = Math.min(1, this.weight[i] + add);
        if (this.owner[i] === -1) this.owner[i] = si;
      }
    }

    // Schwerpunkte einmal festlegen. Ab hier aendert das Atmen nur noch die
    // Helligkeit innerhalb einer Rampe, nie die Rampe selbst.
    const active = [];
    for (let i = 0; i < this.weight.length; i++) {
      this.accent[i] = this.weight[i] >= ACCENT_FROM ? 1 : 0;
      if (this.weight[i] > 0.004) active.push(i);
    }
    this.active = Int32Array.from(active);
  }

  /* ---------------- Programm-Bubbles ---------------- */

  /**
   * Alle acht Programme sind von Anfang an sichtbar: je ein Icon-Kreis am
   * Kartenrand (dort ist Ozean), verbunden mit seinem groessten Standort.
   */
  _buildBubbles() {
    // Der Kranz bleibt immer vollstaendig: nur so ist im Filtermodus sichtbar,
    // dass es sieben weitere Programme gibt und wie man zurueckkommt.
    this._renderBubbles(this.data.programs);
  }

  _renderBubbles(programs) {
    const all = this._visibleSitesFor(programs);
    const wide = this.w >= 900;
    const items = programs.map((p) => ({ prog: p, target: all.get(p.id) }));

    // Ziele links der Kartenmitte haengen an der linken Randspalte, alle
    // anderen rechts - so kreuzen sich die Verbindungslinien nicht.
    const left = [];
    const right = [];
    for (const it of items) {
      const x = it.target ? it.target.pos.x : this.w / 2;
      (x < this.w * 0.46 ? left : right).push(it);
    }
    // Grosse Spalten ausgleichen, damit nicht alle acht an einer Kante kleben.
    while (left.length > right.length + 1) right.unshift(left.pop());
    while (right.length > left.length + 3) left.push(right.shift());

    const place = (list, side) => {
      list.sort((a, b) => (a.target?.pos.y ?? 0) - (b.target?.pos.y ?? 0));
      const n = list.length || 1;
      const pad = 30;
      const usable = this.h - pad * 2;
      list.forEach((it, i) => {
        it.side = side;
        it.bx = side === 'left' ? pad : this.w - pad;
        it.by = pad + (usable * (i + 0.5)) / n;
      });
    };
    place(left, 'left');
    place(right, 'right');

    this.bubbleLayer.innerHTML = '';
    this.leaders.innerHTML = '';

    for (const it of [...left, ...right]) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hfmap__bubble';
      if (this.activeProgram && this.activeProgram !== it.prog.id) el.classList.add('is-dimmed');
      el.dataset.program = it.prog.id;
      el.dataset.side = it.side;
      el.style.left = `${it.bx}px`;
      el.style.top = `${it.by}px`;
      el.style.setProperty('--bubble-color', it.prog.color);
      el.setAttribute('aria-pressed', String(this.activeProgram === it.prog.id));
      const reach = it.target ? `${fmt(it.target.beneficiaries)} Menschen` : 'keine Daten';
      // Der sichtbare Text wird auf schmalen Viewports ausgeblendet - ohne
      // aria-label waere das Programm dort auch fuer Screenreader weg.
      el.setAttribute(
        'aria-label',
        it.target
          ? `${it.prog.name}: Schwerpunkt ${it.target.loc.name}, ${reach}`
          : it.prog.name
      );
      el.innerHTML = `
        <span class="hfmap__bubble-icon">${ICONS[it.prog.icon] || ICONS.hands}</span>
        <span class="hfmap__bubble-text">
          <b>${it.prog.name}</b>
          <i>${it.target ? `${it.target.loc.name} &middot; ${reach}` : reach}</i>
        </span>`;

      el.addEventListener('pointerenter', () => this._setHoverProgram(it.prog.id));
      el.addEventListener('focus', () => this._setHoverProgram(it.prog.id));
      el.addEventListener('pointerleave', () => this._setHoverProgram(null));
      el.addEventListener('blur', () => this._setHoverProgram(null));
      el.addEventListener('click', () => {
        this.root.dispatchEvent(new CustomEvent('hfmap:program', { detail: it.prog.id }));
      });
      this.bubbleLayer.appendChild(el);

      // Fuehrungslinien nur fuer sichtbare Programme - sonst zeigt eine Linie
      // auf ein Land, das gerade grau ist.
      if (!it.target || !wide) continue;
      if (this.activeProgram && it.prog.id !== this.activeProgram) continue;
      // Gestrichelte Fuehrungslinie vom Kreis zum Schwerpunkt des Programms.
      const gap = it.side === 'left' ? 20 : -20;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const x1 = it.bx + gap;
      const y1 = it.by;
      const x2 = it.target.pos.x;
      const y2 = it.target.pos.y;
      const midX = x1 + (x2 - x1) * 0.55;
      path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', 'hfmap__leader');
      path.dataset.program = it.prog.id;
      path.style.stroke = it.prog.color;
      this.leaders.appendChild(path);
    }
  }

  /** Groesster Standort je Programm. */
  _visibleSitesFor(programs) {
    const out = new Map();
    for (const p of programs) {
      let best = null;
      for (const loc of this.data.locations) {
        const act = loc.activities.find((a) => a.program === p.id);
        if (!act) continue;
        if (!best || act.beneficiaries > best.beneficiaries) {
          best = { loc, beneficiaries: act.beneficiaries, projects: act.projects || 0 };
        }
      }
      if (best) out.set(p.id, { ...best, pos: this._focusPoint(best.loc) });
    }
    return out;
  }

  _setHoverProgram(id) {
    if (this.hoverProgram === id) return;
    this.hoverProgram = id;
    this.root.classList.toggle('is-program-hover', Boolean(id));
    for (const el of this.root.querySelectorAll('.hfmap__bubble, .hfmap__leader')) {
      el.classList.toggle('is-dimmed', Boolean(id) && el.dataset.program !== id);
      el.classList.toggle('is-lifted', el.dataset.program === id);
    }
  }

  /* ---------------- Cursor: Land bestimmen ---------------- */

  /** Erwartet Kartenkoordinaten (siehe _toWorld). */
  _isoAt(pt) {
    if (!pt) return null;
    const { cols, rows } = LANDMASK;
    const c = Math.floor((pt.x - this.offsetX) / this.spacing);
    const r = Math.floor(pt.y / this.spacing);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return null;
    const id = this.cells[r * cols + c];
    return id ? this.isoOfCountry[id - 1] : null;
  }

  _updateHover() {
    const world = this.cursorWorld;
    if (!world) return;
    const { cols } = LANDMASK;
    const c = Math.floor((world.x - this.offsetX) / this.spacing);
    const r = Math.floor(world.y / this.spacing);
    const cell = r * cols + c;
    if (cell === this.hoverCell) {
      if (this.tooltip.classList.contains('is-visible')) this._placeTip();
      return;
    }
    this.hoverCell = cell;

    const iso = this._isoAt(world);
    if (!iso) {
      this._hideTip();
      return;
    }
    const country = COUNTRIES[this.cells[cell] - 1];
    const site = this.siteByIso.get(iso);
    const loc = this.byIso.get(iso);

    this.tipIso = iso;
    const hasPhoto = Boolean(loc && loc.photos && loc.photos.length);
    const photoSlot = hasPhoto ? '<span class="hfmap__tip-photo"></span>' : '';

    if (site) {
      const rows = site.acts
        .slice()
        .sort((a, b) => b.beneficiaries - a.beneficiaries)
        .map((a) => {
          const p = this.programs.get(a.program);
          return `<li><i style="background:${p.color}"></i><span>${p.name}</span>
            <b>${fmt(a.beneficiaries)}</b></li>`;
        })
        .join('');
      this._showTip(`${photoSlot}
        <h4>${loc.name}</h4>
        <p class="hfmap__tip-total">${fmt(site.beneficiaries)} Menschen erreicht
          <span>&middot; ${site.projects} Projekte</span></p>
        <ul>${rows}</ul>
        ${hasPhoto ? '<p class="hfmap__tip-more">Klicken fuer Fotos und Details</p>' : ''}`);
    } else if (loc) {
      // Standort existiert, passt aber nicht zum aktiven Programmfilter.
      const names = loc.activities.map((a) => this.programs.get(a.program).name).join(', ');
      this._showTip(`${photoSlot}
        <h4>${loc.name}</h4>
        <p class="hfmap__tip-muted">In diesem Programm nicht aktiv.<br>Vor Ort: ${names}</p>`);
    } else {
      this._showTip(`
        <h4>${country.name}</h4>
        <p class="hfmap__tip-muted">Hier sind wir bisher nicht aktiv.</p>`);
    }
    this.canvas.style.cursor = loc ? 'pointer' : 'default';
    if (hasPhoto) this._loadTipPhoto(loc);
  }

  /**
   * Laedt das Foto fuer die Hover-Karte nach. Erst nach kurzer Verzoegerung:
   * beim schnellen Ueberfahren der Karte soll nichts aus dem Netz gezogen
   * werden. Ist es da, wird es in die offene Karte eingesetzt - bleibt der
   * Cursor nicht lange genug, passiert einfach nichts.
   */
  _loadTipPhoto(loc) {
    clearTimeout(this.photoTimer);
    const photo = loc && loc.photos && loc.photos.length ? loc.photos[0] : null;
    if (!photo) return;
    const iso = loc.iso;

    this.photoTimer = setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        if (this.tipIso !== iso) return;   // Cursor ist weitergezogen
        const slot = this.tooltip.querySelector('.hfmap__tip-photo');
        if (!slot) return;
        slot.style.backgroundImage = `url("${photo.src}")`;
        slot.classList.add('is-loaded');
      };
      img.src = photo.src;
    }, 140);
  }

  _showTip(html) {
    this.tooltip.innerHTML = html;
    this.tooltip.classList.add('is-visible');
    this._placeTip();
  }

  _placeTip() {
    if (!this.cursor) return;
    this.tooltip.style.left = `${this.cursor.x}px`;
    this.tooltip.style.top = `${this.cursor.y}px`;
    this.tooltip.dataset.flipX = this.cursor.x > this.w * 0.62 ? '1' : '0';
    this.tooltip.dataset.flipY = this.cursor.y > this.h * 0.6 ? '1' : '0';
  }

  _hideTip() {
    clearTimeout(this.photoTimer);
    this.tipIso = null;
    this.tooltip.classList.remove('is-visible');
    this.canvas.style.cursor = 'default';
  }

  /* ---------------- Filter ---------------- */

  setProgram(id) {
    this.activeProgram = this.activeProgram === id ? null : id;
    this.hoverCell = -1;
    this._recompute();
    return this.activeProgram;
  }

  stats() {
    return {
      program: this.activeProgram,
      beneficiaries: this.sites.reduce((s, x) => s + x.beneficiaries, 0),
      projects: this.sites.reduce((s, x) => s + x.projects, 0),
      countries: this.sites.length,
    };
  }

  /**
   * Loest 'hfmap:change' aus. Oeffentlich, weil der erste Aufruf noch im
   * Konstruktor passiert - die Seite muss ihn nach dem Registrieren ihrer
   * Listener einmal selbst nachziehen koennen.
   */
  emitChange() {
    if (!this.sites) return;
    this.root.dispatchEvent(new CustomEvent('hfmap:change', { detail: this.stats() }));
  }

  /* ---------------- Render-Loop ---------------- */

  _start() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.introStart === null) {
      this.introStart = this.reducedMotion ? -Infinity : performance.now();
    }
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this._draw(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  _draw(now) {
    // Die Karte kann unsichtbar initialisiert werden (Tab, Akkordeon,
    // Lazy-Hero). Dann gibt es noch kein Raster - der ResizeObserver holt das nach.
    if (!this.baseCanvas) return;

    const ctx = this.ctx;
    // Nach unten UND oben begrenzen: ein negativer oder sehr grosser
    // Zeitschritt (Frame-Sprung, Tabwechsel) laesst die Zoom-Feder sonst
    // aufschwingen statt einzuschwingen.
    const dt = this.lastFrame
      ? Math.max(0, Math.min(0.05, (now - this.lastFrame) / 1000))
      : 0.016;
    this.lastFrame = now;

    const elapsed = this.reducedMotion ? Infinity : now - this.introStart;

    this._updateZoom(dt);
    const z = this.zoom;
    const view = this._viewBounds();

    // Transform einmal setzen: ab hier zeichnet alles in Kartenkoordinaten,
    // der Anker bleibt beim Zoom auf derselben Bildschirmposition stehen.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (z !== 1 && this.anchor) {
      ctx.translate(this.anchor.x, this.anchor.y);
      ctx.scale(z, z);
      ctx.translate(-this.anchor.x, -this.anchor.y);
    }

    /* --- Grundraster: faellt beim Laden Kontinent fuer Kontinent ein --- */
    const introDone = elapsed >= this.introTotal;
    if (!introDone) {
      this._drawFallingGrid(elapsed);
    } else if (z === 1) {
      ctx.drawImage(this.baseCanvas, 0, 0, this.w, this.h);
    } else {
      // Im Zoom das gebackene Bild nicht hochskalieren - es wuerde verwaschen.
      // Live gezeichnet bleibt es scharf, und ausserhalb des Bildes liegende
      // Punkte fallen ueber die Sichtgrenzen weg.
      this._drawGridLive(view);
    }

    /* --- Cursor-Aura --- */
    const auraTouched = this._updateAura(dt);

    /* --- Datenpunkte: erwachen, sobald das Raster steht --- */
    const impact = this.reducedMotion
      ? 1
      : clamp01((elapsed - this.introTotal + 260) / 760);
    if (impact <= 0) return;

    const highlight = this.hoverProgram;
    const key = this.activeProgram
      ? this.programs.get(this.activeProgram).color
      : highlight
        ? this.programs.get(highlight).color
        : 'data';
    const plain = this._makeSet(key);
    const plainAccent = this.activeProgram || highlight ? plain : this._makeSet('accent');
    // Die vergroesserten Saetze nur anlegen, wenn wirklich eine Aura leuchtet.
    const boost = auraTouched && this._makeSet(key, true);
    const boostAccent = auraTouched
      ? (this.activeProgram || highlight ? boost : this._makeSet('accent', true))
      : null;

    const t = now / 1000;
    ctx.globalAlpha = impact;

    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k];
      if (view) {
        const x = this.gx[i];
        if (x < view.x0 || x > view.x1) continue;
        const y = this.gy[i];
        if (y < view.y0 || y > view.y1) continue;
      }
      const site = this.sites[this.owner[i]];
      let w = this.weight[i];

      // Beim Ueberfahren eines Programmsymbols treten die anderen zurueck.
      if (highlight && !this.activeProgram) {
        const has = site && site.acts.some((a) => a.program === highlight);
        w *= has ? 1 : 0.22;
      }
      if (!this.reducedMotion && site) {
        // Sehr langsam: Atmen pro Region (Periode ~18s) und eine flache Welle,
        // die diagonal ueber die Karte laeuft (~11s). Bewusst kaum merklich -
        // die Karte soll leben, nicht blinken.
        const breathe = 0.968 + 0.032 * Math.sin(t * 0.35 + site.phase);
        const wave = 0.982 + 0.018 * Math.sin((this.gx[i] + this.gy[i]) * 0.011 - t * 0.56);
        w *= breathe * wave;
      }

      let lifted = false;
      if (auraTouched) {
        const lift = auraTouched.get(i);
        if (lift) {
          w = Math.min(1, w + lift * 0.2);
          lifted = true;
        }
      }

      const level = Math.min(LEVELS - 1, Math.round(clamp01(w) * (LEVELS - 1)));
      if (level === 0) continue;
      // Die Rampe steht fest, seit die Gewichte berechnet wurden - das Atmen
      // aendert nur die Stufe, nie die Farbfamilie.
      const set = this.accent[i]
        ? (lifted ? boostAccent : plainAccent)
        : (lifted ? boost : plain);
      const sp = set[level];
      ctx.drawImage(sp.cv, 0, 0, sp.cv.width, sp.cv.height,
        this.gx[i] - sp.half, this.gy[i] - sp.half, sp.size, sp.size);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Sichtbarer Kartenbereich beim aktuellen Zoom, mit kleinem Rand. Beim
   * Heranfahren liegt ein guter Teil des Rasters ausserhalb des Bildes - den
   * gar nicht zu zeichnen halbiert die Frame-Zeit.
   */
  _viewBounds() {
    const z = this.zoom;
    if (z === 1 || !this.anchor) return null;
    const a = this.anchor;
    const pad = 24;
    return {
      x0: (0 - a.x) / z + a.x - pad,
      x1: (this.w - a.x) / z + a.x + pad,
      y0: (0 - a.y) / z + a.y - pad,
      y1: (this.h - a.y) / z + a.y + pad,
    };
  }

  /** Grundraster Punkt fuer Punkt - fuer den Zoom, wo das Backing unscharf waere. */
  _drawGridLive(view) {
    const ctx = this.ctx;
    const sp = this.idleSet[0];
    for (let i = 0; i < this.gx.length; i++) {
      const x = this.gx[i];
      if (x < view.x0 || x > view.x1) continue;
      const y = this.gy[i];
      if (y < view.y0 || y > view.y1) continue;
      ctx.drawImage(sp.cv, 0, 0, sp.cv.width, sp.cv.height,
        x - sp.half, y - sp.half, sp.size, sp.size);
    }
  }

  /**
   * Intro-Frame: jeder Punkt faellt aus INTRO_FALL_DIST Hoehe an seinen Platz
   * und blendet dabei ein. Die Schleife laeuft in Startzeit-Reihenfolge und
   * bricht beim ersten Punkt ab, der noch nicht dran ist.
   */
  _drawFallingGrid(elapsed) {
    const ctx = this.ctx;
    const sp = this.idleSet[0];
    let currentAlpha = -1;

    for (let k = 0; k < this.introOrder.length; k++) {
      const i = this.introOrder[k];
      const p = (elapsed - this.introDelay[i]) / INTRO_FALL_MS;
      if (p <= 0) break;   // sortiert: alle weiteren sind erst spaeter fällig

      const e = p >= 1 ? 1 : 1 - Math.pow(1 - p, 3);
      const a = Math.round(e * INTRO_ALPHA_STEPS) / INTRO_ALPHA_STEPS;
      if (a !== currentAlpha) {
        ctx.globalAlpha = a;
        currentAlpha = a;
      }
      const drop = (1 - e) * INTRO_FALL_DIST;
      ctx.drawImage(sp.cv, 0, 0, sp.cv.width, sp.cv.height,
        this.gx[i] - sp.half, this.gy[i] - sp.half - drop, sp.size, sp.size);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Fuehrt die Aura nach: Position zieht dem Cursor traege nach, Staerke
   * blendet ein und aus. Beides zeitbasiert, damit es bei 30 wie bei 120 Hz
   * gleich schnell laeuft.
   *
   * Punkte in Reichweite werden groesser und dunkler - auch dort, wo wir nichts
   * tun. Fuer Punkte ohne Programm nur Graustufen, damit die Aura nie wie ein
   * Datenwert wirkt. Rueckgabe: Auftrieb je Datenpunkt, damit die aktiven
   * Punkte im Hauptdurchlauf mitreagieren.
   */
  _updateAura(dt) {
    // In Kartenkoordinaten, damit die Aura beim Zoom an derselben Stelle der
    // Karte bleibt und nicht am Bildschirm klebt.
    if (this.cursorWorld) {
      if (!this.auraPos) this.auraPos = { ...this.cursorWorld };
      else {
        const k = 1 - Math.exp(-AURA_EASE * dt);
        this.auraPos.x += (this.cursorWorld.x - this.auraPos.x) * k;
        this.auraPos.y += (this.cursorWorld.y - this.auraPos.y) * k;
      }
      this.auraStrength = Math.min(1, this.auraStrength + AURA_FADE * dt);
    } else {
      this.auraStrength = Math.max(0, this.auraStrength - AURA_FADE * dt);
      if (this.auraStrength === 0) this.auraPos = null;
    }
    if (!this.auraPos || this.auraStrength <= 0.01) return null;

    const { x, y } = this.auraPos;
    const strength = smoothstep(this.auraStrength);
    const ctx = this.ctx;
    const idleBoost = this._makeSet('idle', true);
    const touched = new Map();
    const span = Math.ceil(AURA_RADIUS / this.bucketSize);
    const bx = Math.floor(x / this.bucketSize);
    const by = Math.floor(y / this.bucketSize);

    for (let gy = by - span; gy <= by + span; gy++) {
      for (let gx = bx - span; gx <= bx + span; gx++) {
        const list = this.buckets.get(gy * this.bucketCols + gx);
        if (!list) continue;
        for (const i of list) {
          const d = Math.hypot(this.gx[i] - x, this.gy[i] - y);
          if (d > AURA_RADIUS) continue;
          const lift = smoothstep(1 - d / AURA_RADIUS) * strength;
          if (lift < 0.02) continue;
          if (this.weight[i] > 0.004) {
            touched.set(i, lift);
            continue;   // Datenpunkte zeichnet der Hauptdurchlauf
          }
          // Hoch 1.5: der Kern bleibt kraeftig, der Rand laeuft weich aus -
          // eine lineare Kurve saettigt schon auf halber Strecke.
          const level = Math.round(Math.pow(lift, 1.5) * (LEVELS - 1) * AURA_LIFT);
          if (level === 0) continue;
          const sp = idleBoost[level];
          ctx.drawImage(sp.cv, 0, 0, sp.cv.width, sp.cv.height,
            this.gx[i] - sp.half, this.gy[i] - sp.half, sp.size, sp.size);
        }
      }
    }
    return touched;
  }

  destroy() {
    clearTimeout(this.photoTimer);
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }
}
