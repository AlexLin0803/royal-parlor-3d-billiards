// Regulation 8-foot pool table dimensions (meters) and realistic physics parameters

export const TABLE = {
  // Inner playing surface (cushion nose to cushion nose)
  length: 2.24,      // X axis: -1.12 to +1.12
  width: 1.12,       // Z axis: -0.56 to +0.56
  halfL: 1.12,
  halfW: 0.56,

  // Table height from floor to slate surface (y = 0 is the felt top!)
  surfaceY: 0.0,
  floorY: -0.78,

  // Cushion & outer wood rail geometry
  cushionHeight: 0.037,
  cushionDepth: 0.048,
  railWidth: 0.135,      // Total width from cushion nose to outer wood edge
  railHeight: 0.044,
  apronDepth: 0.145,

  // Pocket dimensions (calibrated to regulation 4.5" corner / 5.1" side openings)
  cornerPocketJaw: 0.082,     // Distance cut back from corner along each straight rail
  sidePocketJaw: 0.066,       // Half-width of side pocket mouth along long rail
  cornerPocketRadius: 0.060,  // Visual & drop well radius
  sidePocketRadius: 0.056,
  cornerDropRadius: 0.059,    // Ball center enters drop zone when closer than this to pocket center
  sideDropRadius: 0.055,
  pocketWellDepth: 0.135,     // How far down a ball falls inside the pocket cup

  // Key table spots (head = -X, foot = +X)
  headSpotX: -0.56,   // Baulk line / kitchen
  footSpotX: 0.56,    // Apex of rack
  centerSpotX: 0.0
};

export const BALL = {
  radius: 0.028575,      // Standard 2.25-inch (57.15mm) billiard ball
  diameter: 0.05715,
  mass: 0.170            // 170 grams
};

export const PHYSICS = {
  gravity: 9.81,
  muSlide: 0.21,         // Sliding friction coefficient (cloth on phenolic resin)
  muRoll: 0.0115,        // Rolling resistance coefficient (natural slow-down)
  muSpin: 0.048,         // Vertical spin (english) decay on cloth
  ballRestitution: 0.945, // Elastic restitution for ball-to-ball impact
  ballFriction: 0.055,   // Subtle tangential throw between balls
  cushionRestitution: 0.80, // Rail bounce restitution
  cushionEnglishFactor: 0.22, // Side-spin deflection off rails
  stopSpeed: 0.0045,     // Linear velocity threshold to snap cleanly to rest
  stopSpin: 0.08,        // Angular velocity threshold to snap cleanly to rest
  minShotSpeed: 0.35,    // Gentle tap (m/s)
  maxShotSpeed: 5.4,     // Powerful break shot (m/s)
  substeps: 6            // Substeps per fixed physics tick for crisp accuracy
};

// 6 pocket centers slightly recessed into the corners and side rails
// Corner pockets sit diagonally slightly outside the (±halfL, ±halfW) intersection
const CORNER_OFFSET = 0.012;
const SIDE_OFFSET = 0.022;

export const POCKETS = [
  // Top-left (head-left)
  { id: 0, name: 'Corner', type: 'corner', x: -TABLE.halfL - CORNER_OFFSET, z: -TABLE.halfW - CORNER_OFFSET, radius: TABLE.cornerPocketRadius, dropRadius: TABLE.cornerDropRadius },
  // Top-middle (side-top)
  { id: 1, name: 'Side',   type: 'side',   x: 0,                            z: -TABLE.halfW - SIDE_OFFSET,   radius: TABLE.sidePocketRadius,   dropRadius: TABLE.sideDropRadius },
  // Top-right (foot-left)
  { id: 2, name: 'Corner', type: 'corner', x:  TABLE.halfL + CORNER_OFFSET, z: -TABLE.halfW - CORNER_OFFSET, radius: TABLE.cornerPocketRadius, dropRadius: TABLE.cornerDropRadius },
  // Bottom-left (head-right)
  { id: 3, name: 'Corner', type: 'corner', x: -TABLE.halfL - CORNER_OFFSET, z:  TABLE.halfW + CORNER_OFFSET, radius: TABLE.cornerPocketRadius, dropRadius: TABLE.cornerDropRadius },
  // Bottom-middle (side-bottom)
  { id: 4, name: 'Side',   type: 'side',   x: 0,                            z:  TABLE.halfW + SIDE_OFFSET,   radius: TABLE.sidePocketRadius,   dropRadius: TABLE.sideDropRadius },
  // Bottom-right (foot-right)
  { id: 5, name: 'Corner', type: 'corner', x:  TABLE.halfL + CORNER_OFFSET, z:  TABLE.halfW + CORNER_OFFSET, radius: TABLE.cornerPocketRadius, dropRadius: TABLE.cornerDropRadius }
];

// Build exact 2D collision segments (straight cushions + angled pocket jaws)
// Each segment: { x1, z1, x2, z2, nx, nz, isJaw } where (nx, nz) points INTO the playing field
export function buildCushionSegments() {
  const HL = TABLE.halfL;
  const HW = TABLE.halfW;
  const cJaw = TABLE.cornerPocketJaw;
  const sJaw = TABLE.sidePocketJaw;
  const jawDepth = 0.055; // How deep the angled jaw facing extends into the pocket throat
  const cAng = 0.038;     // Corner jaw flare
  const sAng = 0.014;     // Side jaw flare

  const raw = [];
  function addSeg(x1, z1, x2, z2, isJaw = false) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    // Left-hand normal; caller winds clockwise so inward normal is (-dz/len, dx/len)
    raw.push({
      x1, z1, x2, z2,
      nx: -dz / len,
      nz: dx / len,
      len,
      isJaw
    });
  }

  // Wind clockwise around playing surface (in X-right, Z-down top view) so inward normal is (-dz, dx)
  // 1. Top-left long cushion (from top-left corner jaw to top-side jaw)
  addSeg(-HL + cJaw, -HW, -sJaw, -HW, false);
  // Top-side pocket jaws
  addSeg(-sJaw, -HW, -sJaw + sAng, -HW - jawDepth, true);
  addSeg( sJaw - sAng, -HW - jawDepth, sJaw, -HW, true);
  // 2. Top-right long cushion
  addSeg(sJaw, -HW, HL - cJaw, -HW, false);

  // Top-right corner jaws
  addSeg(HL - cJaw, -HW, HL - cJaw + cAng, -HW - jawDepth, true);
  addSeg(HL + jawDepth, -HW + cJaw - cAng, HL, -HW + cJaw, true);

  // 3. Right short cushion (foot rail)
  addSeg(HL, -HW + cJaw, HL, HW - cJaw, false);

  // Bottom-right corner jaws
  addSeg(HL, HW - cJaw, HL + jawDepth, HW - cJaw + cAng, true);
  addSeg(HL - cJaw + cAng, HW + jawDepth, HL - cJaw, HW, true);

  // 4. Bottom-right long cushion
  addSeg(HL - cJaw, HW, sJaw, HW, false);
  // Bottom-side pocket jaws
  addSeg(sJaw, HW, sJaw - sAng, HW + jawDepth, true);
  addSeg(-sJaw + sAng, HW + jawDepth, -sJaw, HW, true);
  // 5. Bottom-left long cushion
  addSeg(-sJaw, HW, -HL + cJaw, HW, false);

  // Bottom-left corner jaws
  addSeg(-HL + cJaw, HW, -HL + cJaw - cAng, HW + jawDepth, true);
  addSeg(-HL - jawDepth, HW - cJaw + cAng, -HL, HW - cJaw, true);

  // 6. Left short cushion (head rail)
  addSeg(-HL, HW - cJaw, -HL, -HW + cJaw, false);

  // Top-left corner jaws
  addSeg(-HL, -HW + cJaw, -HL - jawDepth, -HW + cJaw - cAng, true);
  addSeg(-HL + cJaw - cAng, -HW - jawDepth, -HL + cJaw, -HW, true);

  return raw;
}

export const CUSHION_SEGMENTS = buildCushionSegments();

// Standard Aramith billiard ball colors
export const BALL_COLORS = [
  { num: 0,  name: 'Cue',    color: '#f5f0e2', stripe: false },
  { num: 1,  name: 'Yellow', color: '#e8b915', stripe: false },
  { num: 2,  name: 'Blue',   color: '#1b4da8', stripe: false },
  { num: 3,  name: 'Red',    color: '#cf2421', stripe: false },
  { num: 4,  name: 'Purple', color: '#56227a', stripe: false },
  { num: 5,  name: 'Orange', color: '#e35c14', stripe: false },
  { num: 6,  name: 'Green',  color: '#136b3a', stripe: false },
  { num: 7,  name: 'Maroon', color: '#7a1921', stripe: false },
  { num: 8,  name: 'Black',  color: '#161619', stripe: false },
  { num: 9,  name: 'Yellow', color: '#e8b915', stripe: true  },
  { num: 10, name: 'Blue',   color: '#1b4da8', stripe: true  },
  { num: 11, name: 'Red',    color: '#cf2421', stripe: true  },
  { num: 12, name: 'Purple', color: '#56227a', stripe: true  },
  { num: 13, name: 'Orange', color: '#e35c14', stripe: true  },
  { num: 14, name: 'Green',  color: '#136b3a', stripe: true  },
  { num: 15, name: 'Maroon', color: '#7a1921', stripe: true  }
];

export const FELT_THEMES = {
  emerald: {
    name: 'Classic Emerald',
    base: '#166842',
    dark: '#0c442a',
    light: '#1d7d51',
    bounce: [0.06, 0.24, 0.14]
  },
  tournament: {
    name: 'Tournament Blue',
    base: '#1b5b8c',
    dark: '#103b5e',
    light: '#246ea6',
    bounce: [0.07, 0.18, 0.28]
  },
  burgundy: {
    name: 'Royal Burgundy',
    base: '#6e1e2b',
    dark: '#471019',
    light: '#852736',
    bounce: [0.22, 0.06, 0.09]
  }
};
