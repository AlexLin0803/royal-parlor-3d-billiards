// Procedural high-resolution Canvas2D textures for balls, felt cloth, mahogany wood, and parquet floor

import { BALL_COLORS, FELT_THEMES } from './constants.js';

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Generate an equirectangular texture for billiard ball 0..15
export function createBallTextureCanvas(num) {
  const w = 512;
  const h = 256;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const info = BALL_COLORS[num] || BALL_COLORS[0];

  const ivory = '#f4efe1';

  if (num === 0) {
    // Cue ball: creamy phenolic ivory with subtle Aramith Pro-Cup red alignment dots
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, w, h);

    // Very subtle tonal warmth variation
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,252,240,0.2)');
    grad.addColorStop(0.5, 'rgba(235,226,205,0.0)');
    grad.addColorStop(1, 'rgba(220,210,185,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 4 equatorial red dots (at u = 0, 0.25, 0.5, 0.75) + 2 polar dots
    ctx.fillStyle = '#c82026';
    const r = 10;
    const eqUs = [0.0, 0.25, 0.5, 0.75, 1.0];
    for (const u of eqUs) {
      ctx.beginPath();
      ctx.ellipse(u * w, h * 0.5, r * 1.05, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Polar caps (stretched horizontally in equirectangular projection)
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
    return canvas;
  }

  if (info.stripe) {
    // Striped ball (9..15): creamy ivory poles + crisp colored equatorial band
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, w, h);

    const bandTop = h * 0.21;
    const bandHeight = h * 0.58;
    ctx.fillStyle = info.color;
    ctx.fillRect(0, bandTop, w, bandHeight);

    // Subtle crisp edge highlight on stripe borders
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, bandTop, w, 2);
    ctx.fillRect(0, bandTop + bandHeight - 2, w, 2);
  } else {
    // Solid ball (1..8)
    ctx.fillStyle = info.color;
    ctx.fillRect(0, 0, w, h);
  }

  // Subtle phenolic resin micro-luster variation
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  // Two opposing white number medallions on the equator (u = 0.25 and u = 0.75)
  // In equirectangular projection at latitude 0 (equator), u spans 2*PI and v spans PI,
  // so aspect ratio is 2:1 (w = 512, h = 256 -> 1 pixel in X equals 1 pixel in Y at the equator!)
  const radius = 34;
  const centers = [w * 0.25, w * 0.75];

  for (const cx of centers) {
    const cy = h * 0.5;

    // Outer subtle dark border
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    // Ivory-white medallion circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#faf6eb';
    ctx.fill();

    // Thin inner ring for tournament look
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Crisp numeral
    ctx.fillStyle = '#151518';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = String(num);
    ctx.font = num >= 10
      ? '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      : '800 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(text, cx, cy + 1);

    // Classic underline beneath 6 and 9
    if (num === 6 || num === 9) {
      ctx.fillRect(cx - 12, cy + 18, 24, 3.2);
    }
  }

  return canvas;
}

// Generate worsted wool billiard cloth texture with head string & spots
export function createFeltTextureCanvas(themeKey = 'emerald') {
  const theme = FELT_THEMES[themeKey] || FELT_THEMES.emerald;
  const w = 1024;
  const h = 512;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // Base cloth tone
  ctx.fillStyle = theme.base;
  ctx.fillRect(0, 0, w, h);

  // Subtle overhead lamp warm glow center gradient
  const rad = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, w * 0.58);
  rad.addColorStop(0, 'rgba(255,255,255,0.09)');
  rad.addColorStop(0.65, 'rgba(255,255,255,0.0)');
  rad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, w, h);

  // Woven worsted wool micro-grain
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let y = 0; y < h; y++) {
    const weaveRow = (y & 1) ? 3 : -3;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const weaveCol = ((x + y) & 1) ? 2 : -2;
      const noise = (rand() - 0.5) * 11 + weaveRow * 0.4 + weaveCol * 0.4;
      data[idx]     = Math.max(0, Math.min(255, data[idx] + noise));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + noise));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + noise));
    }
  }
  ctx.putImageData(img, 0, 0);

  // Soft cushion edge ambient shadow around table border
  const edge = 28;
  const topG = ctx.createLinearGradient(0, 0, 0, edge);
  topG.addColorStop(0, 'rgba(0,0,0,0.38)');
  topG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, w, edge);

  const botG = ctx.createLinearGradient(0, h, 0, h - edge);
  botG.addColorStop(0, 'rgba(0,0,0,0.38)');
  botG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = botG;
  ctx.fillRect(0, h - edge, w, edge);

  const leftG = ctx.createLinearGradient(0, 0, edge, 0);
  leftG.addColorStop(0, 'rgba(0,0,0,0.38)');
  leftG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leftG;
  ctx.fillRect(0, 0, edge, h);

  const rightG = ctx.createLinearGradient(w, 0, w - edge, 0);
  rightG.addColorStop(0, 'rgba(0,0,0,0.38)');
  rightG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rightG;
  ctx.fillRect(w - edge, 0, edge, h);

  // Head string (baulk line) at x = -0.56 (u = 0.25 of playing bed)
  // Note: felt UV spans [-halfL - pad, halfL + pad] -> mapped cleanly in mesh.js so u = 0..1 matches exact playing bed!
  ctx.save();
  ctx.strokeStyle = 'rgba(235, 245, 238, 0.26)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, 10);
  ctx.lineTo(w * 0.25, h - 10);
  ctx.stroke();

  // Subtle head spot, center spot, and foot spot
  const spots = [
    { x: w * 0.25, y: h * 0.5, r: 4.5, ring: false },
    { x: w * 0.50, y: h * 0.5, r: 3.5, ring: false },
    { x: w * 0.75, y: h * 0.5, r: 5.5, ring: true }
  ];
  for (const s of spots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 18, 16, 0.55)';
    ctx.fill();
    if (s.ring) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r - 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(240, 245, 240, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  ctx.restore();

  return canvas;
}

// Generate rich lacquered mahogany/walnut wood grain texture
export function createWoodTextureCanvas() {
  const w = 512;
  const h = 512;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#4c2314';
  ctx.fillRect(0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const ny = y / h;
      const warp = Math.sin(nx * Math.PI * 4 + Math.sin(ny * Math.PI * 2) * 0.8) * 0.35
                 + Math.sin(nx * Math.PI * 12 + ny * Math.PI * 2) * 0.12;
      const rings = Math.sin((ny * 18 + warp * 4) * Math.PI);
      const fiber = Math.sin(ny * 210 + nx * 14) * 0.14;
      const grain = rings * 0.5 + 0.5;
      const tone = 0.65 + grain * 0.35 + fiber * 0.12;

      const idx = (y * w + x) * 4;
      data[idx]     = Math.max(0, Math.min(255, Math.floor(96 * tone)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.floor(42 * tone)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.floor(24 * tone)));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Generate dark hardwood parlor floor plank texture
export function createFloorTextureCanvas() {
  const w = 512;
  const h = 512;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1b1411';
  ctx.fillRect(0, 0, w, h);

  const plankH = 64;
  const rows = h / plankH;
  for (let r = 0; r < rows; r++) {
    const y = r * plankH;
    const offset = (r % 2) * 128;
    for (let p = -1; p < 3; p++) {
      const x = p * 256 + offset;
      const shade = 24 + ((r * 17 + p * 31) & 15);
      ctx.fillStyle = `rgb(${shade + 10}, ${shade + 2}, ${shade - 4})`;
      ctx.fillRect(x + 1, y + 1, 254, plankH - 2);

      // Subtle wood streaks inside plank
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      for (let s = 0; s < 5; s++) {
        ctx.fillRect(x + 2, y + 6 + s * 11, 252, 2);
      }
    }
    // Plank seam
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, y, w, 2);
  }

  return canvas;
}
