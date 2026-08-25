# Humanity First - Hero mit Punktraster-Weltkarte

Prototyp fuer den Website-Hero: eine Weltkarte aus Punktzeilen. Wo Humanity First
arbeitet, "erwachen" die Punkte - je mehr Menschen erreicht wurden, desto groesser
und dunkler. Die groessten Schwerpunkte kippen auf Gold.

> **Die Zahlen in diesem Repo sind Platzhalter.** Sie dienen ausschliesslich dazu,
> die Darstellung zu zeigen, und sind **keine** Kennzahlen von Humanity First.
> Belegt sind nur die acht Programme, die elf Laender eigenstaendiger Arbeit von
> Humanity First Deutschland und die in `data/locations.json` mit
> `"verified": true` markierten Eintraege. Alles andere - insbesondere alle
> Angaben zu erreichten Menschen und Projekten - ist erfunden und muss vor einem
> Livegang ersetzt werden.
>
> Die Fotos in `assets/photos` gehoeren Humanity First und stammen von
> humanityfirst.de. Sie liegen hier fuer den Prototypen; fuer jede andere
> Verwendung gelten die Rechte des Urhebers.

## Starten

```bash
node tools/serve.mjs
```

Dann `http://localhost:4321` oeffnen. `http://localhost:4321/icon-test.html` zeigt
alle Programm-Icons gross, klein und invertiert - dafuer gedacht, nachgezeichnete
oder ersetzte Icons zu pruefen, bevor sie in den Hero gehen.

## Wie die Karte funktioniert

**Raster.** `src/landmask.js` ist generiert und enthaelt fuer jede Rasterzelle den
Index des Landes, das dort liegt (0 = Wasser) - 200 x 77 Zellen, rund 20 KB base64.
Damit weiss die Karte zur Laufzeit ohne Netzwerkzugriff, welches Land unter dem
Cursor liegt, auch dort, wo wir nicht aktiv sind. Neu bauen:

```bash
node tools/build-landmask.mjs pfad/zu/ne_50m_admin_0_countries.geojson
```

`COLS=240 node tools/build-landmask.mjs …` macht das Raster feiner (kleinere Punkte),
`COLS=160` groeber. Quelle: [Natural Earth](https://www.naturalearthdata.com/) 50m,
Public Domain. Laender unter etwa 50.000 km2 fallen bei dieser Rasterweite heraus -
der Generator gibt jedem Land deshalb eine Garantiezelle, sonst waeren
Nordmazedonien, Gambia, Mauritius und Sao Tome unsichtbar.

**Zwei Ebenen pro Standort.** Das ganze Land bekommt eine zarte Grundfaerbung nach
Reichweite (praezise Flaeche), darueber liegt ein radialer Kern um den in den Daten
gepflegten Schwerpunkt. Der Kern strahlt bewusst ueber Grenzen - so wird Togo mit
seiner einzigen Rasterzelle trotzdem als staerkster Standort sichtbar.

Radius und Intensitaet steigen nichtlinear (quadratisch bzw. Exponent 2.2) und die
Reichweite geht logarithmisch ein. Linear wuerde Pakistan die halbe Karte einnehmen
und Mauritius verschwinden; ohne den nichtlinearen Anteil glueht jedes mittlere Land
wie ein Schwerpunkt und die Karte wird eine blaue Flaeche statt einer Aussage.

**Groesse variiert nur leicht.** Der Punktradius laeuft von 0,30 auf 0,40
Rasterabstaende - die Aussage tragen Farbe und Helligkeit, nicht der Durchmesser.
Groessere Punkte wirken schnell unproportional, und ab 0,5 Rasterabstaenden
beruehren sie ihre Nachbarn, womit dichte Regionen wie Westafrika zu einer Flaeche
verschmelzen und die Abstufung unlesbar wird.

**Farbe.** Die Reichweite laeuft ueber eine sequenzielle Rampe in einem Hue
(HF-Blau, streng monoton dunkler). Schwerpunktregionen leuchten stattdessen gold,
in der Legende als eigene Stufe ausgewiesen. Welcher Punkt dazugehoert, wird
**einmal** beim Berechnen der Gewichte entschieden, nicht pro Frame: sonst schiebt
das Atmen Punkte ueber die Schwelle und zurueck, und das Gold blinkt. Ab dieser
Zuordnung aendert die Animation nur noch die Stufe innerhalb einer Rampe, nie die
Rampe selbst. Das Grundraster ist rein grau: "hier sind wir nicht" und "hier sind wir wenig" duerfen nicht verwechselbar
sein. Die Cursor-Aura arbeitet ebenfalls nur in Graustufen, damit sie nie wie ein
Datenwert wirkt.

Die acht Programmfarben sind die offiziellen Logofarben und damit gesetzt. Sie
liegen als Satz allerdings eng beieinander: Community Care (#E1500F) und Disaster
Relief (#E30613) trennt selbst bei normaler Farbsicht nur ΔE 7,5, fuer
Rotgruenblinde ΔE 4,2 - sie sind praktisch dieselbe Farbe. Orphan Care (#F49600)
liegt zusaetzlich unter 3:1 Kontrast zum hellen Grund, Food Security (#B08150) und
Knowledge for Life (#17705A) lesen sich fast als Grau.

Daraus folgt die Regel, an der die Karte gebaut ist: **die Programmfarbe darf nie
allein etwas benennen.** Auf der Karte ist immer nur eine Programmfarbe gleichzeitig
aktiv - im Normalzustand traegt sie die Blau-Rampe, eine Programmfarbe erscheint
erst, wenn genau ein Programm gewaehlt ist. Bei den Symbolen leistet das Motiv die
Unterscheidung (Haus gegen Arztkoffer), und der Programmname steht immer dabei -
sichtbar auf breiten Viewports, sonst als `aria-label`. Dazu die vollstaendige
Tabelle unter der Karte.

**Performance.** Das Grundraster wird einmal in ein Offscreen-Canvas gebacken und
pro Frame mit einem einzigen `drawImage` geblittet. Punkte sind vorgerenderte
Sprites (eine Stufe je Intensitaet), keine `arc()`-Aufrufe pro Frame. Die
Cursor-Aura findet ihre Nachbarn ueber ein Bucket-Gitter, nicht ueber alle 5.500
Punkte.

**Intro.** Die Punkte fallen aus 26 px Hoehe an ihren Platz und blenden dabei ein,
Kontinent fuer Kontinent von West nach Ost: Nordamerika, Suedamerika, Europa,
Afrika, Asien, Ozeanien, mit 180 ms Versatz. Innerhalb eines Kontinents laeuft die
Staffelung diagonal von oben links nach unten rechts - und zwar **relativ zur
Ausdehnung dieses Kontinents**. Ueber die ganze Karte normiert erschien
Nordamerika fast auf einmal, waehrend Ozeanien hinterherhing. So baut sich jeder
Kontinent ueber rund 600 ms auf, zwei bis drei sind gleichzeitig in Bewegung, und
das Ganze steht nach 1,8 Sekunden. Danach erwachen die Standorte.

Die Punkte werden dabei einzeln gezeichnet, nicht als gebackenes Bild - der
Reihenfolge nach ihrer Startzeit vorsortiert. Dadurch ist die Deckkraft entlang der
Schleife monoton, laesst sich auf 12 Stufen quantisieren und kostet nur eine
Handvoll Canvas-State-Wechsel statt tausender. Die Schleife bricht beim ersten
Punkt ab, der noch nicht faellig ist. Gemessen bei 16,7 ms Budget (60 fps): 2,4 ms pro Intro-Frame, 1,7 ms im
Normalbetrieb, 3,9 ms im Zoom mit aktiver Aura.

**Hover-Zoom.** Sobald der Zeiger die Karte beruehrt, faehrt sie auf ZOOM_MAX
(1,34) heran - ohne Anlaufsperre. Eine braucht es nicht: die Feder laeuft weich
an, wer die Karte nur durchquert, loest hoechstens ein Anheben auf 1,07 und ein
sanftes Zurueckfedern aus. Der Zoom ist ein **Anker-Zoom**: der Punkt unter dem Cursor bleibt stehen. Ohne
das rutscht das Land unter der Maus weg, waehrend man es anschaut. Der Anker
zieht dem Cursor traege nach (3,6/s, bewusst langsamer als die Aura) - das
ergibt eine Kamerafahrt statt eines springenden Fixpunkts.

Gefahren wird ueber eine **Feder**, nicht ueber eine Rampe: rund 240 ms bis zum
Ziel mit etwa 4 % Ueberschwinger, dann federt sie ein. Eine reine
ease-out-Rampe fuehlt sich daneben leblos an.

Der Zeitschritt der Federintegration ist nach oben **und unten** begrenzt. Ein
negativer oder sehr grosser Schritt - Frame-Sprung, Tabwechsel - laesst die
Feder sonst aufschwingen statt einzuschwingen; im Test schoss der Zoom dabei auf
das Vierfache.

Umgesetzt als Canvas-Transform um den Anker. Zwei Dinge haengen daran:

- **Sprites tragen Zoom-Reserve.** Sie werden mit `dpr × ZOOM_MAX` gerendert und
  beim Zeichnen skaliert, sonst verwaschen die Punkte beim Heranfahren.
- **Im Zoom wird das Grundraster live gezeichnet**, nicht aus dem gebackenen
  Bild skaliert - das waere unscharf. Punkte ausserhalb des Bildes fallen ueber
  `_viewBounds()` weg; ohne dieses Culling kostet ein Zoom-Frame 6,7 ms statt
  3,9 ms.

Die Fuehrungslinien werden im Zoom ausgeblendet: sie zeigen auf
Kartenpositionen, die sich unter ihnen verschoben haben. Die Programmsymbole
bleiben stehen und treten auf halbe Deckkraft zurueck.

Auf Touch bleibt der Zoom aus (`(hover: hover) and (pointer: fine)`) - dort gibt
es kein Verlassen der Flaeche, der Zoom bliebe nach dem Antippen haengen.

Alle Cursorpositionen laufen deshalb durch `_toWorld()`: Bildschirm- in
Kartenkoordinaten. Landzuordnung, Tooltip und Aura arbeiten in
Kartenkoordinaten, damit die Aura beim Zoom an derselben Stelle der Karte
bleibt und nicht am Bildschirm klebt.

**Cursor-Aura.** Punkte in 108 px Umgebung werden groesser (Radius 0,30 auf 0,48
Rasterabstaende, also +60 %) und dunkler. Die Aura zieht dem Cursor traege nach und
blendet ein und aus, beides zeitbasiert - bei 30 Hz genauso schnell wie bei 120 Hz.
Fuer Punkte ohne Programm bleibt sie in Graustufen, damit sie nie wie ein Datenwert
wirkt. Die vergroesserten Sprite-Saetze werden erst angelegt, wenn tatsaechlich
eine Aura leuchtet.

**Ruhezustand.** Die Regionen atmen mit einer Periode von rund 18 Sekunden, dazu
laeuft eine flache Welle diagonal ueber die Karte. Beides bewusst kaum merklich.
`prefers-reduced-motion` schaltet alles ab und zeigt den Endzustand.

## Fotos

Zwei Ebenen, bewusst unterschiedlich aufdringlich:

**Hover - schwebende Karte am Cursor.** Fahrt man ueber ein Land mit Fotos,
erscheint neben dem Cursor eine Karte mit einem Foto, den Kennzahlen und den
Programmen. Sie ist leicht zum Cursor hin gekippt (`rotateY(-7deg)`, an der
gespiegelten Seite andersherum) und hat zwei gestaffelte Schatten - sie soll
ueber dem Raster schweben, nicht darauf liegen. Das Bild wird erst nach 140 ms
angefordert: beim schnellen Ueberfahren der Karte soll nichts aus dem Netz
gezogen werden. Kommt es zu spaet, weil der Cursor weitergezogen ist, wird es
verworfen. Die Bildhoehe klappt von 0 auf 104 px auf, sobald das Bild da ist -
so springt die Karte nicht.

**Klick - Panel mit Masonry-Gitter.** Ein Panel fährt von unten ein: Land,
Kennzahlen, Programme mit Zahlen und alle Fotos in einem Spaltenraster
(CSS-`columns`, kein starres Grid - die Fotos haben unterschiedliche Formate und
wuerden sonst beschnitten). Auf schmalen Viewports zwei Spalten statt einer,
sonst wird jedes Foto bildschirmfuellend und man scrollt endlos. Escape und der
Schliessen-Knopf beenden es.

**Verworfen: Foto hinter dem Punktraster.** Naheliegend, funktioniert aber nicht.
Bei einer Deckkraft, die die Karte nicht uebertoent (rund 20 %), ist vom Motiv
nur ein grauer Fleck zu sehen - besonders bei Bildern mit dunklem Hintergrund.
Bei mehr Deckkraft verschwinden die Punkte im Bild. Ein brauchbares Fenster
dazwischen gibt es nicht.

### Bildunterschriften

`assets/photos` enthaelt 37 Fotos aus der HF-Bildergalerie und den
News-Beitraegen (2019-2025), zugeordnet zu elf Laendern. In den Daten sind zwei
Felder streng getrennt:

- `alt` beschreibt **neutral, was im Bild zu sehen ist** - fuer Screenreader.
- `caption` nennt **nur die belegte Quelle**, also das Album oder den Beitrag
  ("Togo 2024", "Erdbeben Tuerkei und Syrien, 2023").

Was ein Bild inhaltlich zeigt - welches Projekt, welcher Ort, welches Programm -
steht absichtlich **nicht** dort. Aus dem Bild allein ist das nicht ableitbar,
und eine falsche Bildunterschrift ist bei einer Hilfsorganisation schlimmer als
keine. Diese Zeilen muss das HF-Team ergaenzen.

## Daten pflegen

`data/locations.json`:

```jsonc
{
  "programs": [ { "id": "water-for-life", "name": "…", "color": "#2a78d6", "icon": "droplet" } ],
  "locations": [
    {
      "id": "togo",
      "iso": "TG",          // verbindet den Standort mit dem Laenderraster
      "name": "Togo",
      "lat": 8.6,           // Kernpunkt des Hotspots im Land
      "lon": 0.9,           //   (z.B. Tharparkar statt Zentrum Pakistans)
      "tier": "focus",      // focus = HF Deutschland eigenstaendig, network = HFI
      "activities": [
        { "program": "water-for-life", "beneficiaries": 340000, "projects": 260, "verified": true }
      ]
    }
  ]
}
```

`iso` ist verbindlich - darueber findet die Karte die Rasterzellen des Landes.
`lat`/`lon` bestimmen nur, wo der Hotspot innerhalb des Landes sitzt.

Fotos kommen als `photos`-Array an denselben Standort:

```jsonc
"photos": [
  { "src": "assets/photos/tg-1.jpg",
    "alt": "Grosse Versammlung von Menschen unter Baeumen",
    "caption": "Reisebericht Togo, November 2023" }
]
```

Das erste Foto erscheint in der Hover-Karte, alle im Detail-Panel. Standorte ohne
`photos` funktionieren normal - dann zeigt die Karte nur Kennzahlen.

> **Alle `beneficiaries` und `projects` sind Platzhalter.** Belegt von
> humanityfirst.de sind die acht Programme, die elf Laender eigenstaendiger Arbeit
> und die mit `"verified": true` markierten Eintraege. Die `network`-Liste ist eine
> Annahme und muss gegen die offizielle HFI-Laenderliste abgeglichen werden.

## Einbinden

Die Karte haengt an nichts: ein `<div>`, zwei Dateien aus `src/` und eine JSON
mit den Daten. Kein Build-Schritt, keine Abhaengigkeiten, keine Netzwerkaufrufe
zur Laufzeit ausser den Fotos.

```html
<link rel="stylesheet" href="/assets/hf-dot-map.css">
<div id="hf-hero-map"></div>
<script type="module">
  import { HFDotMap } from '/assets/hf-dot-map.js';
  const data = await fetch('/api/impact').then((r) => r.json());
  new HFDotMap(document.getElementById('hf-hero-map'), data);
</script>
```

`src/landmask.js` und `src/icons.js` werden von `hf-dot-map.js` importiert und
muessen daneben liegen. Die Fotopfade in der JSON sind relativ zur Seite - beim
Einbinden also entweder anpassen oder `assets/photos/` unter demselben Pfad
ausliefern.

Die Daten koennen statisch als JSON-Datei liegen oder aus einem CMS kommen -
die Karte erwartet nur den Aufbau aus dem Abschnitt oben. Sobald die Zahlen
regelmaessig gepflegt werden, lohnt ein Redaktionsmodell mit Feldern fuer Land,
Programm, erreichte Menschen, Projekte und Jahr, das denselben Aufbau
ausliefert. Dann pflegt das Team Zahlen im Backend statt im Code.

## Schnittstellen

Die Karte meldet sich ueber Events am Container:

| Event | Nutzlast | Wofuer |
|---|---|---|
| `hfmap:change` | `{program, beneficiaries, projects, countries}` | Kennzahlen, Legende, Tabelle |
| `hfmap:program` | Programm-ID | Klick auf ein Programm-Symbol |
| `hfmap:select` | `{loc, site}` bzw. Cluster | Klick auf ein Land oder Programmsymbol - oeffnet das Panel |

Optionen: `maxHeight`, `minHeight`, `focusLon` (worauf die Karte zentriert, wenn sie
auf schmalen Viewports seitlich ueberlaeuft).

Die Bewegungsparameter stehen als Konstanten am Kopf von `src/hf-dot-map.js`:
`ZOOM_MAX`, `ZOOM_STIFF`/`ZOOM_DAMP` (Feder), `ZOOM_ANCHOR_EASE`, `AURA_RADIUS`, `AURA_EASE`, sowie die INTRO_*-Werte.

## Barrierefreiheit

- Jedes Programm-Symbol ist ein Button mit `aria-label`, auch wenn der Text auf
  schmalen Viewports ausgeblendet ist.
- Die Programmfarben liegen zum Teil unter 3:1 Kontrast - deshalb steht der
  Programmname immer dabei, und es gibt die vollstaendige Tabelle unter der Karte.
- `prefers-reduced-motion` wird respektiert - Intro, Atmen, Aura-Fade und
  Hover-Zoom entfallen, die Karte zeigt sofort den Endzustand.
- Offen: Tastaturnavigation ueber die Laender selbst (heute nur ueber die Symbole).

## Offene Punkte

- Echte Zahlen einsetzen, `network`-Laenderliste verifizieren.
- Die Icons in `src/icons.js` sind nach den offiziellen Logos nachgezeichnet und auf
  24x24 reduziert. Liegen die Originale als SVG vor, koennen sie direkt ersetzt
  werden - erwartet wird ein 24x24-viewBox mit `currentColor`.
- Die Hex-Werte der Programmfarben sind aus den Logos abgelesen und sollten gegen
  den Brand-Guide geprueft werden.
- Palaestina bekommt bei dieser Rasterweite keine Garantiezelle, weil die
  Nachbarzellen die letzten ihrer Laender sind. Bei `COLS=240` loest sich das.
- Verlinkung der Standorte auf Programm- oder Projektseiten (`hfmap:select`).
- Bildunterschriften mit echtem Projektkontext versehen (siehe oben).
- Fotos fuer die uebrigen Laender - bisher haben elf welche.
- Die Fotos liegen unkomprimiert als JPEG bei je 620 px Breite (2,5 MB
  gesamt). Fuer den Livegang lohnen WebP/AVIF und ein zweiter, kleinerer
  Zuschnitt fuer die Hover-Karte.
