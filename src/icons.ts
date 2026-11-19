/**
 * Minimalist Geometric SVG Icon Library & Shop Polygon/Level Helpers for Polyminer
 */

function svgIcon(inner: string, size: number = 13, stroke: string = 'currentColor'): string {
  return (
    `<svg class="ui-svg-icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  );
}

export const UI_ICONS = {
  // HUD & Actions
  hull: svgIcon('<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>', 13, '#22c55e'),
  fuel: svgIcon('<rect x="5" y="4" width="10" height="16" rx="1"/><path d="M15 8h2a2 2 0 0 1 2 2v7a1 1 0 0 0 2 0v-6l-2-2"/><rect x="7" y="7" width="6" height="4" fill="#38bdf8" stroke="none" opacity="0.45"/>', 13, '#38bdf8'),
  heat: svgIcon('<path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/><circle cx="12" cy="17" r="1.5" fill="#06b6d4"/>', 13, '#06b6d4'),
  cargo: svgIcon('<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>', 13, '#cbd5e1'),
  coin: svgIcon('<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.5-1 1.5-2.5 1.5-2.5.6-2.5 1.5 1 1.5 2.5 1.5 2.5-.6 2.5-1.5"/>', 13, '#facc15'),
  debt: svgIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>', 13, '#ef4444'),
  coop: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>', 13, '#22d3ee'),
  gamepad: svgIcon('<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M7 12h4M9 10v4"/><circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="17.5" cy="13" r="1" fill="currentColor" stroke="none"/>', 14),
  soundOn: svgIcon('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>', 14),
  soundOff: svgIcon('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M22 9l-6 6M16 9l6 6"/>', 14, '#94a3b8'),
  help: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.8-2.5 2-2.5 4"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/>', 14),
  reset: svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 13, '#f87171'),

  // Consumables & Museum
  repair: svgIcon('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-5.3 5.3 2 2 5.3-5.3a4 4 0 0 0 5.4-5.4l-2 2-2-2 2-2z"/>', 12, '#4ade80'),
  teleporter: svgIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', 12, '#38bdf8'),
  dynamite: svgIcon('<rect x="6" y="7" width="12" height="12" rx="2"/><path d="M12 7V4l3-2"/>', 12, '#facc15'),
  rail: svgIcon('<path d="M7 3v18M17 3v18M7 8h10M7 16h10"/>', 12, '#06b6d4'),
  museum: svgIcon('<path d="M3 10h18M5 10v8M12 10v8M19 10v8M3 19h18M12 4l9 6H3l9-6z"/>', 12, '#f59e0b'),
  lock: svgIcon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 14, '#64748b'),

  // Upgrades & Shop
  drill: svgIcon('<path d="M6 4h12l-6 16L6 4z"/><path d="M8.5 9h7M10 13.5h4"/>', 14, '#eab308'),
  fuelTank: svgIcon('<rect x="5" y="4" width="10" height="16" rx="1"/><path d="M15 8h2a2 2 0 0 1 2 2v7"/><rect x="7" y="7" width="6" height="4" fill="#38bdf8" stroke="none" opacity="0.45"/>', 14, '#38bdf8'),
  engine: svgIcon('<path d="M12 3l4 8v5l-4 3-4-3v-5l4-8z"/><path d="M9.5 18.5L12 22l2.5-3.5"/>', 14, '#f97316'),
  radar: svgIcon('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M19 5a10 10 0 0 1 0 14"/>', 14, '#38bdf8'),
  radiator: svgIcon('<path d="M12 3v18M5 7l14 10M19 7L5 17"/><circle cx="12" cy="12" r="2"/>', 14, '#22d3ee'),
  shop: svgIcon('<path d="M3 9l2-5h14l2 5"/><path d="M4 9v10h16V9"/><rect x="9" y="13" width="6" height="6"/>', 15, '#4ade80'),
  shield: svgIcon('<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>', 13, '#38bdf8'),
  rocket: svgIcon('<path d="M12 3l4 7v5l-4 3-4-3v-5l4-7z"/><path d="M8 14l-3 2v-3l3-2M16 14l3 2v-3l-3-2"/>', 13, '#f8fafc')
} as const;

/**
 * Generates an inline SVG depicting a faceted regular mineral polygon matching canvas geometry.
 */
export function renderPolygonSvg(sides: number, color: string, size: number = 16): string {
  const safeSides = Math.max(3, Math.min(24, Math.floor(sides || 3)));
  const c = size / 2;
  const r = size * 0.43;
  const ir = r * 0.48;
  const ox: number[] = new Array(safeSides);
  const oy: number[] = new Array(safeSides);
  const ix: number[] = new Array(safeSides);
  const iy: number[] = new Array(safeSides);
  const outerPts: string[] = new Array(safeSides);
  const innerPts: string[] = new Array(safeSides);
  const step = (Math.PI * 2) / safeSides;

  for (let i = 0; i < safeSides; i++) {
    const a = -Math.PI / 2 + i * step;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ox[i] = c + r * ca;
    oy[i] = c + r * sa;
    ix[i] = c + ir * ca;
    iy[i] = c + ir * sa;
    outerPts[i] = `${ox[i].toFixed(1)},${oy[i].toFixed(1)}`;
    innerPts[i] = `${ix[i].toFixed(1)},${iy[i].toFixed(1)}`;
  }

  const litBevels: string[] = [];
  const darkBevels: string[] = [];
  const ridges: string[] = [];

  for (let i = 0; i < safeSides; i++) {
    const next = (i + 1) % safeSides;
    const midAngle = -Math.PI / 2 + (i + 0.5) * step;
    const dot = -(Math.cos(midAngle) * 0.7071 + Math.sin(midAngle) * 0.7071);
    const bevelPath =
      `M${ox[i].toFixed(1)},${oy[i].toFixed(1)} ` +
      `L${ox[next].toFixed(1)},${oy[next].toFixed(1)} ` +
      `L${ix[next].toFixed(1)},${iy[next].toFixed(1)} ` +
      `L${ix[i].toFixed(1)},${iy[i].toFixed(1)}Z`;

    if (dot > 0.12) litBevels.push(bevelPath);
    else if (dot < -0.15) darkBevels.push(bevelPath);

    ridges.push(`M${ox[i].toFixed(1)},${oy[i].toFixed(1)} L${ix[i].toFixed(1)},${iy[i].toFixed(1)}`);
  }

  const litPathEl = litBevels.length > 0 ? `<path d="${litBevels.join('')}" fill="rgba(255,255,255,0.34)"/>` : '';
  const darkPathEl = darkBevels.length > 0 ? `<path d="${darkBevels.join('')}" fill="rgba(0,0,0,0.30)"/>` : '';
  const ridgePathEl = `<path d="${ridges.join('')}" stroke="rgba(255,255,255,0.26)" stroke-width="0.65" fill="none"/>`;
  const glintEl =
    safeSides >= 5
      ? `<circle cx="${(c - ir * 0.65).toFixed(1)}" cy="${(c - ir * 0.65).toFixed(1)}" r="${Math.max(0.9, size * 0.065).toFixed(1)}" fill="#ffffff" opacity="0.88"/>`
      : '';

  return (
    `<svg class="ui-svg-icon" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<polygon points="${outerPts.join(' ')}" fill="${color}" stroke="rgba(15,23,42,0.75)" stroke-width="1.15" stroke-linejoin="round"/>` +
    litPathEl +
    darkPathEl +
    ridgePathEl +
    `<polygon points="${innerPts.join(' ')}" fill="rgba(255,255,255,0.26)" stroke="rgba(255,255,255,0.45)" stroke-width="0.6"/>` +
    glintEl +
    `</svg>`
  );
}

/**
 * Generates a segmented 5-bar upgrade level indicator.
 */
export function renderLevelSegmentsHtml(currentLevel: number, maxLevel: number): string {
  const clampedMax = Math.max(1, Math.floor(maxLevel || 1));
  const clampedCur = Math.max(0, Math.min(clampedMax, Math.floor(currentLevel || 0)));
  const isMaxed = clampedCur >= clampedMax;
  let segs = '';
  for (let i = 1; i <= clampedMax; i++) {
    const filledCls = i <= clampedCur ? ' filled' : '';
    const maxedCls = isMaxed && i <= clampedCur ? ' maxed' : '';
    segs += `<span class="level-seg${filledCls}${maxedCls}"></span>`;
  }
  return `<span class="level-segments" aria-label="Seviye ${clampedCur}/${clampedMax}">${segs}</span>`;
}
