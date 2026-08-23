/**
 * Programm-Icons, nachgezeichnet nach den offiziellen Humanity-First-Logos:
 * gleiche Motive, gleiche offene Linienfuehrung, auf 24x24 reduziert. Die
 * Originale sind fuer Printgroesse gebaut - bei 24 Pixeln muessen Teddy und
 * Getreideaehre vereinfacht werden, sonst verlaufen sie.
 *
 * Farbe kommt immer von currentColor, damit ein Icon sowohl in der
 * Programmfarbe als auch invertiert auf farbigem Grund funktioniert.
 */
const wrap = (d, sw = 1.7) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  // Water for Life - Tropfen mit Glanzbogen
  droplet: wrap(`
    <path d="M12 2.6c0 0 6.9 7.6 6.9 11.9a6.9 6.9 0 0 1-13.8 0C5.1 10.2 12 2.6 12 2.6z"/>
    <path d="M15.9 13.6a3.9 3.9 0 0 1-3.2 4.1"/>`),

  // Disaster Relief - Arztkoffer mit Kreuz
  aidkit: wrap(`
    <path d="M9.6 6V5.1a1.9 1.9 0 0 1 1.9-1.9h1a1.9 1.9 0 0 1 1.9 1.9V6"/>
    <rect x="2.7" y="6" width="18.6" height="14.2" rx="2.7"/>
    <path d="M12.9 9.6h-1.8v2.4H8.7v1.8h2.4v2.4h1.8v-2.4h2.4v-1.8h-2.4z"/>`),

  // Food Security - Getreideaehre: Spitze plus drei Blattpaare
  grain: wrap(`
    <path d="M12 1.8c2.3 2.4 2.3 4.4 0 6.6-2.3-2.2-2.3-4.2 0-6.6z"/>
    <path d="M12 8.4V22"/>
    <path d="M11.5 11.6C7.8 11.6 5.4 9.2 5.4 6.6c3.7 0 6.1 2.4 6.1 5z"/>
    <path d="M12.5 11.6c3.7 0 6.1-2.4 6.1-5-3.7 0-6.1 2.4-6.1 5z"/>
    <path d="M11.5 15.6C7.8 15.6 5.4 13.2 5.4 10.6c3.7 0 6.1 2.4 6.1 5z"/>
    <path d="M12.5 15.6c3.7 0 6.1-2.4 6.1-5-3.7 0-6.1 2.4-6.1 5z"/>
    <path d="M11.5 19.6C7.8 19.6 5.4 17.2 5.4 14.6c3.7 0 6.1 2.4 6.1 5z"/>
    <path d="M12.5 19.6c3.7 0 6.1-2.4 6.1-5-3.7 0-6.1 2.4-6.1 5z"/>`, 1.35),

  // Gift of Sight - Auge mit Iris und Pupille
  eye: wrap(`
    <path d="M1.6 12C4.9 7.1 8.4 4.6 12 4.6S19.1 7.1 22.4 12c-3.3 4.9-6.8 7.4-10.4 7.4S4.9 16.9 1.6 12z"/>
    <circle cx="12" cy="12" r="4.6"/>
    <circle cx="12" cy="12" r="1.5"/>`),

  // Orphan Care - Teddybaer, auf Icongroesse reduziert
  teddy: wrap(`
    <circle cx="8.3" cy="5.2" r="1.9"/>
    <circle cx="15.7" cy="5.2" r="1.9"/>
    <circle cx="12" cy="8" r="4"/>
    <path d="M10.7 7.1h.01M13.3 7.1h.01" stroke-width="1.9"/>
    <path d="M12 9v1.7"/>
    <path d="M8.4 12.3a4.6 4.6 0 0 0-2.7 4.2c0 2.7 2.8 4.6 6.3 4.6s6.3-1.9 6.3-4.6a4.6 4.6 0 0 0-2.7-4.2"/>
    <path d="M6.6 17.2a1.7 1.7 0 1 0 1.9 2.6M17.4 17.2a1.7 1.7 0 1 1-1.9 2.6"/>`, 1.5),

  // Community Care - Haus mit Kuppeldach
  dome: wrap(`
    <path d="M2.6 10.4a9.4 8.2 0 0 1 18.8 0z"/>
    <path d="M4.6 10.4V21h14.8V10.4"/>
    <path d="M9.9 21v-6.6h4.2V21"/>`),

  // Knowledge for Life - offenes Buch
  book: wrap(`
    <path d="M12 6.6C9.6 5.2 6.7 4.7 4.1 4.9v11.9c2.6-.2 5.5.3 7.9 1.7 2.4-1.4 5.3-1.9 7.9-1.7V4.9c-2.6-.2-5.5.3-7.9 1.7z"/>
    <path d="M2.2 7.4V20h19.6V7.4"/>
    <path d="M6.3 8.5c1.6-.2 3 0 4.1.5M6.3 11.5c1.6-.2 3 0 4.1.5M13.6 9c1.1-.5 2.5-.7 4.1-.5M13.6 12c1.1-.5 2.5-.7 4.1-.5"/>`, 1.5),

  // Global Health - Herz mit EKG-Linie
  heartbeat: wrap(`
    <path d="M12 20.4C9.6 18.7 3.6 14.6 3.6 9.6a4.8 4.8 0 0 1 8.4-3 4.8 4.8 0 0 1 8.4 3c0 5-6 9.1-8.4 10.8z"/>
    <path d="M1.6 12.2h6.7l1.8-4.4 2.7 8.4 1.7-4h5.9"/>`, 1.6),

  // Dachmarke Humanity First - Strichfigur
  mark: wrap(`
    <circle cx="12" cy="4.7" r="2.1"/>
    <path d="M5.6 7.4c4 2.7 6 4.5 6.1 6.4-.1 2-2.1 3.9-6.1 6.6"/>
    <path d="M18.4 7.4c-4 2.7-6 4.5-6.1 6.4.1 2 2.1 3.9 6.1 6.6"/>`, 1.6),
};
